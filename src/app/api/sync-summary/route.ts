import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { upsertSalesSummary } from "@/app/api/sales-summary/route";
import { upsertReturnsSummary } from "@/app/api/returns-summary/route";

export async function POST() {
  try {
    const results = { sales_synced: 0, returns_synced: 0, errors: [] as string[] };

    // 获取所有有售出记录的 sale_id（分页避免 Supabase 1000 行限制）
    let allSalesRows: { sale_id: string }[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_records")
        .select("sale_id")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) {
        console.error("sync-summary sales query error:", error.message);
        break;
      }
      if (!chunk || chunk.length === 0) break;
      allSalesRows = allSalesRows.concat(chunk as { sale_id: string }[]);
      if (chunk.length < pageSize) break;
      page++;
    }
    const uniqueSalesIds = [...new Set(allSalesRows.map((r) => r.sale_id?.toUpperCase()).filter(Boolean))];
    console.log(`[sync-summary] 共 ${allSalesRows.length} 条售出记录，${uniqueSalesIds.length} 个唯一 sale_id`);

    for (const sid of uniqueSalesIds) {
      try {
        await upsertSalesSummary(sid);
        results.sales_synced++;
      } catch (e) {
        results.errors.push(`sales:${sid}: ${e}`);
      }
    }

    // 获取所有有退货记录的 sale_id（分页）
    let allReturnRows: { sale_id: string }[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("return_records")
        .select("sale_id")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) {
        console.error("sync-summary returns query error:", error.message);
        break;
      }
      if (!chunk || chunk.length === 0) break;
      allReturnRows = allReturnRows.concat(chunk as { sale_id: string }[]);
      if (chunk.length < pageSize) break;
      page++;
    }
    const uniqueReturnIds = [...new Set(allReturnRows.map((r) => r.sale_id?.toUpperCase()).filter(Boolean))];
    console.log(`[sync-summary] 共 ${allReturnRows.length} 条退货记录，${uniqueReturnIds.length} 个唯一 sale_id`);

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