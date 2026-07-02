import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 手动触发日统计归档：从 sales_records 和 return_records 回填到 daily_stats 表
export async function POST() {
  try {
    const diagnostics: string[] = [];

    // ========== 1. 回填 sales_daily_stats ==========
    let allSalesRecords: Record<string, any>[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_records")
        .select("order_time, sell_price, quantity, sale_id")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      allSalesRecords = allSalesRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }
    diagnostics.push(`读取 ${allSalesRecords.length} 条销售记录`);

    // 获取入库成本价
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
      costMap[String(row.sale_id || "").toUpperCase()] = Number(row.cost_price) || 0;
    }

    // 按日期汇总
    const dailyMap: Record<string, { date: string; total_amount: number; total_quantity: number; total_profit: number }> = {};
    for (const row of allSalesRecords) {
      const ot = String(row.order_time || "");
      if (!ot) continue;
      const date = ot.slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { date, total_amount: 0, total_quantity: 0, total_profit: 0 };
      const price = Number(row.sell_price) || 0;
      const qty = Number(row.quantity) || 0;
      const cost = costMap[String(row.sale_id || "").toUpperCase()] || 0;
      dailyMap[date].total_amount += price * qty;
      dailyMap[date].total_quantity += qty;
      dailyMap[date].total_profit += (price - cost) * qty;
    }

    let salesSynced = 0;
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
      salesSynced++;
    }
    diagnostics.push(`销售日统计归档: ${salesSynced} 天`);

    // ========== 2. 回填 returns_daily_stats ==========
    let allReturnRecords: Record<string, any>[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("return_records")
        .select("created_at, quantity")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      allReturnRecords = allReturnRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }
    diagnostics.push(`读取 ${allReturnRecords.length} 条退货记录`);

    const retDailyMap: Record<string, { date: string; total_returned: number }> = {};
    for (const row of allReturnRecords) {
      const ct = String(row.created_at || "");
      if (!ct) continue;
      const date = ct.slice(0, 10);
      if (!retDailyMap[date]) retDailyMap[date] = { date, total_returned: 0 };
      retDailyMap[date].total_returned += Number(row.quantity) || 0;
    }

    let returnsSynced = 0;
    for (const [, stats] of Object.entries(retDailyMap)) {
      const { data: existing } = await supabase
        .from("returns_daily_stats")
        .select("id, total_returned")
        .eq("date", stats.date)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("returns_daily_stats")
          .update({
            total_returned: Number(existing.total_returned) + stats.total_returned,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("returns_daily_stats").insert(stats);
      }
      returnsSynced++;
    }
    diagnostics.push(`退货日统计归档: ${returnsSynced} 天`);

    return NextResponse.json({
      success: true,
      sales_synced: salesSynced,
      returns_synced: returnsSynced,
      message: `已归档 ${salesSynced} 天销售数据, ${returnsSynced} 天退货数据`,
      diagnostics,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("backfill-daily-stats error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}