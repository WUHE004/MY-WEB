import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { upsertSalesSummary } from "@/app/api/sales-summary/route";
import { upsertReturnsSummary } from "@/app/api/returns-summary/route";

export async function POST() {
  try {
    const results = { sales_synced: 0, returns_synced: 0, errors: [] as string[] };

    // 获取所有有售出记录的 sale_id
    const { data: salesIds } = await supabase
      .from("sales_records")
      .select("sale_id");
    const uniqueSalesIds = [...new Set((salesIds || []).map((r: { sale_id: string }) => r.sale_id?.toUpperCase()).filter(Boolean))];

    for (const sid of uniqueSalesIds) {
      try {
        await upsertSalesSummary(sid);
        results.sales_synced++;
      } catch (e) {
        results.errors.push(`sales:${sid}: ${e}`);
      }
    }

    // 获取所有有退货记录的 sale_id
    const { data: returnIds } = await supabase
      .from("return_records")
      .select("sale_id");
    const uniqueReturnIds = [...new Set((returnIds || []).map((r: { sale_id: string }) => r.sale_id?.toUpperCase()).filter(Boolean))];

    for (const sid of uniqueReturnIds) {
      try {
        await upsertReturnsSummary(sid);
        results.returns_synced++;
      } catch (e) {
        results.errors.push(`returns:${sid}: ${e}`);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}