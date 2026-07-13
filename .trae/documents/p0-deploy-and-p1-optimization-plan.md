# P0 部署 + P1 性能优化实施计划

> 创建日期：2026-07-03
> 前置条件：P0 安全修复代码已写好并通过 `tsc` 检查，尚未提交/部署
> 用户选择：先部署 P0，再规划实施 P1 性能优化

---

## 一、当前状态分析

### P0 安全修复（已编码，待部署）
通过 `git status` 确认，以下 10 个文件已修改/新增但未提交：
- **新增**：`src/lib/auth.ts`（密码哈希 + JWT）、`src/proxy.ts`（Next.js 16 鉴权代理）、`.trae/documents/code-review-optimization-suggestions.md`
- **修改**：`next.config.ts`（图片域名）、`src/app/api/members/auth/route.ts`（哈希+JWT登录）、`src/app/api/members/heartbeat/route.ts`（可信身份）、`src/app/api/members/route.ts`（哈希密码）、`src/app/login/page.tsx`（设置cookie）、`src/app/profile/page.tsx`（清除cookie）、`src/components/heartbeat-provider.tsx`（Bearer token + visibility检查）

### P1 性能问题（待实施）
通过阅读源码确认的 4 个性能问题：

1. **P1-1 `/api/summary` 全表扫描**（[route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/summary/route.ts)）
   - 每次请求分页拉取 `inbound_records` + `sales_records` + `return_records` + `product_display` 四张表全量数据
   - 在服务端内存做分组聚合、尺码计算
   - 商品页每 15 秒轮询一次，Vercel Hobby 10s 超时风险高
   - 无任何缓存头

2. **P1-2 `sync-summary` 串行 await + N+1 查询**（[route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/sync-summary/route.ts)）
   - sales_records、inbound_records、return_records 三表分页查询是串行的，可并行
   - 日统计归档（第 591-630 行）对每个日期执行 `select maybeSingle` + `update/insert`，是 N+1 模式
   - `getSalesSummaryColumns()` 用递归 upsert+delete 探测列名，每次调用产生多次往返

