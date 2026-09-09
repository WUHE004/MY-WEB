import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // 全部查询并行（原先串行 5 个查询 + 2 个全表日期列表，~1.8s）
    // 日期列表已删除：无调用方使用（finance 页用的是 /api/sales-dates）
    const [latestStatsRes, latestReturnsRes, liveCountRes] = await Promise.all([
      // 最新日期的快递费/平台抽点（sales_daily_stats 按日期倒序取第一条）
      supabase
        .from("sales_daily_stats")
        .select("date, shipping_fee, platform_fee")
        .order("date", { ascending: false })
        .limit(1),
      // 最新退货数据
      supabase
        .from("returns_daily_stats")
        .select("date, total_returned")
        .order("date", { ascending: false })
        .limit(1),
      // 直播选品数（head 请求只取 count，不拉全部 id）
      supabase
        .from("live_selections")
        .select("id", { count: "exact", head: true }),
    ]);

    if (latestStatsRes.error) {
      console.error("sales_daily_stats 查询失败:", latestStatsRes.error.message);
    }
    if (latestReturnsRes.error) {
      console.error("returns_daily_stats 查询失败:", latestReturnsRes.error.message);
    }
    if (liveCountRes.error) {
      console.error("live_selections 计数失败:", liveCountRes.error.message);
    }

    const latest =
      latestStatsRes.data && latestStatsRes.data.length > 0
        ? latestStatsRes.data[0]
        : null;

    return NextResponse.json({
      latest_shipping_fee: latest ? Number(latest.shipping_fee) || 0 : 0,
      latest_platform_fee: latest ? Number(latest.platform_fee) || 0 : 0,
      latest_date: latest ? latest.date : "",
      selected_count: liveCountRes.count || 0,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
