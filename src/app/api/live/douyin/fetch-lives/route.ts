import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchLiveSessions, refreshToken, type LiveSession } from "@/lib/douyin-oauth";

const MAX_SESSIONS = 3; // 仅保留最近 3 场

export async function POST() {
  try {
    // 1. 读取已绑定的 token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("douyin_oauth_tokens")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return NextResponse.json(
        { error: "未绑定抖音账号，请先授权" },
        { status: 400 }
      );
    }

    let accessToken = tokenRow.access_token;
    const now = Date.now();
    const expiresAt = new Date(tokenRow.expires_at).getTime();

    // 2. Token 过期则刷新
    if (now >= expiresAt) {
      try {
        const refreshed = await refreshToken(tokenRow.refresh_token);
        accessToken = refreshed.access_token;
        const newExpiresAt = new Date(Date.now() + (refreshed.expires_in || 86400) * 1000).toISOString();
        await supabase
          .from("douyin_oauth_tokens")
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("open_id", tokenRow.open_id);
      } catch (err) {
        console.error("[fetch-lives] token 刷新失败:", err);
        return NextResponse.json(
          { error: "Token 已过期且刷新失败，请重新授权" },
          { status: 401 }
        );
      }
    }

    // 3. 拉取最近 3 场直播
    let sessions: LiveSession[] = [];
    try {
      sessions = await fetchLiveSessions(accessToken, tokenRow.open_id, MAX_SESSIONS);
    } catch (err) {
      console.error("[fetch-lives] 拉取失败:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "直播数据拉取失败" },
        { status: 502 }
      );
    }

    if (sessions.length === 0) {
      return NextResponse.json({ sessions: [], synced: 0, message: "暂无直播数据" });
    }

    // 4. 逐场 upsert（onConflict: session_id）
    const upsertRows = sessions.map((s) => ({
      session_id: s.session_id,
      open_id: tokenRow.open_id,
      title: s.title,
      start_time: s.start_time || null,
      end_time: s.end_time || null,
      duration: s.duration,
      total_viewers: s.total_viewers,
      peak_viewers: s.peak_viewers,
      avg_stay_duration: s.avg_stay_duration,
      orders_count: s.orders_count,
      gmv: s.gmv,
      top_products: s.top_products,
      retention_curve: s.retention_curve,
      script_notes: s.script_notes,
      fetched_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from("douyin_live_sessions")
      .upsert(upsertRows, { onConflict: "session_id" });

    if (upsertErr) {
      return NextResponse.json({ error: "写入失败: " + upsertErr.message }, { status: 500 });
    }

    // 5. 清理：保留最近 3 场，删除多余的旧记录
    const { data: allSessions } = await supabase
      .from("douyin_live_sessions")
      .select("id, session_id, fetched_at")
      .eq("open_id", tokenRow.open_id)
      .order("fetched_at", { ascending: false });

    if (allSessions && allSessions.length > MAX_SESSIONS) {
      const toDelete = allSessions.slice(MAX_SESSIONS).map((r) => r.id);
      await supabase.from("douyin_live_sessions").delete().in("id", toDelete);
    }

    return NextResponse.json({
      sessions: upsertRows,
      synced: upsertRows.length,
      cleaned: allSessions && allSessions.length > MAX_SESSIONS ? allSessions.length - MAX_SESSIONS : 0,
    });
  } catch (err) {
    console.error("[fetch-lives] 异常:", err);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
