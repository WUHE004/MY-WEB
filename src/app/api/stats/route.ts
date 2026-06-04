import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const pageSize = 1000;

    // 入库款数：分页获取 distinct sale_id
    const inboundIds = new Set<string>();
    let page = 0;
    while (true) {
      const { data: chunk, error: inboundErr } = await supabase
        .from("inbound_records")
        .select("sale_id")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("inbound_date", { ascending: false });

      if (inboundErr) {
        return NextResponse.json({ error: inboundErr.message }, { status: 500 });
      }
      if (!chunk || chunk.length === 0) break;
      for (const r of chunk) {
        if (r.sale_id) inboundIds.add(String(r.sale_id).toUpperCase());
      }
      if (chunk.length < pageSize) break;
      page++;
    }

    // 售卖单数：分页获取 distinct sale_id
    const salesIds = new Set<string>();
    page = 0;
    while (true) {
      const { data: chunk, error: salesErr } = await supabase
        .from("sales_records")
        .select("sale_id")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("registration_date", { ascending: false });

      if (salesErr) {
        return NextResponse.json({ error: salesErr.message }, { status: 500 });
      }
      if (!chunk || chunk.length === 0) break;
      for (const r of chunk) {
        if (r.sale_id) salesIds.add(String(r.sale_id).toUpperCase());
      }
      if (chunk.length < pageSize) break;
      page++;
    }

    // 退货单数：分页获取 distinct sale_id
    const returnIds = new Set<string>();
    page = 0;
    while (true) {
      const { data: chunk, error: returnErr } = await supabase
        .from("return_records")
        .select("sale_id")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("created_at", { ascending: false });

      if (returnErr) {
        return NextResponse.json({ error: returnErr.message }, { status: 500 });
      }
      if (!chunk || chunk.length === 0) break;
      for (const r of chunk) {
        if (r.sale_id) returnIds.add(String(r.sale_id).toUpperCase());
      }
      if (chunk.length < pageSize) break;
      page++;
    }

    return NextResponse.json({
      inboundCount: inboundIds.size,
      salesCount: salesIds.size,
      returnCount: returnIds.size,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}