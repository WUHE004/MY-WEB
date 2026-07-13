# 网页全面代码审查与优化建议

> 审查日期：2026-07-03
> 审查范围：全项目（62 个 API 路由、27 个页面、15 个组件、17 个 SQL schema）
> 审查目标：从专业工程师角度提出全方位优化建议

---

## 一、当前架构概览

- **技术栈**：Next.js 16.2.6 + React 19.2.4 + TypeScript 5 + Tailwind CSS v4 + Supabase (PostgreSQL)
- **部署**：Vercel (Hobby/Pro) + GitHub Actions 自动部署
- **规模**：62 个 API 路由、27 个页面、15 个组件、约 17 个 SQL schema 文件
- **数据库**：Supabase，使用 service_role key（服务端高权限密钥）

---

## 二、严重问题（建议优先修复）

### 🔴 P0-1：密码明文存储（安全漏洞）

**位置**：[src/app/api/members/auth/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/members/auth/route.ts#L68-L89)

**问题**：用户密码以明文形式直接存入 `members.password` 字段，登录时用 `.eq("password", password)` 直接比对。

**风险**：数据库泄露即全部账号暴露，违反基本安全规范。

**建议**：使用 `bcrypt` 或 `argon2` 对密码进行哈希存储；登录时用哈希比对。迁移时对旧密码强制重置。

---

### 🔴 P0-2：鉴权机制形同虚设（安全漏洞）

**位置**：全项目 62 个 API 路由

**问题**：
1. 项目**没有 middleware.ts**，所有路由保护散落在各 API 内部
2. 登录返回的 token 是 `Buffer.from(${member_id}:${Date.now()}).toString("base64")`——**可逆且无签名**，任何人都能伪造
3. heartbeat API 直接接收 `member_id` 参数更新在线状态，**无任何身份验证**，任何人都能设置任意用户上线/下线
4. db-admin 等敏感 API（数据库管理）没有鉴权，理论上任何人都能访问
5. 只有 10 个 API 文件涉及鉴权关键字，其余 50+ 个 API 完全开放

**风险**：恶意用户可伪造身份调用任意 API，篡改数据、删除记录、访问他人订单。

**建议**：
1. 创建 `src/middleware.ts`，对 `/api/admin/*`、`/api/db-admin/*`、`/api/members/*` 等敏感路由统一鉴权
2. 使用 JWT（带密钥签名）替代 Base64 编码的 token
3. db-admin、sync-summary、cleanup 等管理类 API 必须校验 admin 角色
4. 从 token 中提取用户身份，而非让客户端直接传 `member_id`

---

### 🔴 P0-3：next.config.ts 未配置图片域名（功能缺陷）

**位置**：[next.config.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/next.config.ts)

**问题**：配置为空 `const nextConfig: NextConfig = {};`，但项目大量使用 Supabase Storage 外部图片（`<img src="https://xxx.supabase.co/storage/...">`）。

**影响**：
1. 无法使用 `next/image` 优化图片（会导致整个页面降级用 `<img>`，失去懒加载、WebP 转码、尺寸优化）
2. 图片加载慢、流量大，移动端体验差

**建议**：在 next.config.ts 添加：
```ts
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "trae-api-cn.mchost.guru" },
    ],
  },
};
```
然后逐步将 `<img>` 替换为 `<Image>`（优先商品列表、商品卡片等流量大的位置）。

---

## 三、性能问题（建议尽快优化）

### 🟠 P1-1：/api/summary 全表扫描 + N+1 查询

**位置**：[src/app/api/summary/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/summary/route.ts)

**问题**：
1. 每次请求都分页拉取全部 `inbound_records`、`sales_records`、`return_records` 三张表的所有数据（可能数千条）
2. 最后还查一次 `product_display` 表
3. 在服务端内存中做分组、聚合、尺码计算
4. 商品页每 15 秒轮询一次这个接口，压力巨大

**影响**：Vercel Serverless 函数冷启动 + 全表扫描，响应慢，Hobby 计划 10s 超时风险高。

**建议**：
1. 短期：给 API 响应添加 `Cache-Control: s-maxage=15, stale-while-revalidate=30` 头，让 CDN 缓存
2. 中期：将尺码汇总逻辑下推到数据库——用 SQL VIEW 或 RPC 函数（`get_product_summary()`）在数据库端聚合
3. 长期：商品列表只读 `sales_summary` + `inbound_records` 两张表（已聚合），不再扫原始记录

---

### 🟠 P1-2：sync-summary 中循环 await 导致超时

**位置**：[src/app/api/sync-summary/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/sync-summary/route.ts)

**问题**：文件内有 22 处 `await supabase` 调用，且在 for 循环中逐条 upsert（虽然已分批 50 条，但仍是串行 await）。

**影响**：数据量大时 Vercel Serverless 超时，数据不完整（项目记忆中已记录此问题）。

**建议**：
1. 用 `Promise.all` 并行执行不相关的查询
2. upsert 用 Supabase 的 `upsert` 方法 + `onConflict: "sale_id"` 一次性批量
3. 将归档逻辑拆分为独立的小任务（如只处理当天数据），避免一次处理全量

---

### 🟠 P1-3：网页下单库存校验存在并发竞态

**位置**：[src/app/api/web-orders/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/web-orders/route.ts#L129-L161)

**问题**：先查 inbound_total、sold_total、return_total，计算 `currentStock`，然后判断是否充足。两步之间没有事务/锁。

**风险**：高并发下两个用户同时下单同一商品同一尺码，都通过库存校验，导致超卖。

**建议**：
1. 用 PostgreSQL 的行锁：`SELECT ... FOR UPDATE`
2. 或用原子操作：在 `sales_records` 插入后，用 SQL 约束/check 验证库存
3. 或用 Supabase RPC 函数封装整个下单流程，在数据库事务中完成

---

### 🟠 P1-4：数据库缺少关键索引

**位置**：各 SQL schema 文件

**问题**：
1. `return_records` 缺少 `return_time` 索引（现在按 return_time 汇总日期，但索引建立在 created_at 上）
2. `sales_records` 缺少 `order_time` 索引（按 order_time 汇总日期，但索引建立在 registration_date 上）
3. `sales_daily_stats` 和 `returns_daily_stats` 缺少 `date` 索引（links API 按 date 排序查询最新一条）

**建议**：
```sql
CREATE INDEX IF NOT EXISTS idx_return_records_return_time ON return_records(return_time DESC);
CREATE INDEX IF NOT EXISTS idx_sales_records_order_time ON sales_records(order_time DESC);
CREATE INDEX IF NOT EXISTS idx_sales_daily_stats_date ON sales_daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_returns_daily_stats_date ON returns_daily_stats(date DESC);
```

---

## 四、代码质量问题

### 🟡 P2-1：`any` 类型泛滥

**位置**：[src/app/api/summary/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/summary/route.ts#L26) 等多个文件

**问题**：`Record<string, any>[]` 大量使用，违背项目约定"所有 API 响应类型必须定义 TypeScript 接口"。

**建议**：为每张表定义 interface（如 `SalesRecord`、`ReturnRecord`、`InboundRecord`），集中放在 `src/lib/types.ts`。

---

### 🟡 P2-2：错误处理不一致

**位置**：多个 API

**问题**：
1. 有的 API 用 `return NextResponse.json({error}, {status: 500})`，有的用 `throw new Error()`
2. `/api/summary` 对 inboundErr 直接返回 500，但对 salesErr 也返回 500——一个表失败导致全部失败
3. sync-summary 中部分错误只 `console.error` 不返回，前端无法感知

**建议**：统一错误响应格式 `{ success: false, error: string, code: string }`，并创建 `src/lib/api-error.ts` 工具函数。

---

### 🟡 P2-3：SQL Schema 文件分散且重复

**位置**：`src/lib/*.sql` 共 17 个文件

**问题**：
1. `supabase-schema.sql`、`fix-all-tables.sql`、`cleanup-and-members.sql` 存在重复定义
2. `members-fix.sql`、`members-update.sql`、`cleanup-and-members.sql` 三个文件都修改 members 表
3. 没有版本管理，不知道哪个是最新的

**建议**：合并为 `src/lib/migrations/` 目录，按日期编号（如 `001_init.sql`、`002_add_daily_stats.sql`），并在 README 中记录执行顺序。

---

### 🟡 P2-4：db-admin TABLE_COLUMNS 硬编码且过时

**位置**：[src/app/api/db-admin/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/db-admin/route.ts#L5-L28)

**问题**：
1. 表名和列名硬编码在代码里，数据库结构变更后需同步修改代码
2. `sales_summary` 只列了 4 个字段（`id, sale_id, name, created_at`），实际表有更多字段
3. `sales_daily_stats` 缺少 `shipping_fee`、`platform_fee` 字段（最近新增的）
4. 记忆中记录：RPC 自动发现方案已尝试但函数不存在，回退到硬编码

**建议**：
1. 短期：补全硬编码列表，至少包含所有实际字段
2. 长期：在 Supabase 创建 `get_db_tables()` 和 `get_db_columns(table_name)` 两个 RPC 函数，实现动态发现

---

## 五、前端优化建议

### 🟢 P3-1：缺少 Loading 和 Error Boundary

**位置**：部分页面

**问题**：很多页面用 `useState(false)` 管理 loading，但没有统一的 Error Boundary，API 失败时页面白屏或卡在 loading。

**建议**：
1. 在 `src/app/` 下创建 `error.tsx` 全局错误边界
2. 在 `src/app/[route]/loading.tsx` 添加骨架屏
3. 已有 `src/app/loading.tsx`，但内容简单，可优化为品牌化骨架屏

---

### 🟢 P3-2：localStorage 缓存无失效机制

**位置**：[src/app/finance/page.tsx](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/finance/page.tsx#L12-L24)

**问题**：`getCache` 函数虽有 TTL（5 分钟），但缓存的是整个总表数据（可能很大），且刷新页面时先用缓存再请求，可能出现数据不一致。

**建议**：
1. 缓存 key 加版本号，schema 变更时自动失效
2. 用 SWR 或 React Query 替代手动缓存，自动处理 stale-while-revalidate

---

### 🟢 P3-3：心跳机制浪费资源

**位置**：[src/components/heartbeat-provider.tsx](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/components/heartbeat-provider.tsx#L27)

**问题**：每 30 秒发一次心跳，即使用户停留在页面不动。项目记忆约定带 `document.hidden` 检查，但代码中**未实现**。

**建议**：
```ts
const sendHeartbeat = async () => {
  if (document.hidden) return; // 页面不可见时不发送
  // ...原有逻辑
};
```
或将间隔延长到 60 秒，并监听 `visibilitychange` 事件在页面恢复时立即发送。

---

### 🟢 P3-4：CSS 中存在大量内联样式重复

**位置**：[src/app/globals.css](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/globals.css)

**问题**：Neubrutalism 风格的 `border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]` 在多个页面重复出现。

**建议**：已定义了 `neo-card`、`neo-btn` 等工具类，建议全面替换内联样式为工具类，减少 bundle 体积。

---

## 六、DevOps 与工程化建议

### 🔵 P4-1：缺少环境变量校验

**位置**：[src/lib/supabase.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/lib/supabase.ts#L8-L13)

**问题**：运行时才发现环境变量缺失，且错误信息只在服务端日志，前端无感知。

**建议**：创建 `src/lib/env.ts`，在构建时用 zod 校验所有环境变量：
```ts
import { z } from "zod";
const env = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
}).parse(process.env);
```

---

### 🔵 P4-2：缺少测试

**位置**：全项目

**问题**：未找到任何测试文件（`*.test.ts`、`*.spec.ts`），`package.json` 无 test 脚本。

**建议**：
1. 优先为关键业务逻辑添加单元测试：库存计算、价格汇总、日期归档
2. 用 Vitest + Playwright（已安装）做 E2E 测试，覆盖下单、退货、入库流程
3. 在 GitHub Actions 中添加 `npm test` 步骤

---

### 🔵 P4-3：Cron Job 无失败告警

**位置**：[vercel.json](file:///d:/MY%20WORK/dianbigntest/inventory-hub/vercel.json)

**问题**：每月 1 号的清理任务如果失败，用户无法及时知道，可能导致数据未归档就被清空。

**建议**：在 cleanup API 中失败时调用企业微信 webhook 通知（项目已配置 WECHAT_WEBHOOK_URL）。

---

### 🔵 P4-4：PWA Service Worker 未版本化

**位置**：[public/sw.js](file:///d:/MY%20WORK/dianbigntest/inventory-hub/public/sw.js)、[src/app/layout.tsx](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/layout.tsx#L63-L70)

**问题**：Service Worker 注册时无版本号，更新代码后用户可能拿到旧缓存。

**建议**：在 sw.js 中实现 Cache First + Network Fallback 策略，并用文件哈希做版本号。

---

## 七、数据库优化建议

### 🟢 P3-5：用数据库 VIEW 替代服务端聚合

**建议**：创建 `product_summary_view`：
```sql
CREATE VIEW product_summary_view AS
SELECT
  i.sale_id,
  i.name, i.photo, i.manufacturer, i.cost_price, i.shelf_no,
  i.size_80 + i.size_90 + ... AS inbound_total,
  COALESCE(s.sold_total, 0) AS sold_total,
  COALESCE(r.return_total, 0) AS return_total,
  (i.size_80 + ... - COALESCE(s.sold_total, 0) + COALESCE(r.return_total, 0)) AS remaining
FROM inbound_records i
LEFT JOIN (SELECT sale_id, SUM(quantity) AS sold_total FROM sales_records GROUP BY sale_id) s ON ...
LEFT JOIN (SELECT sale_id, SUM(quantity) AS return_total FROM return_records GROUP BY sale_id) r ON ...
```
API 只需 `SELECT * FROM product_summary_view`，无需在服务端聚合。

---

### 🟢 P3-6：考虑用 RPC 函数封装复杂事务

**建议**：将 sync-summary、web-orders POST、cleanup 等复杂逻辑封装为 PostgreSQL 函数，用 `supabase.rpc()` 调用，避免多次往返和超时。

---

## 八、优化优先级汇总

| 优先级 | 问题 | 影响 | 建议时间 |
|--------|------|------|----------|
| 🔴 P0 | 密码明文存储 | 安全 | 立即 |
| 🔴 P0 | 鉴权机制缺失 | 安全 | 立即 |
| 🔴 P0 | next.config 未配图片域名 | 性能 | 立即 |
| 🟠 P1 | /api/summary 全表扫描 | 性能 | 尽快 |
| 🟠 P1 | sync-summary 超时 | 稳定性 | 尽快 |
| 🟠 P1 | 并发竞态超卖 | 数据一致性 | 尽快 |
| 🟠 P1 | 缺少关键索引 | 性能 | 尽快 |
| 🟡 P2 | any 类型泛滥 | 可维护性 | 迭代 |
| 🟡 P2 | 错误处理不一致 | 可维护性 | 迭代 |
| 🟡 P2 | SQL schema 分散 | 可维护性 | 迭代 |
| 🟡 P2 | db-admin 硬编码 | 功能 | 迭代 |
| 🟢 P3 | 前端 Loading/Error | 体验 | 迭代 |
| 🟢 P3 | 心跳未检查 visibility | 资源 | 迭代 |
| 🔵 P4 | 环境变量校验 | 工程化 | 迭代 |
| 🔵 P4 | 缺少测试 | 工程化 | 迭代 |

---

## 九、假设与决策

1. **假设**：项目部署在 Vercel Hobby 计划（10s 超时），如已升级 Pro 计划则部分性能问题可缓解
2. **假设**：用户希望保持现有 Neubrutalism 设计风格，不做 UI 改版
3. **决策**：本计划仅为建议清单，不包含具体实现代码。用户可选择优先级最高的问题单独创建实施计划

---

## 十、验证步骤

实施任何优化后，建议验证：
1. `npx tsc --noEmit` 类型检查通过
2. `npm run build` 构建成功
3. 关键流程 E2E 测试：登录 → 下单 → 退货 → 入库 → 仪表盘显示
4. 检查 Vercel 函数日志确认无超时
5. 移动端实机测试关键页面加载速度
