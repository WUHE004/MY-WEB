import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "sales" | "returns"
    const date = searchParams.get("date"); // YYYY-MM-DD

    // 带参数：返回该日期对应的 sale_ids（用于管理栏日期筛选）
    if (type && date) {
      if (type === "sales") {
        // 从 sales_records 查该日期的 sale_ids
        const { data, error } = await supabase
          .from("sales_records")
          .select("sale_id")
          .gte("order_time", `${date}T00:00:00`)
          .lte("order_time", `${date}T23:59:59`);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const saleIds = Array.from(new Set((data || []).map((r: any) => String(r.sale_id || "").toUpperCase()).filter(Boolean)));
        return NextResponse.json({ sale_ids: saleIds });
      } else if (type === "returns") {
        // 从 return_records 查该日期的 sale_ids（退货日期用 return_time，回退 created_at）
        const { data, error } = await supabase
          .from("return_records")
          .select("sale_id, return_time, created_at");
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const saleIds = Array.from(new Set(
          (data || [])
            .filter((r: any) => {
              const rt = String(r.return_time || r.created_at || "");
              return rt.slice(0, 10) === date;
            })
            .map((r: any) => String(r.sale_id || "").toUpperCase())
            .filter(Boolean)
        ));
        return NextResponse.json({ sale_ids: saleIds });
      }
    }

    // 仅 type 无 date：返回对应类型的日期列表
    // 无参数：返回两类日期列表

    // 销售日期列表（从 sales_records 原始记录表读取，确保只显示实际有数据的日期）
    const { data: salesRecords, error: salesErr } = await supabase
      .from("sales_records")
      .select("order_time");
    if (salesErr) console.error("sales_records 查询失败:", salesErr.message);

    const salesDateSet = new Set<string>();
    for (const r of (salesRecords || []) as any[]) {
      const ot = String(r.order_time || "");
      if (ot) salesDateSet.add(ot.slice(0, 10));
    }
    const salesDates = Array.from(salesDateSet).sort().reverse();

    // 退货日期列表
    const { data: returnRecords, error: returnsErr } = await supabase
      .from("return_records")
      .select("return_time, created_at");
    if (returnsErr) console.error("return_records 查询失败:", returnsErr.message);

    const returnDateSet = new Set<string>();
    for (const r of (returnRecords || []) as any[]) {
      const rt = String(r.return_time || r.created_at || "");
      if (rt) returnDateSet.add(rt.slice(0, 10));
    }
    const returnDates = Array.from(returnDateSet).sort().reverse();

    // 按 type 返回对应日期列表到 dates 字段（前端 fetchSalesDates/fetchReturnsDates 用 data.dates）
    if (type === "returns") {
      return NextResponse.json({ dates: returnDates, returnDates, salesDates });
    }
    return NextResponse.json({ dates: salesDates, salesDates, returnDates });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
