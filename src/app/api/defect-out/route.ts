import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 瑕疵出库: 瑕疵商品退回厂家
// GET    -> 出库记录列表 + 累计出库件数
// POST   -> 校验编号已入库且各尺码库存足够, 扣减 inbound_records 对应尺码并写 defect_out_records
const SIZE_COLS = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

function sizeCol(size: number): string {
  return `size_${size}`;
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("defect_out_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const records = data || [];
    const total_qty = records.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.quantity) || 0), 0);
    return NextResponse.json({ records, total_qty });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const saleId = String(body.sale_id || "").trim();
    const items: { size: number; quantity: number }[] = Array.isArray(body.items) ? body.items : [];
    const defectType = String(body.defect_type || "").trim();
    const notes = String(body.notes || "").trim();
    const registrant = String(body.registrant || "").trim();
    const costPrice = Number(body.cost_price) || 0;

    if (!saleId) return NextResponse.json({ error: "缺少售卖编号" }, { status: 400 });
    if (items.length === 0) return NextResponse.json({ error: "请至少选择一个尺码数量" }, { status: 400 });
    for (const it of items) {
      if (!Number.isInteger(it.size) || !(it.quantity > 0)) {
        return NextResponse.json({ error: "尺码数量格式错误" }, { status: 400 });
      }
    }

    // 1. 查入库记录(该编号可能多次入库, 先精确匹配再模糊兜底)
    const first = await supabase
      .from("inbound_records")
      .select("*")
      .eq("sale_id", saleId);
    let inboundRows = first.data;
    if (first.error) return NextResponse.json({ error: first.error.message }, { status: 500 });
    if (!inboundRows || inboundRows.length === 0) {
      const alt = await supabase
        .from("inbound_records")
        .select("*")
        .ilike("sale_id", saleId);
      inboundRows = alt.data;
      if (alt.error) return NextResponse.json({ error: alt.error.message }, { status: 500 });
    }
    if (!inboundRows || inboundRows.length === 0) {
      return NextResponse.json({ error: `编号 ${saleId} 未入库, 不能瑕疵出库` }, { status: 400 });
    }
    // 早入库的先扣
    inboundRows.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(a.inbound_date || a.created_at || "").localeCompare(String(b.inbound_date || b.created_at || ""))
    );

    // 2. 校验各尺码入库库存是否足够
    for (const it of items) {
      if (!SIZE_COLS.includes(it.size)) {
        return NextResponse.json({ error: `不支持的尺码: ${it.size}` }, { status: 400 });
      }
      const total = inboundRows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r[sizeCol(it.size)]) || 0), 0);
      if (total < it.quantity) {
        return NextResponse.json(
          { error: `${saleId} 的 ${it.size} 码入库库存仅剩 ${total} 件, 不足以出库 ${it.quantity} 件` },
          { status: 400 }
        );
      }
    }

    // 3. 逐尺码扣减库存(跨多行入库记录顺序扣), 并重算每行 total_stock
    type Update = { id: unknown; patch: Record<string, number> };
    const updates: Update[] = [];
    for (const it of items) {
      let remain = it.quantity;
      const col = sizeCol(it.size);
      for (const row of inboundRows as Record<string, unknown>[]) {
        if (remain <= 0) break;
        const have = Number(row[col]) || 0;
        if (have <= 0) continue;
        const deduct = Math.min(have, remain);
        remain -= deduct;
        const patch: Record<string, number> = { [col]: have - deduct };
        // 重算该行 total_stock(所有尺码列合计, 含本次扣减)
        let totalStock = 0;
        for (const s of SIZE_COLS) {
          const v = s === it.size ? have - deduct : Number(row[sizeCol(s)]) || 0;
          totalStock += v;
        }
        patch.total_stock = totalStock;
        updates.push({ id: row.id, patch });
      }
      if (remain > 0) {
        return NextResponse.json({ error: `${it.size} 码库存不足(差 ${remain} 件)` }, { status: 400 });
      }
    }

    for (const u of updates) {
      const { error: upErr } = await supabase
        .from("inbound_records")
        .update(u.patch)
        .eq("id", u.id as number);
      if (upErr) {
        return NextResponse.json({ error: `扣减库存失败: ${upErr.message}` }, { status: 500 });
      }
    }

    // 4. 写瑕疵出库记录(每尺码一条)
    const insertRows = items.map((it) => ({
      sale_id: saleId,
      size: it.size,
      quantity: it.quantity,
      cost_price: costPrice,
      defect_type: defectType,
      notes,
      registrant,
    }));
    const { error: insErr } = await supabase.from("defect_out_records").insert(insertRows);
    if (insErr) {
      return NextResponse.json({ error: `出库记录写入失败: ${insErr.message}` }, { status: 500 });
    }

    const totalQty = items.reduce((s, it) => s + it.quantity, 0);
    return NextResponse.json({ success: true, total_qty: totalQty });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
