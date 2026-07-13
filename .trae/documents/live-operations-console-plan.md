# 直播运营操作台 - 实施计划

## 一、需求总结

在操作栏 `/links` 页面新增"直播运营操作台"区块，下方包含三个子按钮：

| 按钮 | 功能 | 数据来源 | 数据保留策略 |
|------|------|----------|--------------|
| 赛道资讯 | 童装母婴赛道每日资讯（热门话题/前十主播/直播时间/抖音话题/运营参考） | Tavily AI 搜索 + Agnes 总结 | 仅保留当天数据，每日凌晨自动刷新 |
| 直播资讯 | 自动爬取抖音直播间每场数据（下单/留人/话术等） | 抖音开放平台 OAuth + 直播数据 API | 仅保留最近 3 场直播 |
| 拍摄脚本 | 用户输入拍摄想法 → Agnes 生成完整脚本；无想法时提供参考 | Agnes 文本对话 API | 不持久化（前端展示+可复制） |

## 二、当前状态分析（Phase 1 探索结论）

### 2.1 操作栏架构
- 主页面：[src/app/links/page.tsx](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/links/page.tsx) — 路由 `/links`，标题"库存操作台"
- **关键澄清**：按钮全部硬编码在 page.tsx 中，**不从 /api/links 加载**。`/api/links` 只返回卡片显示的数值（快递费/平台抽点/直播选品数等）
- 交互模式：统一用 Next.js `<Link href>` 路由跳转，**无弹窗、无 inline 展开**
- 已有 `live/select`、`live/daily-select` 两个直播相关页面，可作子页面参考
- 后台操作台区块用 `!isOperator && (...)` 包裹（仅管理员可见）

### 2.2 Agnes API 调用方式
- Base URL：`https://apihub.agnes-ai.com/v1`
- 文本对话端点：`POST /chat/completions`，model `agnes-2.0-flash`
- 鉴权：`Authorization: Bearer ${process.env.AGNES_API_KEY}`
- 请求体：`{ model, messages: [{role, content}], max_tokens, temperature }`
- 响应解析：`data.choices[0].message.content`
- 已有 503 重试包装 `agnesImageFetch`（max 3 次，3s 间隔）可复用思路
- 关键参考：[src/app/api/photo-gen/generate/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/generate/route.ts) 第 244-266 行 `callAgnesTextModel`

### 2.3 CSV 导出实现
- 纯前端实现：`Blob` + `URL.createObjectURL` + 隐藏 `<a>` 下载
- BOM 头：`"\uFEFF"` 前缀保证 Excel 中文不乱码
- 字段转义：含 `,` `"` `\n` 时用双引号包裹，内部 `"` 转义为 `""`
- 关键参考：[src/app/finance/page.tsx](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/finance/page.tsx) 第 489-535 行 `handleExport`；[src/components/db-admin-panel.tsx](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/components/db-admin-panel.tsx) 第 199-219 行（多检查 `\n` 更稳健，新功能按此实现）

### 2.4 Supabase 客户端
- 文件：[src/lib/supabase.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/lib/supabase.ts)
- 使用 `SUPABASE_SERVICE_ROLE_KEY`（绕过 RLS），仅服务端可用
- 导出名：`supabase`（懒加载 Proxy 模式）

### 2.5 关键技术约束
- **Bing Search API 已于 2025-08-11 全面停用**，赛道资讯改用 Tavily AI（免费 1000 次/月，专为 LLM 设计，密钥格式 `tvly-dev-xxx`）
- **Vercel Serverless 超时**：Hobby 10s / Pro 60s — 不适合做长爬虫，但 Tavily 单次搜索 < 3s 可行
- **抖音开放平台 OAuth 流程**：需用户先去 open.douyin.com 注册开发者 + 创建网站应用 + 申请 `video.live.data` 等直播数据权限 + 实名认证
- **AGENTS.md 规则**：本项目 Next.js 版本与训练数据有 breaking changes，编码前需查阅 `node_modules/next/dist/docs/` 对应文档

## 三、架构设计

### 3.1 整体路由结构
```
/links                              # 操作栏主页（修改：新增"直播运营操作台"区块）
  └─ /live/operations               # 新建：直播运营操作台聚合页（3 个子按钮卡片）
       ├─ /live/track-news          # 新建：赛道资讯页
       ├─ /live/sessions            # 新建：直播资讯页（含 OAuth 绑定入口）
       └─ /live/shoot-script        # 新建：拍摄脚本页
```

