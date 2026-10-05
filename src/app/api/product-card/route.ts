import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 单个/少量商品的总表卡片查询(供打包找货页"编号搜商品"弹窗使用)
// 聚合口径与 /api/summary 完全一致: 入库累计-售出+退货=剩余, 尺码跨行加减
const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

type Row = Record<string, unknown> & { sale_id: string };

const num = (v: unknown) => Number(v) || 0;

// 聚合单个 sale_id 的三表数据为总表行(与 /api/summary 同口径)
async function buildSummaryRow(code: string): Promise<Row | null> {
  const sizeCols = SIZES.map((s) => `size_${s}`).join(",");
  const [inboundRes, salesRes, returnRes] = await Promise.all([
    supabase
      .from("inbound_records")
      .select(`sale_id,${sizeCols},cost_price,name,manufacturer,photo,shelf_no,inbound_date`)
      .eq("sale_id", code),
    supabase
      .from("sales_records")
      .select("sale_id,quantity,size,sell_price,tracking_number,registration_date")
      .eq("sale_id", code),
    supabase.from("return_records").select("sale_id,quantity,size").eq("sale_id", code),
  ]);

  const err = inboundRes.error || salesRes.error || returnRes.error;
  if (err) throw new Error(err.message);

  const inboundRows = (inboundRes.data || []) as unknown as Record<string, unknown>[];
  const salesRows = (salesRes.data || []) as unknown as Record<string, unknown>[];
  const returnRows = (returnRes.data || []) as unknown as Record<string, unknown>[];

  if (inboundRows.length === 0 && salesRows.length === 0 && returnRows.length === 0) return null;

  const row: Row = {
    sale_id: code,
    inbound_total: 0,
    sold_total: 0,
    pdd_sold: 0,
    return_total: 0,
    remaining: 0,
    profits: 0,
    inventory_value: 0,
    cost_price: 0,
    sell_price: 0,
    name: "",
    manufacturer: "",
    photo: "",
    shelf_no: "",
    inbound_date: "",
    last_order_time: "",
    inbound_sizes: {} as Record<string, number>,
  };
  for (const s of SIZES) row[`size_${s}`] = 0;

  let hasInbound = false;
  for (const r of inboundRows) {
    hasInbound = true;
    let rowTotal = 0;
    for (const s of SIZES) {
      const val = num(r[`size_${s}`]);
      rowTotal += val;
      row[`size_${s}`] = num(row[`size_${s}`]) + val;
      (row.inbound_sizes as Record<string, number>)[String(s)] =
        ((row.inbound_sizes as Record<string, number>)[String(s)] || 0) + val;
    }
    row.inbound_total = num(row.inbound_total) + rowTotal;
    const costPrice = num(r.cost_price);
    const sellPrice = num(r.sell_price);
    if (!row.name && r.name) row.name = r.name;
    if (!row.manufacturer && r.manufacturer) row.manufacturer = r.manufacturer;
    if (!row.photo && r.photo) row.photo = r.photo;
    if (!row.shelf_no && r.shelf_no) row.shelf_no = r.shelf_no;
    if (costPrice > 0) row.cost_price = costPrice;
    if (sellPrice > 0) row.sell_price = sellPrice;
    const inbDate = String(r.inbound_date || "");
    if (inbDate && inbDate > String(row.inbound_date || "")) row.inbound_date = inbDate;
  }
  if (!hasInbound) {
    // 无入库记录时清掉已置 1 的尺码键, 保持与 /api/summary 的空入库行为一致(尺码键缺省)
    for (const s of SIZES) {
      row[`size_${s}`] = 0;
      delete (row.inbound_sizes as Record<string, number>)[String(s)];
    }
  }

  for (const r of salesRows) {
    const qty = num(r.quantity);
    const size = num(r.size);
    const sellPrice = num(r.sell_price);
    row.sold_total = num(row.sold_total) + qty;
    if (String(r.tracking_number || "").trim().startsWith("多多")) {
      row.pdd_sold = num(row.pdd_sold) + qty;
    }
    if (sellPrice > 0) row.sell_price = sellPrice;
    const regDate = String(r.registration_date || "");
    if (regDate && regDate > String(row.last_order_time || "")) row.last_order_time = regDate;
    const sizeKey = `size_${size}`;
    if (row[sizeKey] !== undefined) row[sizeKey] = num(row[sizeKey]) - qty;
  }

  for (const r of returnRows) {
    const qty = num(r.quantity);
    const size = num(r.size);
    row.return_total = num(row.return_total) + qty;
    const sizeKey = `size_${size}`;
    if (row[sizeKey] !== undefined) row[sizeKey] = num(row[sizeKey]) + qty;
    else row[sizeKey] = qty;
  }

  // 展示售价覆盖(product_display 优先, 与 /api/summary 相同)
  const { data: displayData } = await supabase
    .from("product_display")
    .select("sale_id, sell_price")
    .eq("sale_id", code);
  for (const r of (displayData || []) as unknown as Record<string, unknown>[]) {
    const displayPrice = num(r.sell_price);
    if (displayPrice > 0 && (num(row.sell_price) === 0 || displayPrice !== num(row.sell_price))) {
      row.sell_price = displayPrice;
    }
  }

  row.remaining = num(row.inbound_total) - num(row.sold_total) + num(row.return_total);
  row.profits = num(row.sell_price) - num(row.cost_price);
  row.inventory_value = num(row.remaining) * num(row.cost_price);

  return row;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("sale_id") || "").trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ error: "缺少商品编号" }, { status: 400 });
    }

    // 精确匹配优先
    const exact = await buildSummaryRow(code);
    if (exact) {
      return NextResponse.json({ found: true, rows: [exact] });
    }

    // 精确未命中时模糊兜底(包含匹配, 最多 5 条), 方便只记得部分编号
    if (code.length >= 2) {
      const { data: candidates, error: candErr } = await supabase
        .from("inbound_records")
        .select("sale_id")
        .ilike("sale_id", `%${code}%`)
        .limit(5);
      if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 });
      const ids = Array.from(
        new Set(((candidates || []) as unknown as Record<string, unknown>[]).map((r) => String(r.sale_id || "").toUpperCase()))
      ).filter(Boolean);
      const rows = (await Promise.all(ids.map((id) => buildSummaryRow(id)))).filter(Boolean);
      if (rows.length > 0) {
        return NextResponse.json({ found: true, rows });
      }
    }

    return NextResponse.json({ found: false, rows: [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
