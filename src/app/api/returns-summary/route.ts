import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 汇总单个 sale_id 的退货数据并 upsert 到 returns_summary 表
export async function upsertReturnsSummary(saleId: string) {
  if (!saleId) return;

  const sid = saleId.toUpperCase();

  // 1. 查询该 sale_id 的所有退货记录
  let allRecords: Record<string, unknown>[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: chunk, error } = await supabase
      .from("return_records")
      .select("*")
      .ilike("sale_id", sid)
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order("created_at", { ascending: false });

    if (error) break;
    if (!chunk || chunk.length === 0) break;
    allRecords = allRecords.concat(chunk);
    if (chunk.length < pageSize) break;
    page++;
  }

  // 2. 从入库表获取照片/货架号/厂家
  const { data: inboundData } = await supabase
    .from("inbound_records")
    .select("photo, shelf_no, manufacturer, name, cost_price, sell_price")
    .ilike("sale_id", sid)
    .limit(1);

  const inbound = inboundData && inboundData.length > 0 ? inboundData[0] : null;

  // 3. 汇总各尺码数量和总退货
  const sizeTotals: Record<string, number> = {};
  for (const s of ALL_SIZES) sizeTotals[`size_${s}`] = 0;
  let totalReturned = 0;

  // 4. 统计退货价信息（每个不同退货价 + 最新退货时间）和总退货金额
  const priceMap = new Map<number, string>(); // price -> latest return_time
  let totalReturnAmount = 0;

  for (const row of allRecords) {
    const qty = Number(row.quantity) || 0;
    const sz = Number(row.size) || 0;
    const rp = Number(row.return_price) || 0;

    if (sz >= 80 && sz <= 180) {
      const key = `size_${sz}`;
      sizeTotals[key] = (sizeTotals[key] || 0) + qty;
    }
    totalReturned += qty;
    totalReturnAmount += rp * qty;

    if (rp > 0) {
      const rt = (row.return_time as string) || (row.created_at as string) || "";
      const existing = priceMap.get(rp);
      if (!existing || rt > existing) {
        priceMap.set(rp, rt);
      }
    }
  }

  // 构建 return_price_info JSON
  const returnPriceInfo: Record<string, string> = {};
  for (const [price, time] of priceMap) {
    returnPriceInfo[String(price)] = time;
  }

  // 5. Upsert 到 returns_summary 表
  const row: Record<string, unknown> = {
    sale_id: sid,
    photo: inbound?.photo || "",
    name: inbound?.name || "",
    shelf_no: inbound?.shelf_no || "",
    manufacturer: inbound?.manufacturer || "",
    cost_price: inbound?.cost_price || 0,
    ...sizeTotals,
    total_returned: totalReturned,
    total_return_amount: totalReturnAmount,
    return_price_info: returnPriceInfo,
    return_count: allRecords.length,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("returns_summary")
    .upsert(row, { onConflict: "sale_id" });

  if (error) {
    console.error("upsertReturnsSummary error:", error.message);
  }
}

// GET: 获取退货总表数据
export async function GET() {
  try {
    let allData: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data: chunk, error } = await supabase
        .from("returns_summary")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("updated_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!chunk || chunk.length === 0) break;
      allData = allData.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    return NextResponse.json(allData);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}