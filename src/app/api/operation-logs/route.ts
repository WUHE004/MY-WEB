import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractUser } from "@/lib/auth";

// GET /api/operation-logs?date=YYYY-MM-DD
// 查询某一天（北京时间）的操作日志，仅管理员，日志只保留 7 天
export async function GET(request: NextRequest) {
  try {
    const user = extractUser(request);
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "无权查看操作日志" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "日期格式应为 YYYY-MM-DD" }, { status: 400 });
    }

    // 北京时间当日 00:00 ~ 次日 00:00（UTC+8 固定偏移，不受服务器时区影响）
    const start = new Date(`${date}T00:00:00+08:00`);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: "无效日期" }, { status: 400 });
    }
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    // 硬限 7 天：早于 7 天前零点的日期直接拒绝
    const sevenDaysAgoStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (start < sevenDaysAgoStart) {
      return NextResponse.json({ error: "日志仅保留 7 天" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("operation_logs")
      .select("id,action,label,operator,target_table,target_id,target_label,detail,created_at")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
