import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { exchangeToken } from "@/lib/douyin-oauth";

// OAuth 回调：抖音授权后跳回此地址，URL 含 code 与 state
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const cookieState = request.cookies.get("douyin_oauth_state")?.value || "";

    // 校验 state
    if (!code || !state || state !== cookieState) {
      return NextResponse.redirect(`/live/sessions?error=${encodeURIComponent("state 校验失败，请重新授权")}`);
    }

    // 用 code 换 access_token
    const token = await exchangeToken(code);

    // 计算过期时间
    const expiresAt = new Date(Date.now() + (token.expires_in || 86400) * 1000).toISOString();

    // upsert 到 douyin_oauth_tokens（open_id 唯一）
    const { error } = await supabase
      .from("douyin_oauth_tokens")
      .upsert({
        open_id: token.open_id,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: expiresAt,
        scope: token.scope,
        updated_at: new Date().toISOString(),
      }, { onConflict: "open_id" });

    if (error) {
      console.error("[douyin callback] 写入 token 失败:", error.message);
      return NextResponse.redirect(`/live/sessions?error=${encodeURIComponent("token 保存失败: " + error.message)}`);
    }

    // 清理 state cookie
    const res = NextResponse.redirect(`/live/sessions?bound=1&open_id=${encodeURIComponent(token.open_id)}`);
    res.cookies.delete("douyin_oauth_state");
    return res;
  } catch (err) {
    console.error("[douyin callback] 异常:", err);
    const msg = err instanceof Error ? err.message : "服务器异常";
    return NextResponse.redirect(`/live/sessions?error=${encodeURIComponent(msg)}`);
  }
}
