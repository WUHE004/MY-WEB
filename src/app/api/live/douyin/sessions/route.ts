import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 查询当前绑定状态 + 已保存的直播场次（最多 3 场）
export async function GET() {
  try {
    // 1. 读取绑定 token（只返回 open_id，不返回 token 本身）
    const { data: tokenRow } = await supabase
      .from("douyin_oauth_tokens")
      .select("open_id, expires_at, scope, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const bound = !!tokenRow;

    if (!bound) {
      return NextResponse.json({ bound: false, sessions: [] });
    }

    // 2. 读取最近 3 场直播
    const { data: sessions, error } = await supabase
      .from("douyin_live_sessions")
      .select("*")
      .eq("open_id", tokenRow!.open_id)
      .order("fetched_at", { ascending: false })
      .limit(3);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      bound: true,
      open_id: tokenRow!.open_id,
      expires_at: tokenRow!.expires_at,
      sessions: sessions || [],
    });
  } catch (err) {
    console.error("[douyin sessions GET] 异常:", err);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
