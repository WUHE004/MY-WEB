import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // 从 sales_daily_stats 读取销售趋势
    const { data: salesData, error: salesErr } = await supabase
      .from("sales_daily_stats")
      .select("date, total_amount, total_quantity, total_profit")
      .order("date", { ascending: true });

    if (salesErr) {
      console.error("sales_daily_stats 查询失败:", salesErr.message);
      return NextResponse.json({ error: salesErr.message }, { status: 500 });
    }

    const salesTrend = (salesData || []).map((row: any) => ({
      date: row.date,
      total_amount: Number(row.total_amount) || 0,
      total_quantity: Number(row.total_quantity) || 0,
      total_profit: Number(row.total_profit) || 0,
    }));

    // 从 returns_daily_stats 读取退货趋势
    const { data: returnsData, error: returnsErr } = await supabase
      .from("returns_daily_stats")
      .select("date, total_returned")
      .order("date", { ascending: true });

    if (returnsErr) {
      console.error("returns_daily_stats 查询失败:", returnsErr.message);
    }

    const returnsTrend = (returnsData || []).map((row: any) => ({
      date: row.date,
      total_returned: Number(row.total_returned) || 0,
    }));

    return NextResponse.json({ salesTrend, returnsTrend });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}