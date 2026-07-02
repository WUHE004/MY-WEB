# 月度清理存档方案 - 实施计划

## 问题根因

Vercel Cron 每月 1 号凌晨 3 点清空 `sales_records` 和 `return_records`，但以下 4 个 API 直接依赖原始表：

| API | 功能 | 影响 |
|-----|------|------|
| `/api/links` | 操作台快递费、平台费、日期列表 | 全部归零 |
| `/api/sales-trend` | 仪表盘趋势图 | 无数据 |
| `/api/daily-profit` | 仪表盘盈利统计 | 无数据 |
| `/api/sales-dates` | 售卖/退货日期筛选 | 无日期可选 |

## 解决方案

**归档再清空**：每月清空前，先把每日汇总数据保存到新的存档表，然后所有受影响的 API 改为读存档表。

## 数据流

```
月初 3:00 Cron 触发
  ↓
cleanup API 执行:
  1. 从 sales_records 按日期汇总 → upsert 到 sales_daily_stats
  2. 从 return_records 按日期汇总 → upsert 到 returns_daily_stats
  3. 删除 sales_records 全部数据
  4. 删除 return_records 全部数据
  ↓
仪表盘/操作台 → 读 sales_daily_stats / returns_daily_stats（历史数据不丢失）
```

## 改动清单

### 1. 新建存档表（SQL - 在 Supabase 执行）

```sql
-- 售卖每日汇总存档表
CREATE TABLE IF NOT EXISTS sales_daily_stats (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  total_amount NUMERIC DEFAULT 0,
  total_quantity INTEGER DEFAULT 0,
  total_profit NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);

-- 退货每日汇总存档表
CREATE TABLE IF NOT EXISTS returns_daily_stats (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  total_returned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);
```

### 2. 重写 `src/app/api/sales-records/cleanup/route.ts`

**改动**：删除前先按日期归档到 `sales_daily_stats`。

```ts
// 1. 读取所有记录，按日期汇总
// 2. 对每天的数据 upsert 到 sales_daily_stats（累加）
// 3. 确认归档成功后，删除 sales_records
```

### 3. 重写 `src/app/api/return-records/cleanup/route.ts`

**改动**：同上，归档到 `returns_daily_stats`。

### 4. 重写 `src/app/api/sales-trend/route.ts`

**改动**：从 `sales_daily_stats` 读数据，替代 `sales_records` 全表扫描。

```ts
// 旧: supabase.from("sales_records").select("order_time, sell_price, quantity")
// 新: supabase.from("sales_daily_stats").select("date, total_amount, total_quantity")
```

### 5. 重写 `src/app/api/daily-profit/route.ts`

**改动**：从 `sales_daily_stats` 读数据，加上 `inbound_records` 的成本价计算利润。

```ts
// 旧: supabase.from("sales_records").select("order_time, sell_price, quantity, sale_id")
// 新: supabase.from("sales_daily_stats").select("date, total_amount, total_quantity, total_profit")
// 利润直接用存档的 total_profit，无需再查 inbound_records
```

### 6. 重写 `src/app/api/sales-dates/route.ts`

**改动**：从 `sales_daily_stats` / `returns_daily_stats` 读日期。

```ts
// 旧: supabase.from("sales_records").select("order_time")
// 新: supabase.from("sales_daily_stats").select("date")
```

### 7. 重写 `src/app/api/links/route.ts`（操作台快递费/平台费）

**改动**：这个比较特殊——它需要**快递单号**和**售价**来计算快递费，这些数据在日汇总存档中会丢失。有两个子方案：

**子方案 A**：操作台数据改为仅显示"本月累计"（从 `sales_records` 读，月初清空前数据还在），每月 1 号数据暂时为空，等当天有销售数据后恢复。

**子方案 B**：在 `sales_daily_stats` 中额外存储每个日期的快递单号列表和总量，但结构复杂。

**推荐方案 A**：操作台的快递费、平台费本身就是"最新日期"的动态数据，月初清空后显示为 0 是合理的（因为确实还没当天的销售）。同时去掉空数据时的 `return` 提前返回逻辑，改为返回 0 值而不是空对象。

### 8. 更新 `src/app/api/sync-summary/route.ts`

**改动**：在 sync-summary 执行时，同时将每日数据写入 `sales_daily_stats` 和 `returns_daily_stats`。这样即使 cleanup 没跑，日常数据导入后也会自动更新存档表。

## 实施步骤

1. **在 Supabase 执行 SQL** — 创建 `sales_daily_stats` 和 `returns_daily_stats` 表
2. **重写 cleanup 端点** — 2 个文件
3. **重写 4 个受影响的 API** — 4 个文件
4. **修改 sync-summary** — 1 个文件
5. **本地构建验证**
6. **提交并推送**（自动部署到生产）

## 风险评估

| 风险 | 概率 | 缓解 |
|------|------|------|
| 存档表首次无数据，显示为 0 | 确定 | 首次部署后，仪表盘会暂时为空，等下次 sync-summary 或 cleanup 运行后恢复 |
| 存档数据与原始数据不一致 | 低 | 使用 `UNIQUE(date)` 约束 + `upsert` 累加，避免重复 |
| 操作台快递费/平台费月初为空 | 确定 | 月初无销售数据时空值是正常行为，当天有销售后自动恢复 |

## 不影响的功能

- 商品总表 (管理栏) — 使用 `/api/summary`，不依赖原始表
- 商品页 — 同上
- 入库记录 — 不清空 `inbound_records`
- 网页下单 — 使用 `web_orders` 表
- 直播选品 — 使用 `live_selections` 表