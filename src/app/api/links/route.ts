import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // 全部查询并行（原先串行 5 个查询 + 2 个全表日期列表，~1.8s）
    // 日期列表已删除：无调用方使用（finance 页用的是 /api/sales-dates）
    const [latestStatsRes, latestReturnsRes, latestSelRes] = await Promise.all([
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
      // 直播选品: 最近一次选品时间(取最新一条)
      supabase
        .from("live_selections")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    if (latestStatsRes.error) {
      console.error("sales_daily_stats 查询失败:", latestStatsRes.error.message);
    }
    if (latestReturnsRes.error) {
      console.error("returns_daily_stats 查询失败:", latestReturnsRes.error.message);
    }
    if (latestSelRes.error) {
      console.error("live_selections 查询失败:", latestSelRes.error.message);
    }

    const latest =
      latestStatsRes.data && latestStatsRes.data.length > 0
        ? latestStatsRes.data[0]
        : null;

    // 最近选品日期(北京时间) + 当日选品款数
    let selected_date = "";
    let selected_count = 0;
    const latestSel = latestSelRes.data && latestSelRes.data[0]?.created_at;
    if (latestSel) {
      const d = new Date(latestSel);
      const bj = new Date(d.getTime() + (8 * 60 + d.getTimezoneOffset()) * 60000);
      const start = new Date(Date.UTC(bj.getFullYear(), bj.getMonth(), bj.getDate()) - 8 * 3600000);
      const end = new Date(start.getTime() + 24 * 3600000);
      const cntRes = await supabase
        .from("live_selections")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString());
      if (cntRes.error) {
        console.error("live_selections 计数失败:", cntRes.error.message);
      }
      selected_count = cntRes.count || 0;
      selected_date = `${bj.getFullYear()}-${String(bj.getMonth() + 1).padStart(2, "0")}-${String(bj.getDate()).padStart(2, "0")}`;
    }

    return NextResponse.json({
      latest_shipping_fee: latest ? Number(latest.shipping_fee) || 0 : 0,
      latest_platform_fee: latest ? Number(latest.platform_fee) || 0 : 0,
      latest_date: latest ? latest.date : "",
      selected_count,
      selected_date,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