3. **P1-3 `web-orders` 并发竞态**（[route.ts#L129-L161](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/web-orders/route.ts#L129-L161)）
   - 先查 inbound_total、sold_total、return_total 计算库存，再判断是否充足
   - 两步之间无事务/锁，高并发下可能超卖
   - **风险评估**：本项目是库存管理后台，非高并发电商，实际超卖概率低；但仍是数据一致性隐患

4. **P1-4 数据库缺少关键索引**
   - `return_records` 缺少 `return_time` 索引（按 return_time 汇总日期，现有索引在 created_at）
   - `sales_records` 缺少 `order_time` 索引（按 order_time 汇总日期，现有索引在 registration_date）
   - `sales_records(sale_id)` 和 `return_records(sale_id)` 有单列索引，但 web-orders 的 `.eq("sale_id").eq("size")` 查询可用复合索引优化
   - `sales_daily_stats` 和 `returns_daily_stats` 有 `UNIQUE(date)` 约束，已自动创建索引，无需额外处理

---

## 二、实施方案

### 阶段一：部署 P0 安全修复

#### 步骤 1.1：构建验证
```bash
npm run build
```
- 确认构建成功，无类型错误
- 如失败，根据错误信息修复后重新构建

#### 步骤 1.2：提交并推送
```bash
git add src/lib/auth.ts src/proxy.ts next.config.ts \
  src/app/api/members/auth/route.ts \
  src/app/api/members/heartbeat/route.ts \
  src/app/api/members/route.ts \
  src/app/login/page.tsx \
  src/app/profile/page.tsx \
  src/components/heartbeat-provider.tsx

git commit -m "feat(security): P0 安全修复 - 密码哈希、JWT鉴权、图片域名配置

- 密码改用 scrypt 哈希存储，兼容旧明文自动迁移
- 新增 proxy.ts 统一 API 鉴权（admin/operator/登录校验）
- 登录返回 JWT（带签名），替代可逆 Base64 token
- heartbeat 使用 proxy 注入的可信身份
- next.config.ts 配置 supabase + trae-api 图片域名
- 登录设置 cookie，登出清除 cookie（支持 sendBeacon 鉴权）
- heartbeat 添加 visibility 检查，间隔延长到 60s"

git push origin master
```
- 推送后 GitHub Actions 自动触发 Vercel 部署
- 部署完成后验证：登录、退出、心跳、管理员页面访问

---

### 阶段二：P1 性能优化

#### P1-1：`/api/summary` 添加缓存头（快速优化）

**文件**：[src/app/api/summary/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/summary/route.ts)

**改动**：在 `GET()` 返回的 `NextResponse` 上添加缓存头，让 Vercel CDN 缓存响应，减轻 Serverless 函数压力。

```ts
// 第 232 行附近，return NextResponse.json(result) 改为：
const response = NextResponse.json(result);
// CDN 缓存 15 秒，过期后后台刷新 30 秒内仍返回旧数据
response.headers.set("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
return response;
```

**为什么不直接改用 summary 表**：项目记忆记录"使用 sales_summary/returns_summary 导致商品展示不完整，需全表扫描原始记录"。因此短期只加缓存头，不改数据源。

**注意**：catch 分支的错误响应不加缓存头。

---

#### P1-2：`sync-summary` 并行化查询 + 批量化日统计

**文件**：[src/app/api/sync-summary/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/sync-summary/route.ts)

**改动 1：并行读取三张表**
将 sales_records、inbound_records、return_records 的分页读取改为 `Promise.all` 并行执行（当前是串行）。

```ts
// 第 119-247 行，将三段 while 循环读取改为并行：
const [salesResult, inboundResult, returnsResult] = await Promise.all([
  readAllPages("sales_records", "*"),
  readAllPages("inbound_records", "sale_id, photo, shelf_no, manufacturer, name, cost_price, sell_price"),
  readAllPages("return_records", "*"),
]);
```

抽取一个 `readAllPages(table, select)` 辅助函数复用分页逻辑。

**改动 2：批量 upsert 日统计（消除 N+1）**
当前日统计归档（第 591-630 行）对每个日期执行 `select maybeSingle` + `update/insert`。改为：
1. 一次性 `select * from sales_daily_stats where date in (...)` 获取所有已存在日期
2. 在内存中计算 update/insert
3. 用 `upsert(batch, { onConflict: "date" })` 一次性批量写入

```ts
// 伪代码：
const allDates = Array.from(dailyMap.keys());
const { data: existingStats } = await supabase
  .from("sales_daily_stats")
  .select("*")
  .in("date", allDates);

const existingMap = new Map(existingStats?.map(s => [s.date, s]) || []);
const upsertBatch = allDates.map(date => {
  const existing = existingMap.get(date);
  const stats = dailyMap.get(date)!;
  return {
    date,
    total_amount: (Number(existing?.total_amount) || 0) + stats.total_amount,
    total_quantity: (Number(existing?.total_quantity) || 0) + stats.total_quantity,
    total_profit: (Number(existing?.total_profit) || 0) + stats.total_profit,
    shipping_fee: (Number(existing?.shipping_fee) || 0) + stats.shippingFee,
    platform_fee: (Number(existing?.platform_fee) || 0) + stats.platformFee,
  };
});
await supabase.from("sales_daily_stats").upsert(upsertBatch, { onConflict: "date" });
```

退货日统计同理批量化。

**改动 3：移除列探测的递归 upsert+delete**
`getSalesSummaryColumns()` 和 `probeColumns()` 用递归 upsert+delete 探测列名，产生多次往返。改为：直接用固定的完整列集 upsert（Supabase 会忽略不存在的列吗？不会，会报错）。因此保留探测逻辑但缓存结果到模块级变量，避免每次调用都探测。

```ts
// 模块级缓存
let cachedSalesCols: string[] | null = null;
let cachedReturnCols: string[] | null = null;
```

---

#### P1-3：`web-orders` 并发竞态（文档化 + 轻量缓解）

**文件**：[src/app/api/web-orders/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/web-orders/route.ts)

**风险评估**：本项目是内部库存管理后台，并发量低，实际超卖概率极低。完整修复需要 PostgreSQL 行锁或 RPC 事务函数，需要数据库端操作。

**本次改动（轻量缓解）**：
1. 在库存检查处添加注释说明竞态风险
2. 将库存检查的三个查询改为 `Promise.all` 并行（减少检查窗口时间）

```ts
// 第 132-153 行改为：
const [inboundResult, salesResult, returnResult] = await Promise.all([
  supabase.from("inbound_records").select(sizeKey).eq("sale_id", saleId),
  supabase.from("sales_records").select("quantity").eq("sale_id", saleId).eq("size", size),
  supabase.from("return_records").select("quantity").eq("sale_id", saleId).eq("size", size),
]);
```

**后续完整修复（不在本次范围）**：创建 PostgreSQL RPC 函数 `create_web_order(...)` 在数据库事务中完成库存校验+插入，用 `SELECT ... FOR UPDATE` 加行锁。

---

#### P1-4：添加数据库索引（SQL 迁移文件）

**新文件**：`src/lib/migrations/002_add_performance_indexes.sql`

```sql
-- P1-4 性能索引补全
-- 在 Supabase SQL Editor 中执行

-- 退货按退货日期汇总（sync-summary 用 return_time 分组）
CREATE INDEX IF NOT EXISTS idx_return_records_return_time
  ON return_records(return_time DESC);

-- 售出按订单日期汇总（sync-summary 用 order_time 分组）
CREATE INDEX IF NOT EXISTS idx_sales_records_order_time
  ON sales_records(order_time DESC);

-- web-orders 库存校验：按 sale_id + size 查询
CREATE INDEX IF NOT EXISTS idx_sales_records_sale_id_size
  ON sales_records(sale_id, size);

CREATE INDEX IF NOT EXISTS idx_return_records_sale_id_size
  ON return_records(sale_id, size);

-- web_orders 按会员查询
CREATE INDEX IF NOT EXISTS idx_web_orders_member_id
  ON web_orders(member_id, created_at DESC);
```

**注意**：此 SQL 需要用户在 Supabase SQL Editor 手动执行（代码无法直接操作数据库结构）。

---

## 三、假设与决策

1. **假设**：项目部署在 Vercel Hobby 计划（10s 超时），`Cache-Control` 头能有效减轻 `/api/summary` 压力
2. **假设**：并发量低，web-orders 竞态用并行查询缓解即可，完整事务修复留待后续
3. **决策**：不改 `/api/summary` 的数据源（仍全表扫描），因项目记忆记录改用 summary 表会导致商品展示不完整；仅加 CDN 缓存
4. **决策**：P1-4 索引通过 SQL 文件提供，由用户在 Supabase SQL Editor 执行，不自动执行
5. **决策**：sync-summary 的列探测逻辑保留（因表结构可能变化），但加模块级缓存避免重复探测

---

## 四、验证步骤

### P0 部署后验证
1. 访问 `/login` 页面，使用现有账号登录 → 成功跳转首页
2. 检查 localStorage 中 `member_token` 是 JWT 格式（三段式 `xxx.yyy.zzz`）
3. 检查 cookie 中有 `member_token`
4. 访问需管理员权限的页面（如 db-admin）→ 非管理员被拦截
5. 退出登录 → cookie 被清除，跳转首页
6. 旧明文密码用户首次登录 → 自动升级为哈希，登录成功

### P1 优化后验证
1. `npx tsc --noEmit` 类型检查通过
2. `npm run build` 构建成功
3. `/api/summary` 响应头包含 `Cache-Control: s-maxage=15, stale-while-revalidate=30`
4. `sync-summary` 执行时间显著缩短（通过 diagnostics 日志对比）
5. web-orders 下单流程正常（库存校验、订单创建、售卖记录、日统计）
6. 在 Supabase SQL Editor 执行索引 SQL 后，查询性能提升

---

## 五、实施顺序

1. ✅ 阶段一：部署 P0（构建 → 提交 → 推送 → 验证部署）
2. 阶段二：P1 优化
   - P1-4 创建索引 SQL 文件（最简单，先做）
   - P1-1 `/api/summary` 加缓存头（一行代码）
   - P1-2 `sync-summary` 并行化 + 批量化（改动较大）
   - P1-3 `web-orders` 并行查询（轻量缓解）
3. 类型检查 + 构建验证
4. 提交推送 P1 优化
5. 用户在 Supabase SQL Editor 执行索引 SQL
