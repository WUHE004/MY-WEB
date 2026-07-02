import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // 从 sales_daily_stats 获取有销售的日期
    const { data: salesData, error: salesErr } = await supabase
      .from("sales_daily_stats")
      .select("date")
      .order("date", { ascending: false });

    if (salesErr) {
      console.error("sales_daily_stats 查询失败:", salesErr.message);
    }

    // 从 returns_daily_stats 获取有退货的日期
    const { data: returnsData, error: returnsErr } = await supabase
      .from("returns_daily_stats")
      .select("date")
      .order("date", { ascending: false });

    if (returnsErr) {
      console.error("returns_daily_stats 查询失败:", returnsErr.message);
    }

    const salesDates = (salesData || []).map((row: any) => row.date);
    const returnDates = (returnsData || []).map((row: any) => row.date);

    // 兼容快递费用页面期望的 dates 字段
    return NextResponse.json({ salesDates, returnDates, dates: salesDates });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}