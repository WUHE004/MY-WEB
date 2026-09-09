import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 1000;

// 并行拉取全表指定列：count + 全页并行（原先逐页串行，2万+行要 ~6.6s，并行后 ~1s）
// 排序加 id 次级键，保证分页确定性（同值组内不跳行/不重复）
async function fetchAllSaleIds(
  table: string,
  orderCol: string
): Promise<{ ids: Set<string>; error: string | null }> {
  const { count, error: countErr } = await supabase
    .from(table)
    .select("sale_id", { count: "exact", head: true });

  if (countErr) return { ids: new Set(), error: countErr.message };
  if (!count || count === 0) return { ids: new Set(), error: null };

  const pages = Math.ceil(count / PAGE_SIZE) + 1;
  const results = await Promise.all(
    Array.from({ length: pages }, (_, p) =>
      supabase
        .from(table)
        .select("sale_id")
        .order(orderCol, { ascending: false })
        .order("id", { ascending: false })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
    )
  );

  const ids = new Set<string>();
  for (const r of results) {
    if (r.error) return { ids: new Set(), error: r.error.message };
    for (const row of (r.data || []) as { sale_id?: string }[]) {
      if (row.sale_id) ids.add(String(row.sale_id).toUpperCase());
    }
  }
  return { ids, error: null };
}

export async function GET() {
  try {
    // 三张表并行统计 distinct sale_id（原先串行逐表逐页）
    const [inboundRes, salesRes, returnRes] = await Promise.all([
      fetchAllSaleIds("inbound_records", "inbound_date"),
      fetchAllSaleIds("sales_records", "registration_date"),
      fetchAllSaleIds("return_records", "created_at"),
    ]);

    const err = inboundRes.error || salesRes.error || returnRes.error;
    if (err) {
      return NextResponse.json({ error: err }, { status: 500 });
    }

    return NextResponse.json({
      inboundCount: inboundRes.ids.size,
      salesCount: salesRes.ids.size,
      returnCount: returnRes.ids.size,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