### 3.2 数据库表设计（4 张新表）

#### 表1：`live_track_news`（赛道资讯，每日覆盖）
```sql
CREATE TABLE live_track_news (
  id BIGSERIAL PRIMARY KEY,
  date TEXT UNIQUE NOT NULL,             -- YYYY-MM-DD，每日 upsert 覆盖
  hot_topics JSONB,                      -- [{topic, heat, related_videos:[]}]
  top_anchors JSONB,                     -- [{nickname, followers, live_time, category}]
  douyin_hashtags JSONB,                 -- [{tag, usage_count, trend}]
  category_insights TEXT,                -- Agnes 总结的运营参考（Markdown）
  raw_search_results JSONB,              -- 原始 Tavily 结果（备查）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 表2：`douyin_oauth_tokens`（用户抖音授权令牌，仅 1 行）
```sql
CREATE TABLE douyin_oauth_tokens (
  id BIGSERIAL PRIMARY KEY,
  open_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 表3：`douyin_live_sessions`（直播场次数据，保留最近 3 场）
```sql
CREATE TABLE douyin_live_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,        -- 抖音直播场次 ID
  open_id TEXT NOT NULL,
  title TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration INT,                           -- 秒
  total_viewers INT,                      -- 累计观看
  peak_viewers INT,                       -- 峰值在线
  avg_stay_duration INT,                  -- 平均停留秒
  orders_count INT,                       -- 下单数
  gmv NUMERIC,                            -- 成交额
  top_products JSONB,                     -- [{title, sold, gmv}]
  retention_curve JSONB,                  -- [{minute, viewers}] 留人曲线
  script_notes TEXT,                      -- 话术记录（如有）
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dls_openid ON douyin_live_sessions(open_id);
```

#### 表4：`live_shoot_scripts`（拍摄脚本历史，可选，便于复用）
```sql
CREATE TABLE live_shoot_scripts (
  id BIGSERIAL PRIMARY KEY,
  user_idea TEXT,                         -- 用户输入的想法（空表示"无想法"模式）
  script_content TEXT NOT NULL,           -- Agnes 生成的脚本（Markdown）
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
> 注：拍摄脚本不强制持久化，但保留历史可让用户复用，按 created_at 倒序保留最近 20 条。

## 四、详细实施步骤

### 阶段 1：基础架构 + 拍摄脚本（可立即上线，无外部依赖）

#### 步骤 1.1：修改操作栏主页
**文件**：[src/app/links/page.tsx](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/links/page.tsx)

**改动**：
- 在 import 中添加 `Radio` 图标（lucide-react）
- 在"后台操作台"区块下方（`!isOperator && (...)` 内）新增一个"直播运营操作台"卡片，`<Link href="/live/operations">`，配色用 `bg-[#FF6B6B]` 与现有卡片协调
- 卡片样式参考现有"直播选品"卡片（保持 2px 深灰边框、16px 圆角、Neubrutalism 风格）

#### 步骤 1.2：新建直播运营操作台聚合页
**文件**：`src/app/live/operations/page.tsx`（新建）

**结构**：
- 顶部返回入口 `<Link href="/links">`
- 标题"直播运营操作台"
- 3 个卡片按钮（参考 links 页 operationButtons 数组写法）：
  - 赛道资讯 → `/live/track-news`，图标 `TrendingUp`，配色 `bg-[#4A90E2]`
  - 直播资讯 → `/live/sessions`，图标 `Radio`，配色 `bg-[#9B59B6]`
  - 拍摄脚本 → `/live/shoot-script`，图标 `Clapperboard`，配色 `bg-[#FFC93C]`

#### 步骤 1.3：拍摄脚本后端 API
**文件**：`src/app/api/live/shoot-script/route.ts`（新建）

**逻辑**：
- POST 接收 `{ idea: string }`，idea 可为空字符串
- 复用 [src/app/api/photo-gen/generate/route.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/app/api/photo-gen/generate/route.ts) 第 244-266 行 `callAgnesTextModel` 模式
- prompt 设计（中文输入中文输出）：
  ```
  你是童装抖音直播拍摄导演。${idea ? `用户今日拍摄想法：${idea}` : `用户暂无想法，请提供 3 个不同主题的童装拍摄参考方案供选择`}。
  请输出完整拍摄脚本，包含：
  1. 拍摄主题与目标受众
  2. 场景布置（背景/灯光/道具）
  3. 模特造型建议（服装搭配/姿势/表情）
  4. 分镜脚本（5-8 个镜头，每个含时长/画面/旁白/字幕）
  5. BGM 与音效建议
  6. 预期互动钩子（点赞/评论引导点）
  输出格式：Markdown，要点清晰可执行。
  ```
- model `agnes-2.0-flash`，max_tokens 1500，temperature 0.7
- 503 重试包装（复用 agnesImageFetch 思路，改名为 `agnesFetch`）
- 返回 `{ script: string }`

#### 步骤 1.4：拍摄脚本前端页面
**文件**：`src/app/live/shoot-script/page.tsx`（新建）

**UI 结构**：
- 顶部返回入口 + 标题"拍摄脚本生成"
- 文本域 `<textarea>` 输入今日拍摄想法（占位符："例如：今天想拍 3 套夏季连衣裙，户外公园场景..."）
- 两个按钮：
  - 主按钮"生成脚本"：发送 idea → 展示 Markdown 渲染结果
  - 次按钮"我没想法，给我参考"：发送空 idea → 展示 3 个参考方案
- 结果区用 `react-markdown` 或简单的 `<pre>` + 白名单渲染（项目现有依赖检查后决定，避免新增依赖）
- 底部"复制全部"按钮（`navigator.clipboard.writeText`）
- 历史记录区（可选，读取 live_shoot_scripts 最近 5 条，点击复用）

### 阶段 2：赛道资讯（需 Tavily API Key）

#### 步骤 2.1：Tavily 客户端封装
**文件**：`src/lib/tavily.ts`（新建）

**接口**：
```ts
export async function tavilySearch(query: string, maxResults = 5): Promise<TavilyResult[]>
```
- Endpoint：`POST https://api.tavily.com/search`
- Header：`Content-Type: application/json`
- Body：`{ api_key: process.env.TAVILY_API_KEY, query, max_results, search_depth: "advanced", include_answer: true }`
- 类型定义：
  ```ts
  interface TavilyResult { title: string; url: string; content: string; score: number; }
  interface TavilyResponse { answer?: string; results: TavilyResult[]; }
  ```

#### 步骤 2.2：环境变量登记
**文件**：[src/lib/env.ts](file:///d:/MY%20WORK/dianbigntest/inventory-hub/src/lib/env.ts)

**新增**：
- `TAVILY_API_KEY`（可选，描述"Tavily AI 搜索 API Key，格式 tvly-dev-xxx"）
- `DOUYIN_CLIENT_KEY`（可选，描述"抖音开放平台应用 Client Key"）
- `DOUYIN_CLIENT_SECRET`（可选，描述"抖音开放平台应用 Client Secret"）
- `DOUYIN_REDIRECT_URI`（可选，描述"抖音 OAuth 回调地址，如 https://yourdomain.com/api/live/douyin/callback"）
- `CRON_SECRET`（可选，描述"Vercel Cron 端点保护密钥"）

#### 步骤 2.3：赛道资讯生成 API
**文件**：`src/app/api/live/track-news/route.ts`（新建）

**GET 逻辑**（读取当日数据）：
- 查询 `live_track_news` 表，`eq("date", today)` 返回单条记录
- 若无数据返回 `{ data: null, message: "今日资讯尚未生成" }`

**POST 逻辑**（手动触发生成，需鉴权）：
1. 并行执行 6 个 Tavily 搜索查询：
   - `"抖音 童装 母婴 热门话题 ${today}"`
   - `"抖音 童装直播 带货榜 头部主播 ${today}"`
   - `"童装 抖音 直播时间 黄金时段 ${today}"`
   - `"抖音 童装 热门话题标签 hashtag ${today}"`
   - `"童装母婴 抖音 选品 趋势 ${today}"`
   - `"童装直播 话术 留人技巧 ${today}"`
2. 合并所有 Tavily 结果为 `raw_search_results`（JSONB）
3. 调 Agnes 文本对话，prompt：
   ```
   你是童装母婴赛道抖音运营分析师。基于以下搜索结果，输出一份完整的当日赛道资讯报告（Markdown）：
   
   要求结构化输出：
   ## 一、热门话题（前 10，含热度指数）
   ## 二、前十抖音主播（昵称/粉丝数/直播时间/主打品类）
   ## 三、抖音热门话题标签（含使用量趋势）
   ## 四、童装类目运营参考（3-5 条可执行建议，对标分析）
   
   搜索结果：
   ${JSON.stringify(rawResults).slice(0, 8000)}
   ```
   model `agnes-2.0-flash`，max_tokens 2000，temperature 0.3
4. 同时让 Agnes 输出结构化 JSON（用第二次调用，prompt 要求"将上述报告转为 JSON：{hot_topics:[], top_anchors:[], douyin_hashtags:[]}"），max_tokens 1500，temperature 0.1
5. upsert 到 `live_track_news` 表（onConflict: "date"）
6. 返回 `{ data: savedRow, diagnostics: [...] }`

#### 步骤 2.4：Vercel Cron 自动触发
**文件**：`src/app/api/live/track-news/cron/route.ts`（新建）

**逻辑**：
- GET 接收 Vercel Cron 调用（Header 含 `Authorization: Bearer ${CRON_SECRET}` 校验）
- 内部转发到 POST `/api/live/track-news`（直接调用同一处理函数，不走 HTTP）
- 返回 `{ success: true, date: today }`

**vercel.json**（项目根目录，若不存在则新建）：
```json
{
  "crons": [
    { "path": "/api/live/track-news/cron", "schedule": "0 3 * * *" }
  ]
}
```
> 北京时间 03:00 自动刷新（Vercel Cron 用 UTC，需调整为 `0 19 * * *` 即 UTC 19:00 = 北京 03:00）

#### 步骤 2.5：赛道资讯前端页面
**文件**：`src/app/live/track-news/page.tsx`（新建）

**UI 结构**：
- 顶部返回入口 + 标题"赛道资讯" + 日期标签（显示数据日期）
- 操作栏：
  - "刷新数据"按钮（调 POST，loading 状态）
  - "一键导出 CSV"按钮（导出当日结构化数据）
  - "一键导出 Markdown"按钮（导出 category_insights 全文）
- 内容区：
  - 若 `data` 为 null：空状态提示"今日资讯尚未生成，点击刷新"
  - 若有数据：
    - 三个折叠卡片：热门话题 / 前十主播 / 抖音话题（展开后显示表格）
    - 一段 Markdown 渲染：运营参考（category_insights）
- 自动加载：useEffect 首次进入调 GET
- 导出 CSV 实现：复用 finance/page.tsx handleExport 模式，BOM 头 + 字段转义

### 阶段 3：直播资讯（需用户完成抖音开放平台认证）

#### 步骤 3.1：用户前置操作（非代码）
用户需完成：
1. 访问 https://open.douyin.com/ 注册开发者账号（个人实名认证）
2. 创建"网站应用"，获取 `Client Key` 和 `Client Secret`
3. 申请能力：`video.live.data`（直播数据）、`user_info`（用户信息）
4. 配置回调地址：`https://你的域名/api/live/douyin/callback`
5. 在 Vercel 环境变量配置 `DOUYIN_CLIENT_KEY` / `DOUYIN_CLIENT_SECRET` / `DOUYIN_REDIRECT_URI`

#### 步骤 3.2：抖音 OAuth 封装
**文件**：`src/lib/douyin-oauth.ts`（新建）

**导出函数**：
```ts
// 生成授权链接
export function getAuthorizeUrl(state: string): string;
// 用 code 换 access_token
export async function exchangeToken(code: string): Promise<TokenResponse>;
// 刷新 token
export async function refreshToken(refreshToken: string): Promise<TokenResponse>;
// 拉取最近 N 场直播数据
export async function fetchLiveSessions(accessToken: string, openId: string, count: number): Promise<LiveSession[]>;
```
- 授权端点：`https://open.douyin.com/platform/oauth/connect/?client_key=...&response_type=code&scope=user_info,video.live.data&redirect_uri=...&state=...`
- Token 端点：`https://open.douyin.com/oauth/access_token/`（POST JSON）
- 直播数据端点：参考抖音开放平台 `video.live.data` 文档（具体 URL 编码时再查）
- 类型定义完整：`TokenResponse { access_token, refresh_token, open_id, expires_in, scope }`、`LiveSession { session_id, title, start_time, end_time, ... }`

#### 步骤 3.3：OAuth 起步路由
**文件**：`src/app/api/live/douyin/oauth/route.ts`（新建）

**GET 逻辑**：
- 生成随机 state（写入 cookie 防 CSRF）
- 返回 NextResponse.redirect 到 `getAuthorizeUrl(state)`

#### 步骤 3.4：OAuth 回调路由
**文件**：`src/app/api/live/douyin/callback/route.ts`（新建）

**GET 逻辑**：
- 校验 state（与 cookie 比对）
- 用 code 调 `exchangeToken` 获取 token
- upsert 到 `douyin_oauth_tokens` 表（open_id 唯一）
- 重定向到 `/live/sessions?bound=1`（前端展示"绑定成功"提示）

#### 步骤 3.5：拉取直播数据 API
**文件**：`src/app/api/live/douyin/fetch-lives/route.ts`（新建）

**POST 逻辑**：
1. 从 `douyin_oauth_tokens` 读取最新 token
2. 若 `expires_at` 过期，先调 `refreshToken`
3. 调 `fetchLiveSessions` 拉取最近 3 场直播
4. 逐场 upsert 到 `douyin_live_sessions`（onConflict: "session_id"）
5. 清理：删除该 open_id 下 `fetched_at` 最早的记录，仅保留 3 条
6. 返回 `{ sessions: [...], synced: N }`

#### 步骤 3.6：直播资讯前端页面
**文件**：`src/app/live/sessions/page.tsx`（新建）

**UI 结构**：
- 顶部返回入口 + 标题"直播资讯"
- 授权状态区：
  - 未绑定：显示"绑定抖音账号"按钮（`<a href="/api/live/douyin/oauth">`）
  - 已绑定：显示 open_id + "重新授权" + "拉取最新直播数据"按钮
- 直播场次列表（最多 3 张卡片，按 start_time 倒序）：
  - 卡片标题：直播标题 + 开始时间
  - 关键指标网格：累计观看 / 峰值在线 / 平均停留 / 下单数 / GMV
  - 折叠区1：Top 商品表格（top_products JSONB）
  - 折叠区2：留人曲线（retention_curve JSONB，可用简单 SVG 折线图或纯文本表格，避免引入图表库）
  - 折叠区3：话术记录（script_notes）
- 空状态：未拉取时提示"点击上方按钮拉取直播数据"
- 一键导出 CSV：导出当前 3 场的关键指标

## 五、文件清单总览

### 新建文件（13 个）
| 文件 | 用途 |
|------|------|
| `src/app/live/operations/page.tsx` | 直播运营操作台聚合页 |
| `src/app/live/track-news/page.tsx` | 赛道资讯前端 |
| `src/app/live/sessions/page.tsx` | 直播资讯前端 |
| `src/app/live/shoot-script/page.tsx` | 拍摄脚本前端 |
| `src/app/api/live/track-news/route.ts` | 赛道资讯 GET/POST |
| `src/app/api/live/track-news/cron/route.ts` | Vercel Cron 自动触发 |
| `src/app/api/live/douyin/oauth/route.ts` | OAuth 起步 |
| `src/app/api/live/douyin/callback/route.ts` | OAuth 回调 |
| `src/app/api/live/douyin/fetch-lives/route.ts` | 拉取直播数据 |
| `src/app/api/live/shoot-script/route.ts` | 拍摄脚本生成 |
| `src/lib/tavily.ts` | Tavily 客户端 |
| `src/lib/douyin-oauth.ts` | 抖音 OAuth + API 封装 |
| `vercel.json` | Cron 配置（如不存在） |

### 修改文件（2 个）
| 文件 | 改动 |
|------|------|
| `src/app/links/page.tsx` | 新增"直播运营操作台"卡片入口 |
| `src/lib/env.ts` | 新增 5 个环境变量登记 |

### 数据库变更（4 张新表）
- `live_track_news`（赛道资讯，每日覆盖）
- `douyin_oauth_tokens`（OAuth 令牌）
- `douyin_live_sessions`（直播场次，保留 3 场）
- `live_shoot_scripts`（拍摄脚本历史，可选）

## 六、假设与决策

### 关键决策
1. **架构选择**：采用"聚合页 + 3 个子页面"模式（方案 A），与现有路由跳转模式一致，不引入 inline 展开新交互
2. **拍摄脚本不持久化强制**：表 `live_shoot_scripts` 设为可选，主要靠前端展示和复制
3. **赛道资讯数据源**：Tavily AI 搜索 + Agnes 双调用（先搜索后总结）+ Agnes 二次调用生成结构化 JSON
4. **直播资讯分两阶段**：UI 骨架先行（OAuth 占位"待授权"），用户完成抖音认证后真实数据对接
5. **Cron 时间**：UTC 19:00（北京 03:00）每日自动刷新赛道资讯
6. **不引入图表库**：留人曲线用 SVG 或文本表格，保持依赖精简
7. **角色控制**：直播运营操作台区块放入 `!isOperator && (...)`，仅管理员可见

### 用户需配合事项
1. **赛道资讯上线前**：注册 Tavily 账号（https://tavily.com）获取 `tvly-dev-xxx` API Key，配置到 Vercel 环境变量 `TAVILY_API_KEY`
2. **直播资讯上线前**：
   - 抖音开放平台注册开发者 + 创建网站应用 + 申请 `video.live.data` 权限
   - 在 Vercel 配置 `DOUYIN_CLIENT_KEY` / `DOUYIN_CLIENT_SECRET` / `DOUYIN_REDIRECT_URI`
   - 配置 `CRON_SECRET`（任意随机字符串，用于保护 cron 端点）
3. **数据库建表**：4 张新表需在 Supabase 控制台手动执行 SQL 创建（计划中提供完整 DDL）

### 风险与限制
1. **抖音开放平台审核不确定**：个人开发者申请 `video.live.data` 可能被拒，需企业主体更稳。若被拒，回退到"手动上传 CSV"方案
2. **Tavily 免费配额 1000 次/月**：每日 6 次搜索 × 30 天 = 180 次，余量充足；手动刷新也消耗配额
3. **Agnes 输出 JSON 稳定性**：第二次调用要求输出 JSON 可能不稳定，需在 prompt 中强调"仅输出 JSON，无其他文字"，并在代码中 try/catch + 正则提取
4. **抖音 API 文档时效**：本计划中抖音端点 URL 基于通用知识，编码时需以 https://developer.open-douyin.com/ 最新文档为准
5. **Next.js 版本差异**：AGENTS.md 提示有 breaking changes，编码前需查阅 `node_modules/next/dist/docs/` 确认 route handler / Link 用法

## 七、验证步骤

### 阶段 1 验证（拍摄脚本）
1. 访问 `/links`，确认"直播运营操作台"卡片显示，点击跳转 `/live/operations`
2. 聚合页显示 3 个子按钮，点击"拍摄脚本"进入 `/live/shoot-script`
3. 输入想法"今天拍 3 套夏季连衣裙"，点击"生成脚本"，5-10 秒内返回完整 Markdown 脚本
4. 点击"我没想法，给我参考"，返回 3 个参考方案
5. 点击"复制全部"，剪贴板内容正确

### 阶段 2 验证（赛道资讯）
1. 配置 `TAVILY_API_KEY` 后访问 `/live/track-news`
2. 点击"刷新数据"，10-15 秒内返回当日资讯（含热门话题/前十主播/抖音话题/运营参考）
3. 刷新页面，数据持久化（GET 读取当日记录）
4. 点击"一键导出 CSV"，下载文件用 Excel 打开中文正常
5. 等待次日 03:00 后访问，数据已自动更新（验证 Vercel Cron）
6. 在 Supabase 检查 `live_track_news` 表仅保留当日 1 条记录（每日覆盖）

### 阶段 3 验证（直播资讯）
1. 访问 `/live/sessions`，未绑定时显示"绑定抖音账号"按钮
2. 点击跳转抖音授权页，授权后回调到 `/live/sessions?bound=1`
3. 点击"拉取最新直播数据"，3-5 秒内返回最近 3 场直播
4. 检查每张卡片显示：标题/时间/累计观看/峰值/平均停留/下单数/GMV/Top商品/留人曲线/话术
5. 在 Supabase 检查 `douyin_live_sessions` 表该 open_id 下最多 3 条记录
6. 点击"一键导出 CSV"，3 场数据完整导出

## 八、实施顺序建议

1. **第一批**（基础架构 + 拍摄脚本，可立即上线无依赖）：
   - 步骤 1.1 修改 links/page.tsx
   - 步骤 1.2 新建 live/operations/page.tsx
   - 步骤 1.3-1.4 拍摄脚本后端 + 前端
   - 建表 `live_shoot_scripts`（可选）
   - 部署验证

2. **第二批**（赛道资讯，需用户配 Tavily Key）：
   - 步骤 2.1-2.2 Tavily 客户端 + 环境变量
   - 步骤 2.3-2.4 赛道资讯 API + Cron
   - 步骤 2.5 赛道资讯前端
   - 建表 `live_track_news`
   - 配置 vercel.json cron
   - 部署验证

3. **第三批**（直播资讯，需用户完成抖音认证）：
   - 步骤 3.1 用户去抖音开放平台认证
   - 步骤 3.2-3.5 OAuth + 拉取 API
   - 步骤 3.6 直播资讯前端
   - 建表 `douyin_oauth_tokens` + `douyin_live_sessions`
   - 部署验证
