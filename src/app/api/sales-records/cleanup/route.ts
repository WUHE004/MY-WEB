import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Vercel Cron Job: 每月1号凌晨3点归档并清空 sales_records 表
export async function GET() {
  try {
    // 1. 读取所有销售记录，按日期汇总
    let allRecords: Record<string, any>[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_records")
        .select("order_time, sell_price, quantity, sale_id")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      allRecords = allRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 获取入库记录的成本价
    let allInbound: Record<string, any>[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("inbound_records")
        .select("sale_id, cost_price")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      allInbound = allInbound.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    const costMap: Record<string, number> = {};
    for (const row of allInbound) {
      costMap[row.sale_id as string] = Number(row.cost_price) || 0;
    }

    // 按日期汇总
    const dailyMap: Record<string, { date: string; total_amount: number; total_quantity: number; total_profit: number }> = {};
    for (const row of allRecords) {
      const ot = (row.order_time as string) || "";
      if (!ot) continue;
      const date = ot.slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { date, total_amount: 0, total_quantity: 0, total_profit: 0 };
      const price = Number(row.sell_price) || 0;
      const qty = Number(row.quantity) || 0;
      const cost = costMap[row.sale_id as string] || 0;
      dailyMap[date].total_amount += price * qty;
      dailyMap[date].total_quantity += qty;
      dailyMap[date].total_profit += (price - cost) * qty;
    }

    // 2. Upsert 到 sales_daily_stats（累加）
    for (const [, stats] of Object.entries(dailyMap)) {
      const { data: existing } = await supabase
        .from("sales_daily_stats")
        .select("id, total_amount, total_quantity, total_profit")
        .eq("date", stats.date)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("sales_daily_stats")
          .update({
            total_amount: Number(existing.total_amount) + stats.total_amount,
            total_quantity: Number(existing.total_quantity) + stats.total_quantity,
            total_profit: Number(existing.total_profit) + stats.total_profit,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("sales_daily_stats").insert(stats);
      }
    }

    // 3. 删除所有记录
    const { error: deleteErr } = await supabase
      .from("sales_records")
      .delete()
      .neq("id", 0);

    if (deleteErr) {
      console.error("清理 sales_records 失败:", deleteErr.message);
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    console.log(`[${new Date().toISOString()}] sales_records 已归档并清空（${allRecords.length} 条）`);
    return NextResponse.json({ success: true, message: `已归档 ${allRecords.length} 条记录并清空` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("清理 sales_records 异常:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}