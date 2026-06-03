import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // 入库款数：distinct sale_id count
    const { data: inboundData, error: inboundErr } = await supabase
      .from("inbound_records")
      .select("sale_id");

    // 售卖单数：distinct sale_id count
    const { data: salesData, error: salesErr } = await supabase
      .from("sales_records")
      .select("sale_id");

    // 退货单数：distinct sale_id count
    const { data: returnData, error: returnErr } = await supabase
      .from("return_records")
      .select("sale_id");

    const inboundCount = inboundData
      ? new Set(inboundData.map((r: { sale_id: string }) => r.sale_id).filter(Boolean)).size
      : 0;
    const salesCount = salesData
      ? new Set(salesData.map((r: { sale_id: string }) => r.sale_id).filter(Boolean)).size
      : 0;
    const returnCount = returnData
      ? new Set(returnData.map((r: { sale_id: string }) => r.sale_id).filter(Boolean)).size
      : 0;

    return NextResponse.json({
      inboundCount,
      salesCount,
      returnCount,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}