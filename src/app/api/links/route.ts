import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // 从 sales_daily_stats 获取最新日期数据
    const { data: latestStats, error: statsErr } = await supabase
      .from("sales_daily_stats")
      .select("date, total_amount, total_quantity, total_profit")
      .order("date", { ascending: false })
      .limit(1);

    if (statsErr) {
      console.error("sales_daily_stats 查询失败:", statsErr.message);
    }

    const latest = latestStats && latestStats.length > 0 ? latestStats[0] : null;

    // 从 returns_daily_stats 获取最新退货数据
    const { data: latestReturns, error: retErr } = await supabase
      .from("returns_daily_stats")
      .select("date, total_returned")
      .order("date", { ascending: false })
      .limit(1);

    if (retErr) {
      console.error("returns_daily_stats 查询失败:", retErr.message);
    }

    const latestReturn = latestReturns && latestReturns.length > 0 ? latestReturns[0] : null;

    // 获取所有销售日期列表
    const { data: allDates } = await supabase
      .from("sales_daily_stats")
      .select("date")
      .order("date", { ascending: false });

    const salesDates = (allDates || []).map((row: any) => row.date);

    // 获取所有退货日期列表
    const { data: allReturnDates } = await supabase
      .from("returns_daily_stats")
      .select("date")
      .order("date", { ascending: false });

    const returnDates = (allReturnDates || []).map((row: any) => row.date);

    // 获取 live_selections 表中选中的商品数
    const { data: liveData } = await supabase
      .from("live_selections")
      .select("id");

    const totalLive = (liveData || []).length;

    return NextResponse.json({
      // 快递费/平台费 — 月初清空后归零，当天有销售后恢复（从 sales_daily_stats 读总数）
      latest_shipping_fee: 0,
      latest_platform_fee: 0,
      latest_date: latest ? latest.date : "",
      selected_count: totalLive,
      // 日期列表
      salesDates,
      returnDates,
      totalLive,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}