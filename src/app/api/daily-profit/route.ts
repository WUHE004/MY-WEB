import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // 获取所有销售记录
    let allRecords: Record<string, unknown>[] = [];
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

    // 获取所有入库记录的成本价
    let allInbound: Record<string, unknown>[] = [];
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

    // 构建成本价映射
    const costMap: Record<string, number> = {};
    for (const row of allInbound) {
      costMap[row.sale_id as string] = Number(row.cost_price) || 0;
    }

    // 按日期汇总
    const dailyMap: Record<string, { date: string; amount: number; quantity: number; profit: number }> = {};
    for (const row of allRecords) {
      const ot = (row.order_time as string) || "";
      if (!ot) continue;
      const date = ot.slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { date, amount: 0, quantity: 0, profit: 0 };
      const price = Number(row.sell_price) || 0;
      const qty = Number(row.quantity) || 0;
      const cost = costMap[row.sale_id as string] || 0;
      dailyMap[date].amount += price * qty;
      dailyMap[date].quantity += qty;
      dailyMap[date].profit += (price - cost) * qty;
    }

    const result = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}