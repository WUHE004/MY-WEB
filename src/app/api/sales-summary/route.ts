import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 汇总单个 sale_id 的售出数据并 upsert 到 sales_summary 表
export async function upsertSalesSummary(saleId: string) {
  if (!saleId) return;

  const sid = saleId.toUpperCase();

  // 1. 查询该 sale_id 的所有售出记录
  let allRecords: Record<string, unknown>[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: chunk, error } = await supabase
      .from("sales_records")
      .select("*")
      .eq("sale_id", sid)
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order("registration_date", { ascending: false });

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
    .eq("sale_id", sid)
    .limit(1);

  const inbound = inboundData && inboundData.length > 0 ? inboundData[0] : null;

  // 3. 汇总各尺码数量和总售出
  const sizeTotals: Record<string, number> = {};
  for (const s of ALL_SIZES) sizeTotals[`size_${s}`] = 0;
  let totalSold = 0;

  // 4. 统计售价信息（每个不同售价 + 最新下单时间）和总营收
  const priceMap = new Map<number, string>(); // price -> latest order_time
  const trackingNumbers = new Set<string>();
  let totalRevenue = 0;

  for (const row of allRecords) {
    const qty = Number(row.quantity) || 0;
    const sz = Number(row.size) || 0;
    const sp = Number(row.sell_price) || 0;

    if (sz >= 80 && sz <= 180) {
      const key = `size_${sz}`;
      sizeTotals[key] = (sizeTotals[key] || 0) + qty;
    }
    totalSold += qty;
    totalRevenue += sp * qty;

    if (sp > 0) {
      const ot = (row.order_time as string) || (row.created_at as string) || "";
      const existing = priceMap.get(sp);
      if (!existing || ot > existing) {
        priceMap.set(sp, ot);
      }
    }

    const tn = (row.tracking_number as string) || "";
    if (tn.trim()) trackingNumbers.add(tn.trim());
  }

  // 构建 sell_price_info JSON: { "9.99": "2024-01-01T...", "10.99": "2024-01-02T..." }
  const sellPriceInfo: Record<string, string> = {};
  for (const [price, time] of priceMap) {
    sellPriceInfo[String(price)] = time;
  }

  // 5. 从售出记录中获取最高售价
  let highestSellPrice = inbound?.sell_price || 0;
  if (priceMap.size > 0) {
    highestSellPrice = Math.max(...priceMap.keys());
  }

  // 5. Upsert 到 sales_summary 表
  const row: Record<string, unknown> = {
    sale_id: sid,
    photo: inbound?.photo || "",
    name: inbound?.name || "",
    shelf_no: inbound?.shelf_no || "",
    manufacturer: inbound?.manufacturer || "",
    cost_price: inbound?.cost_price || 0,
    sell_price: highestSellPrice,
    ...sizeTotals,
    total_sold: totalSold,
    total_revenue: totalRevenue,
    sell_price_info: sellPriceInfo,
    sales_count: trackingNumbers.size,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("sales_summary")
    .upsert(row, { onConflict: "sale_id" });

  if (error) {
    console.error("upsertSalesSummary error:", error.message);
  }
}

// GET: 获取售卖总表数据
export async function GET() {
  try {
    let allData: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_summary")
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

// POST: 手动刷新指定 sale_id 的汇总数据
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sale_id } = body;

    if (!sale_id) {
      return NextResponse.json({ error: "sale_id 不能为空" }, { status: 400 });
    }

    await upsertSalesSummary(sale_id);
    return NextResponse.json({ success: true, sale_id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}