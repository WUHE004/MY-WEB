import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 有 id 列的表分页全量读取
async function readAllPages(table: string, select: string, orderCol: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderCol, { ascending: true })
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

// 分页读取指定盘点单的全部明细
async function readItems(stocktakeId: number): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from("stocktake_items")
      .select("*")
      .eq("stocktake_id", stocktakeId)
      .order("id", { ascending: true })
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

// GET: 默认返回进行中的盘点单+明细; ?id=xxx 查看指定单据; ?history=1 返回历史列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const history = searchParams.get("history");
    const idParam = searchParams.get("id");

    if (history) {
      const { data, error } = await supabase
        .from("stocktakes")
        .select("*")
        .order("id", { ascending: false })
        .limit(20);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    }

    let stocktake: Record<string, unknown> | null = null;

    if (idParam) {
      const { data, error } = await supabase
        .from("stocktakes")
        .select("*")
        .eq("id", Number(idParam))
        .limit(1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      stocktake = data && data.length > 0 ? data[0] : null;
      if (!stocktake) return NextResponse.json({ error: "盘点单不存在" }, { status: 404 });
    } else {
      // 优先取进行中的单
      const { data, error } = await supabase
        .from("stocktakes")
        .select("*")
        .eq("status", "in_progress")
        .order("id", { ascending: false })
        .limit(1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (data && data.length > 0) {
        stocktake = data[0];
      } else {
        // 无进行中 → 返回最近完成单摘要（供"上次盘点"卡片展示）
        const { data: last, error: lastErr } = await supabase
          .from("stocktakes")
          .select("*")
          .eq("status", "completed")
          .order("id", { ascending: false })
          .limit(1);
        if (lastErr) return NextResponse.json({ error: lastErr.message }, { status: 500 });
        return NextResponse.json({ stocktake: null, lastCompleted: last && last.length > 0 ? last[0] : null });
      }
    }

    const items = await readItems(Number(stocktake!.id));
    return NextResponse.json({ stocktake, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: 创建盘点单（快照当前全量库存: 剩余 = 入库合计 − 已售合计 + 已退合计）
export async function POST(request: NextRequest) {
  try {
    // 已有进行中的盘点则拒绝
    const { data: active } = await supabase
      .from("stocktakes")
      .select("id")
      .eq("status", "in_progress")
      .limit(1);
    if (active && active.length > 0) {
      return NextResponse.json({ error: `已有进行中的盘点单 #${active[0].id}，请先完成或作废` }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const createdBy = String(body?.created_by || "");

    // 并行拉取入库 + 售出汇总 + 退货汇总
    const [inbound, salesSummary, returnsSummary] = await Promise.all([
      readAllPages("inbound_records", "sale_id, name, photo, shelf_no, inbound_date, size_80, size_90, size_95, size_100, size_105, size_110, size_120, size_130, size_140, size_150, size_160, size_170, size_180", "id"),
      readAllPages("sales_summary", "sale_id, size_80, size_90, size_95, size_100, size_105, size_110, size_120, size_130, size_140, size_150, size_160, size_170, size_180", "sale_id"),
      readAllPages("returns_summary", "sale_id, size_80, size_90, size_95, size_100, size_105, size_110, size_120, size_130, size_140, size_150, size_160, size_170, size_180", "sale_id"),
    ]);

    if (inbound.length === 0) {
      return NextResponse.json({ error: "入库记录为空，无法创建盘点" }, { status: 400 });
    }

    // 汇总索引
    const soldMap = new Map(salesSummary.map((r) => [String(r.sale_id || "").toUpperCase(), r]));
    const returnedMap = new Map(returnsSummary.map((r) => [String(r.sale_id || "").toUpperCase(), r]));

    // 同编号多条入库: 数量累加, 货架号/图片/名称取最新（inbound_date 倒序后先见为准）
    type Agg = { name: string; photo: string; shelf_no: string; sizes: Record<string, number> };
    const aggMap = new Map<string, Agg>();
    const sorted = [...inbound].sort((a, b) => String(b.inbound_date || "").localeCompare(String(a.inbound_date || "")));
    for (const rec of sorted) {
      const sid = String(rec.sale_id || "").trim().toUpperCase();
      if (!sid) continue;
      let agg = aggMap.get(sid);
      if (!agg) {
        agg = { name: String(rec.name || ""), photo: String(rec.photo || ""), shelf_no: String(rec.shelf_no || ""), sizes: {} };
        aggMap.set(sid, agg);
      }
      for (const s of ALL_SIZES) {
        const q = Number(rec[`size_${s}`]) || 0;
        if (q > 0) agg.sizes[String(s)] = (agg.sizes[String(s)] || 0) + q;
      }
    }

    // 生成明细行（每个编号每个有入库的尺码一行）
    const rows: Record<string, unknown>[] = [];
    for (const [sid, agg] of aggMap) {
      const sold = soldMap.get(sid);
      const returned = returnedMap.get(sid);
      for (const s of ALL_SIZES) {
        const key = `size_${s}`;
        const inQty = agg.sizes[String(s)] || 0;
        if (inQty <= 0) continue;
        const soldQty = sold ? Number(sold[key]) || 0 : 0;
        const retQty = returned ? Number(returned[key]) || 0 : 0;
        const expected = inQty - soldQty + retQty;
        rows.push({
          sale_id: sid,
          shelf_no: agg.shelf_no,
          name: agg.name,
          photo: agg.photo,
          size: s,
          expected_qty: expected,
        });
      }
    }

    // 创建盘点单
    const { data: st, error: stErr } = await supabase
      .from("stocktakes")
      .insert({ created_by: createdBy, total_items: rows.length })
      .select("id")
      .limit(1);
    if (stErr || !st || st.length === 0) {
      return NextResponse.json({ error: stErr?.message || "创建盘点单失败" }, { status: 500 });
    }
    const stocktakeId = Number(st[0].id);

    // 批量插入明细（每批 500）
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500).map((r) => ({ ...r, stocktake_id: stocktakeId }));
      const { error: insErr } = await supabase.from("stocktake_items").insert(batch);
      if (insErr) {
        console.error("stocktake items insert error:", insErr.message);
        await supabase.from("stocktakes").delete().eq("id", stocktakeId);
        return NextResponse.json({ error: `写入明细失败: ${insErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ stocktake_id: stocktakeId, total_items: rows.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT: 保存单条清点数 { item_id, counted_qty: number | null }
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const itemId = Number(body?.item_id);
    if (!itemId) return NextResponse.json({ error: "缺少 item_id" }, { status: 400 });

    const raw = body?.counted_qty;
    const counted = raw === null || raw === undefined || raw === "" ? null : Math.max(0, Math.floor(Number(raw)));
    if (counted !== null && (Number.isNaN(counted) || !Number.isFinite(counted))) {
      return NextResponse.json({ error: "无效的清点数量" }, { status: 400 });
    }

    const { error } = await supabase
      .from("stocktake_items")
      .update({ counted_qty: counted })
      .eq("id", itemId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH: 完成盘点（计算差异汇总并标记完成）
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const stocktakeId = Number(body?.stocktake_id);
    if (!stocktakeId) return NextResponse.json({ error: "缺少 stocktake_id" }, { status: 400 });

    const { data: st } = await supabase
      .from("stocktakes")
      .select("id, status")
      .eq("id", stocktakeId)
      .limit(1);
    if (!st || st.length === 0) return NextResponse.json({ error: "盘点单不存在" }, { status: 404 });
    if (st[0].status !== "in_progress") return NextResponse.json({ error: "该盘点单已完成" }, { status: 400 });

    const items = await readItems(stocktakeId);
    let counted = 0;
    let gain = 0;
    let loss = 0;
    for (const it of items) {
      if (it.counted_qty === null || it.counted_qty === undefined) continue;
      counted++;
      const diff = Number(it.counted_qty) - Number(it.expected_qty);
      if (diff > 0) gain += diff;
      else if (diff < 0) loss += -diff;
    }
    if (counted === 0) {
      return NextResponse.json({ error: "尚未清点任何商品，不能完成盘点" }, { status: 400 });
    }

    const { error } = await supabase
      .from("stocktakes")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        counted_items: counted,
        total_items: items.length,
        gain_total: gain,
        loss_total: loss,
      })
      .eq("id", stocktakeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, counted_items: counted, total_items: items.length, gain_total: gain, loss_total: loss });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: 作废进行中的盘点单（级联删除明细）
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

    const { data: st } = await supabase
      .from("stocktakes")
      .select("status")
      .eq("id", id)
      .limit(1);
    if (!st || st.length === 0) return NextResponse.json({ error: "盘点单不存在" }, { status: 404 });
    if (st[0].status !== "in_progress") return NextResponse.json({ error: "已完成的盘点单不能删除" }, { status: 400 });

    const { error } = await supabase.from("stocktakes").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
