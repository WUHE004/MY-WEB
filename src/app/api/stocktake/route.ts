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
      .order("id", { ascending: true })
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

// 无 id 列的汇总表分页读取
async function readSummaryPages(table: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(`sale_id,${ALL_SIZES.map((s) => `size_${s}`).join(",")}`)
      .order("sale_id", { ascending: true })
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

// 读取校准待办列表（settings 表 jsonb 数组）
async function readCalibrations(): Promise<unknown[]> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "stocktake_calibrations")
    .limit(1);
  if (error || !data || data.length === 0) return [];
  const v = (data[0] as { value?: unknown }).value;
  return Array.isArray(v) ? v : [];
}

async function writeCalibrations(list: unknown[]): Promise<boolean> {
  const { error } = await supabase
    .from("settings")
    .upsert(
      { key: "stocktake_calibrations", value: list, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) {
    console.error("writeCalibrations error:", error.message);
    return false;
  }
  return true;
}

// GET: 实时库存聚合(剩余=入库−已售+已退, 按尺码) + 货架设置 + 校准待办
// ?calibrations=1 仅返回校准待办(管理栏轻量轮询用)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("calibrations")) {
      return NextResponse.json(
        { calibrations: await readCalibrations() },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const sizeCols = ALL_SIZES.map((s) => `size_${s}`).join(",");
    const [inbound, salesSummary, returnsSummary, shelfSetting] = await Promise.all([
      readAllPages("inbound_records", `sale_id, name, photo, shelf_no, manufacturer, cost_price, inbound_date, ${sizeCols}`, "inbound_date"),
      readSummaryPages("sales_summary"),
      readSummaryPages("returns_summary"),
      supabase.from("settings").select("value").eq("key", "shelf_data").limit(1),
    ]);

    const soldMap = new Map(salesSummary.map((r) => [String(r.sale_id || "").toUpperCase(), r]));
    const returnedMap = new Map(returnsSummary.map((r) => [String(r.sale_id || "").toUpperCase(), r]));

    // 同编号多条入库: 数量累加, 基础信息取最新(inbound_date 倒序后先见为准)
    interface Agg {
      sale_id: string;
      name: string;
      photo: string;
      shelf_no: string;
      manufacturer: string;
      cost_price: number;
      inbound_date: string;
      sizes: { size: number; qty: number }[];
    }
    const aggMap = new Map<string, Agg & { sizeMap: Map<number, number> }>();
    const sorted = [...inbound].sort((a, b) =>
      String(b.inbound_date || "").localeCompare(String(a.inbound_date || ""))
    );
    for (const rec of sorted) {
      const sid = String(rec.sale_id || "").trim().toUpperCase();
      if (!sid) continue;
      let agg = aggMap.get(sid);
      if (!agg) {
        agg = {
          sale_id: sid,
          name: String(rec.name || ""),
          photo: String(rec.photo || ""),
          shelf_no: String(rec.shelf_no || ""),
          manufacturer: String(rec.manufacturer || ""),
          cost_price: Number(rec.cost_price) || 0,
          inbound_date: String(rec.inbound_date || ""),
          sizes: [],
          sizeMap: new Map(),
        };
        aggMap.set(sid, agg);
      }
      for (const s of ALL_SIZES) {
        const q = Number(rec[`size_${s}`]) || 0;
        if (q > 0) agg.sizeMap.set(s, (agg.sizeMap.get(s) || 0) + q);
      }
    }

    const items: Agg[] = [];
    for (const [sid, agg] of aggMap) {
      const sold = soldMap.get(sid);
      const returned = returnedMap.get(sid);
      const sizes: { size: number; qty: number }[] = [];
      for (const s of ALL_SIZES) {
        const inQty = agg.sizeMap.get(s) || 0;
        if (inQty <= 0) continue;
        const soldQty = sold ? Number(sold[`size_${s}`]) || 0 : 0;
        const retQty = returned ? Number(returned[`size_${s}`]) || 0 : 0;
        sizes.push({ size: s, qty: inQty - soldQty + retQty });
      }
      if (sizes.length === 0) continue; // 无尺码库存的商品不展示
      items.push({ ...agg, sizes });
    }

    const shelfDataRaw = (shelfSetting.data?.[0] as { value?: unknown } | null)?.value;
    const shelf_data =
      shelfDataRaw && typeof shelfDataRaw === "object" ? (shelfDataRaw as Record<string, number[]>) : {};

    return NextResponse.json(
      { items, shelf_data, calibrations: await readCalibrations() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT: 搬货（更新该编号全部入库记录的货架号）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const saleId = String(body?.sale_id || "").trim().toUpperCase();
    const shelfNo = String(body?.shelf_no || "").trim();
    if (!saleId) return NextResponse.json({ error: "缺少 sale_id" }, { status: 400 });
    if (!/^[^-]+-\d+-\d+$/.test(shelfNo)) {
      return NextResponse.json({ error: "货架号格式应为 排-货架号-层" }, { status: 400 });
    }

    const { error } = await supabase
      .from("inbound_records")
      .update({ shelf_no: shelfNo })
      .ilike("sale_id", saleId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 返回更新行数不可靠(ilike 匹配), 查一下确认
    const { count } = await supabase
      .from("inbound_records")
      .select("*", { count: "exact", head: true })
      .ilike("sale_id", saleId)
      .eq("shelf_no", shelfNo);
    return NextResponse.json({ ok: true, updated: count ?? 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: 提交库存校准（追加到 settings 的待办列表, 由管理栏消费处理后删除）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const saleId = String(body?.sale_id || "").trim().toUpperCase();
    const calibrations = Array.isArray(body?.calibrations) ? body.calibrations : [];
    if (!saleId) return NextResponse.json({ error: "缺少 sale_id" }, { status: 400 });
    if (calibrations.length === 0) return NextResponse.json({ error: "没有需要校准的尺码" }, { status: 400 });

    const clean = calibrations
      .map((c: { size?: unknown; old_qty?: unknown; new_qty?: unknown }) => ({
        size: Number(c.size) || 0,
        old_qty: Number(c.old_qty) || 0,
        new_qty: Number(c.new_qty) || 0,
      }))
      .filter((c: { size: number }) => c.size > 0);
    if (clean.length === 0) return NextResponse.json({ error: "校准数据无效" }, { status: 400 });

    const list = (await readCalibrations()) as Record<string, unknown>[];
    // 同编号重复提交: 覆盖旧待办
    const filtered = list.filter((c) => String(c.sale_id || "").toUpperCase() !== saleId);
    filtered.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sale_id: saleId,
      name: String(body?.name || ""),
      photo: String(body?.photo || ""),
      shelf_no: String(body?.shelf_no || ""),
      calibrations: clean,
      created_by: String(body?.created_by || ""),
      created_at: new Date().toISOString(),
    });

    const ok = await writeCalibrations(filtered);
    if (!ok) return NextResponse.json({ error: "保存校准记录失败" }, { status: 500 });
    return NextResponse.json({ ok: true, total: filtered.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: 删除一条校准待办（管理栏处理完后调用）
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

    const list = (await readCalibrations()) as Record<string, unknown>[];
    const next = list.filter((c) => String(c.id) !== id);
    if (next.length === list.length) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

    const ok = await writeCalibrations(next);
    if (!ok) return NextResponse.json({ error: "删除失败" }, { status: 500 });
    return NextResponse.json({ ok: true, total: next.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
