/**
 * 抖音开放平台 OAuth + 直播数据 API 封装
 * 文档：https://developer.open-douyin.com/
 *
 * 用户需先在抖音开放平台注册开发者 + 创建网站应用 + 申请 video.live.data 能力
 * 在 Vercel 配置 DOUYIN_CLIENT_KEY / DOUYIN_CLIENT_SECRET / DOUYIN_REDIRECT_URI
 *
 * 注：抖音端点 URL 以官方最新文档为准
 */

const CLIENT_KEY = process.env.DOUYIN_CLIENT_KEY || "";
const CLIENT_SECRET = process.env.DOUYIN_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.DOUYIN_REDIRECT_URI || "";

// 授权端点（用户在此页面同意授权）
const AUTHORIZE_URL = "https://open.douyin.com/platform/oauth/connect/";
// Token 端点（用 code 换 access_token）
const TOKEN_URL = "https://open.douyin.com/oauth/access_token/";
// 直播数据端点（实际 URL 需查阅 video.live.data 能力文档）
const LIVE_DATA_URL = "https://open.douyin.com/api/live/data/";

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  open_id: string;
  expires_in: number; // 秒
  scope: string;
  // 错误时
  error?: string;
  description?: string;
}

export interface LiveSession {
  session_id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration: number;
  total_viewers: number;
  peak_viewers: number;
  avg_stay_duration: number;
  orders_count: number;
  gmv: number;
  top_products: Array<{ title: string; sold: number; gmv: number }>;
  retention_curve: Array<{ minute: number; viewers: number }>;
  script_notes: string;
}

/**
 * 生成授权链接（用户点击跳转到抖音授权页）
 */
export function getAuthorizeUrl(state: string): string {
  if (!CLIENT_KEY || !REDIRECT_URI) {
    throw new Error("DOUYIN_CLIENT_KEY 或 DOUYIN_REDIRECT_URI 未配置");
  }
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    response_type: "code",
    scope: "user_info,video.live.data",
    redirect_uri: REDIRECT_URI,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * 用授权 code 换 access_token
 */
export async function exchangeToken(code: string): Promise<TokenResponse> {
  if (!CLIENT_KEY || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error("DOUYIN_CLIENT_KEY/SECRET/REDIRECT_URI 未配置");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  // 抖音返回结构：{ data: { access_token, ... }, message: "success" }
  const inner = data?.data || data;
  if (!inner?.access_token) {
    throw new Error(`Token 换取失败: ${data?.message || data?.description || JSON.stringify(data).slice(0, 300)}`);
  }
  return inner as TokenResponse;
}

/**
 * 刷新 access_token
 */
export async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  if (!CLIENT_KEY || !CLIENT_SECRET) {
    throw new Error("DOUYIN_CLIENT_KEY/SECRET 未配置");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  const inner = data?.data || data;
  if (!inner?.access_token) {
    throw new Error(`Token 刷新失败: ${data?.message || JSON.stringify(data).slice(0, 300)}`);
  }
  return inner as TokenResponse;
}

/**
 * 拉取最近 N 场直播数据
 *
 * 注：实际接口路径与字段需以抖音 video.live.data 能力文档为准
 * 该实现按官方典型 API 结构编写，用户完成认证后如返回字段不符应调整
 */
export async function fetchLiveSessions(
  accessToken: string,
  openId: string,
  count: number
): Promise<LiveSession[]> {
  const params = new URLSearchParams({
    open_id: openId,
    count: String(count),
    cursor: "0",
  });
  const res = await fetch(`${LIVE_DATA_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "access-token": accessToken,
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`直播数据拉取失败 (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const list = data?.data?.list || data?.data?.sessions || [];

  // 适配字段名（抖音返回的字段名可能不同，按需调整）
  return (list as Record<string, unknown>[]).map((s) => ({
    session_id: String(s.session_id || s.live_id || s.id || ""),
    title: String(s.title || s.live_title || ""),
    start_time: String(s.start_time || s.live_start_time || ""),
    end_time: String(s.end_time || s.live_end_time || ""),
    duration: Number(s.duration || s.live_duration || 0),
    total_viewers: Number(s.total_viewers || s.watch_count || s.total_audience_count || 0),
    peak_viewers: Number(s.peak_viewers || s.max_online_user_count || 0),
    avg_stay_duration: Number(s.avg_stay_duration || s.avg_watch_duration || 0),
    orders_count: Number(s.orders_count || s.order_count || 0),
    gmv: Number(s.gmv || s.total_sales || 0),
    top_products: Array.isArray(s.top_products) ? s.top_products : [],
    retention_curve: Array.isArray(s.retention_curve) ? s.retention_curve : [],
    script_notes: String(s.script_notes || ""),
  }));
}
