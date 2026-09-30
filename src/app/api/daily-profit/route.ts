import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // 从 sales_daily_stats 读取每日盈利和快递费(渠道化: douyin=抖音 / duoduo=多多)
    const { data: dailyData, error: dailyErr } = await supabase
      .from("sales_daily_stats")
      .select("date, channel, total_amount, total_quantity, total_profit, shipping_fee, platform_fee")
      .order("date", { ascending: true });

    if (dailyErr) {
      console.error("sales_daily_stats 查询失败:", dailyErr.message);
      return NextResponse.json({ error: dailyErr.message }, { status: 500 });
    }

    const stats = (dailyData || []).map((row: any) => ({
      date: row.date,
      channel: row.channel || "douyin",
      total_amount: Number(row.total_amount) || 0,
      total_quantity: Number(row.total_quantity) || 0,
      // total_profit 已扣当日退货损失(毛利口径), 前端展示净利时再减快递费/平台抽点
      total_profit: Number(row.total_profit) || 0,
      shipping_fee: Number(row.shipping_fee) || 0,
      platform_fee: Number(row.platform_fee) || 0,
    }));

    return NextResponse.json({ stats });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}