# 网页加载速度优化 - 实施计划

## 摘要

核心问题：`/api/summary` 每次请求对三张大表（`inbound_records`、`sales_records`、`return_records`）做全表扫描，在内存中重新计算所有商品的库存，导致响应时间 3-8 秒。

优化方案：利用已有的预聚合表 `sales_summary` 和 `returns_summary`（每次导入数据时自动更新）替代原始表扫描，同时增加 HTTP 缓存头。

## 不影响现有功能

- **不修改任何前端页面代码** — 只改 API 路由
- **API 返回格式不变** — 字段名、数据结构完全一致
- **预聚合表已存在且自动维护** — `sync-summary` 在数据导入后自动触发
- **网页版正常使用不受影响** — Vercel 部署后即可生效

---

## 改动清单

### 改动 1: 重写 `src/app/api/summary/route.ts`（核心优化）

**当前逻辑**（约 230 行，3 次全表扫描）：
```
1. 分页拉取全部 inbound_records(*) → 全表扫描
2. 分页拉取全部 sales_records(*) → 全表扫描（最耗时）
3. 分页拉取全部 return_records(*) → 全表扫描
4. 拉取 product_display
5. 内存中 for 循环计算每个 sale_id 的汇总
```

**优化后逻辑**（约 140 行，1 次全表扫描）：
```
1. 分页拉取全部 inbound_records（仅必要字段）→ 1 次扫描
2. 分页拉取全部 sales_summary（已有预聚合，行数远小于 sales_records）
3. 分页拉取全部 returns_summary（已有预聚合，行数远小于 return_records）
4. 拉取 product_display
5. 按 sale_id JOIN 三个表，直接加减计算
```

**关键代码改动**：

```ts
// 旧: 从 sales_records 逐条累计
for (const row of salesData) {
  const qty = Number(row.quantity) || 0;
  entry.sold_total += qty;
  entry[sizeKey] = (Number(entry[sizeKey]) || 0) - qty;
}

// 新: 从 sales_summary 直接取预聚合值
const salesSummary = salesSummaryMap.get(saleId);
if (salesSummary) {
  entry.sold_total = salesSummary.total_sold || 0;
  for (const s of SIZES) {
    entry[`size_${s}`] = (Number(entry[`size_${s}`]) || 0) - (Number(salesSummary[`size_${s}`]) || 0);
  }
}
```

**性能对比**：

| 指标 | 旧方案 | 新方案 |
|------|--------|--------|
| 扫描 sales_records | 全部行（假设 5000+） | 0（改用 sales_summary） |
| 扫描 return_records | 全部行（假设 500+） | 0（改用 returns_summary） |
| sales_summary 行数 | - | ~200 行（每种商品 1 行） |
| 预计 API 响应时间 | 3-8 秒 | 300-800ms |

---

### 改动 2: 添加 `Cache-Control` 响应头

在 `/api/summary/route.ts` 的 GET 函数返回前，添加缓存头：

```ts
const response = NextResponse.json(result);
response.headers.set("Cache-Control", "public, max-age=10, s-maxage=30, stale-while-revalidate=15");
return response;
```

**效果**：
- `max-age=10`: 浏览器 10 秒内重复请求直接用缓存，0ms 响应
- `s-maxage=30`: Vercel CDN 缓存 30 秒，减少服务器压力
- `stale-while-revalidate=15`: 缓存过期后先返回旧数据，后台刷新

---

### 改动 3: 调整轮询间隔（可选）

在 `src/app/products/page.tsx` 第 126 行，将轮询间隔从 15 秒改为 30 秒：

```tsx
// 旧
}, 15000);

// 新
}, 30000);
```

---

### 改动 4: 添加 Supabase 数据库索引（可选）

在 Supabase SQL Editor 中执行，加速 `inbound_records` 查询：

```sql
-- 加速 sale_id 分组查询
CREATE INDEX IF NOT EXISTS idx_inbound_records_sale_id ON inbound_records (sale_id);

-- 加速 sales_summary 查询
CREATE INDEX IF NOT EXISTS idx_sales_summary_sale_id ON sales_summary (sale_id);

-- 加速 returns_summary 查询
CREATE INDEX IF NOT EXISTS idx_returns_summary_sale_id ON returns_summary (sale_id);

-- 加速 product_display 查询
CREATE INDEX IF NOT EXISTS idx_product_display_sale_id ON product_display (sale_id);
```

---

## 实施步骤

1. **修改 `src/app/api/summary/route.ts`** — 重写为使用预聚合表
2. **添加 Cache-Control 头** — 同一文件中
3. **调整轮询间隔** — `src/app/products/page.tsx` 中 15s → 30s
4. **执行 SQL 索引** — 在 Supabase Dashboard SQL Editor 中
5. **本地构建验证** — `npm run build` 确保无编译错误
6. **提交并推送** — 部署到 Vercel 生产环境
7. **验证** — 打开商品页，观察加载速度

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| sales_summary 数据不是最新 | 低 | 低 | sync-summary 在导入数据后自动触发；也可手动点"汇总数据"按钮 |
| 返回数据格式变化 | 低 | 高 | 本地测试验证字段完全一致后再部署 |
| 索引创建失败 | 极低 | 低 | 索引创建失败不影响功能，只是优化减效 |

## 回滚方案

如果优化后出现问题，只需将 `src/app/api/summary/route.ts` 恢复到当前版本，其他改动不影响核心功能。