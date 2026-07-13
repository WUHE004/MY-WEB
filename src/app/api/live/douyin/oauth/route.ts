import { NextResponse } from "next/server";
import { getAuthorizeUrl } from "@/lib/douyin-oauth";

// OAuth 起步：生成随机 state 写入 cookie，重定向到抖音授权页
export async function GET() {
  try {
    // 生成随机 state（CSRF 防护）
    const state = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    const url = getAuthorizeUrl(state);

    const res = NextResponse.redirect(url);
    // 写入 HttpOnly cookie，回调时校验
    res.cookies.set("douyin_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 分钟内完成授权
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("[douyin oauth] 起步失败:", err);
    const msg = err instanceof Error ? err.message : "服务器异常";
    return NextResponse.redirect(`/live/sessions?error=${encodeURIComponent(msg)}`);
  }
}
