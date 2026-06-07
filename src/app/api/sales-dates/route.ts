import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "sales"; // "sales" or "returns"
  const date = searchParams.get("date"); // 可选：按日期筛选 sale_ids
  const table = type === "returns" ? "return_records" : "sales_records";

  // 如果指定了日期，返回该日期的 sale_ids
  if (date) {
    const timeField = type === "returns" ? "return_time" : "order_time";
    const { data, error } = await supabase
      .from(table)
      .select("sale_id")
      .gte(timeField, `${date}T00:00:00`)
      .lt(timeField, `${date}T23:59:59`)
      .order(timeField, { ascending: false });

    if (error) {
      return NextResponse.json({ sale_ids: [], dates: [] });
    }
    const saleIds = Array.from(new Set((data || []).map((r: Record<string, unknown>) => r.sale_id as string)));
    return NextResponse.json({ sale_ids: saleIds, dates: [] });
  }

  // 获取本月有数据的日期
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${year}-${month}`;

  // 获取所有订单时间
  const { data, error } = await supabase
    .from(table)
    .select("order_time")
    .not("order_time", "is", null)
    .order("order_time", { ascending: false });

  if (error) {
    return NextResponse.json({ dates: [] });
  }

  // 提取本月日期并去重
  const dateSet = new Set<string>();
  for (const row of data || []) {
    const ot = (row.order_time as string) || "";
    if (ot.startsWith(prefix)) {
      dateSet.add(ot.slice(0, 10));
    }
  }

  const dates = Array.from(dateSet).sort().reverse();
  return NextResponse.json({ dates });
}