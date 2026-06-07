import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 返回按日期聚合的售卖数据（用于趋势图）
export async function GET() {
  try {
    let allRecords: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_records")
        .select("order_time, sell_price, quantity")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!chunk || chunk.length === 0) break;
      allRecords = allRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 按日期聚合
    const dailyMap: Record<string, { date: string; amount: number; quantity: number }> = {};
    for (const row of allRecords) {
      const ot = (row.order_time as string) || "";
      if (!ot) continue;
      const date = ot.slice(0, 10);
      if (!dailyMap[date]) {
        dailyMap[date] = { date, amount: 0, quantity: 0 };
      }
      const price = Number(row.sell_price) || 0;
      const qty = Number(row.quantity) || 0;
      dailyMap[date].amount += price * qty;
      dailyMap[date].quantity += qty;
    }

    const result = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}