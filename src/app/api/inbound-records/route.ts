import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { invalidateSummaryCache } from "@/app/api/summary/cache";
import { invalidateRestockCache } from "@/app/api/restock-snapshot/route";
import { logOp, buildDiff, cnField, type LogDetail } from "@/lib/operation-log";
import { extractUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const saleId = searchParams.get("sale_id");

  // 按 sale_id 查询某商品的所有入库记录（用于补录时获取商品详情）
  if (saleId) {
    const { data, error } = await supabase
      .from("inbound_records")
      .select("*")
      .eq("sale_id", saleId.toUpperCase())
      .order("inbound_date", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data || []);
  }

  // 并行拉取全表：count + 全页并行（原先逐页串行，2s+ → ~1s）
  // 排序加 id 次级键保证分页确定性
  const PAGE_SIZE = 1000;
  const { count, error: countErr } = await supabase
    .from("inbound_records")
    .select("*", { count: "exact", head: true });

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  let allData: Record<string, any>[] = [];
  if (count && count > 0) {
    const pages = Math.ceil(count / PAGE_SIZE) + 1;
    const results = await Promise.all(
      Array.from({ length: pages }, (_, p) =>
        supabase
          .from("inbound_records")
          .select("*")
          .order("inbound_date", { ascending: false })
          .order("id", { ascending: false })
          .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
      )
    );
    for (const r of results) {
      if (r.error) {
        return NextResponse.json({ error: r.error.message }, { status: 500 });
      }
      if (r.data) allData = allData.concat(r.data as Record<string, any>[]);
    }
  }

  return NextResponse.json(allData);
}

const RESTOCK_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

function bjDate(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(d);
}

// 补录快照(单商品轻量版): 提交补录时算好"补录当天(天粒度)各尺码剩余"存进记录, 补录视图直接读记录, 不再全量现算
// 口径与历史回填脚本一致: before[s] = Σ入库(≤D)[s] − Σ售出(≤D)[s] + Σ退回(≤D)[s] − 当日补录增量[s]; D = inbound_date 北京日期
// 本条记录此刻还未插入, 查询结果天然不含本条; 同日已有补录笔会计入入库累计并被"当日补录增量"抵消, 得到当天开头剩余
async function computeBeforeSizes(sid: string, inboundDateIso: string): Promise<Record<string, number>> {
  const D = bjDate(inboundDateIso);
  const out: Record<string, number> = {};
  for (const s of RESTOCK_SIZES) out[s] = 0;
  if (!sid.trim() || !D) return out;
  const cols = RESTOCK_SIZES.map((s) => `size_${s}`).join(",");
  // 动态列拼接的 select 会让 supabase-js 泛型解析失败(ParserError), 结果统一按 unknown 行数组处理
  const [inbR, soldR, retR] = await Promise.all([
    supabase.from("inbound_records").select(`inbound_date,notes,${cols}`).ilike("sale_id", sid.trim()),
    supabase.from("sales_records").select("order_time,registration_date,size,quantity").ilike("sale_id", sid.trim()),
    supabase.from("return_records").select("return_time,size,quantity").ilike("sale_id", sid.trim()),
  ]);
  const inb = (inbR.data ?? []) as unknown as Record<string, unknown>[];
  const sold = (soldR.data ?? []) as unknown as Record<string, unknown>[];
  const ret = (retR.data ?? []) as unknown as Record<string, unknown>[];
  const cumIn: Record<number, number> = {}, cumSold: Record<number, number> = {}, cumRet: Record<number, number> = {}, dayRestock: Record<number, number> = {};
  for (const r of inb) {
    const d = bjDate(r.inbound_date);
    if (!d || d > D) continue;
    const isRestock = String(r.notes || "").startsWith("补录入库");
    for (const s of RESTOCK_SIZES) {
      const v = Number((r as Record<string, unknown>)[`size_${s}`]) || 0;
      if (!v) continue;
      cumIn[s] = (cumIn[s] || 0) + v;
      if (isRestock && d === D) dayRestock[s] = (dayRestock[s] || 0) + v;
    }
  }
  for (const r of sold) {
    const qty = Number(r.quantity) || 0;
    const sz = Number(r.size) || 0;
    if (!qty || sz < 80 || sz > 180) continue;
    const d = bjDate(r.order_time || r.registration_date);
    if (!d || d > D) continue;
    cumSold[sz] = (cumSold[sz] || 0) + qty;
  }
  for (const r of ret) {
    const qty = Number(r.quantity) || 0;
    const sz = Number(r.size) || 0;
    if (!qty || sz < 80 || sz > 180) continue;
    const d = bjDate(r.return_time);
    if (!d || d > D) continue;
    cumRet[sz] = (cumRet[sz] || 0) + qty;
  }
  for (const s of RESTOCK_SIZES) out[s] = (cumIn[s] || 0) - (cumSold[s] || 0) + (cumRet[s] || 0) - (dayRestock[s] || 0);
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const totalStock =
      Number(body.size_80 || 0) +
      Number(body.size_90 || 0) +
      Number(body.size_95 || 0) +
      Number(body.size_100 || 0) +
      Number(body.size_105 || 0) +
      Number(body.size_110 || 0) +
      Number(body.size_120 || 0) +
      Number(body.size_130 || 0) +
      Number(body.size_140 || 0) +
      Number(body.size_150 || 0) +
      Number(body.size_160 || 0) +
      Number(body.size_170 || 0) +
      Number(body.size_180 || 0);

    const record = {
      inbound_date: body.inbound_date || new Date().toISOString(),
      sale_id: body.sale_id || "",
      photo: (body.photo && body.photo !== "0" && String(body.photo).trim() !== "0")
        ? String(body.photo).replace(/^`+|`+$/g, "").trim()
        : "",
      name: (body.name && body.name !== "0" && String(body.name).trim() !== "0") ? body.name : "",
      manufacturer: body.manufacturer || "",
      size_80: Number(body.size_80) || 0,
      size_90: Number(body.size_90) || 0,
      size_95: Number(body.size_95) || 0,
      size_100: Number(body.size_100) || 0,
      size_105: Number(body.size_105) || 0,
      size_110: Number(body.size_110) || 0,
      size_120: Number(body.size_120) || 0,
      size_130: Number(body.size_130) || 0,
      size_140: Number(body.size_140) || 0,
      size_150: Number(body.size_150) || 0,
      size_160: Number(body.size_160) || 0,
      size_170: Number(body.size_170) || 0,
      size_180: Number(body.size_180) || 0,
      shelf_no: body.shelf_no || "",
      total_stock: totalStock,
      cost_price: Number(body.cost_price) || 0,
      season: body.season || "",
      style_category: body.style_category || "",
      notes: body.notes || "",
      operator: null as string | null,
      before_sizes: null as Record<string, number> | null,
    };

    // 补录记录: ①登记人=提交时登录人 ②提交时算好"补录当天各尺码剩余"快照存进记录(补录视图直接读, 免全量现算)
    if (String(body.notes || "").startsWith("补录入库")) {
      try {
        const user = extractUser(request);
        if (user?.sub) {
          const { data: m } = await supabase.from("members").select("name").eq("id", user.sub).maybeSingle();
          if (m?.name) record.operator = m.name;
        }
      } catch {
        // 无登录态 → 保持 null
      }
      try {
        record.before_sizes = await computeBeforeSizes(String(body.sale_id || ""), String(record.inbound_date));
      } catch {
        // 快照计算失败不阻塞补录提交(视图对该记录会显示 0, 可重跑回填脚本修复)
      }
    }

    const { data, error } = await supabase
      .from("inbound_records")
      .insert(record)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    void logOp(request, {
      action: "inbound_add",
      label: "入库登记",
      table: "inbound_records",
      id: String((data as { id?: unknown }).id ?? ""),
      target: `${record.sale_id}${record.name ? ` · ${record.name}` : ""}`,
      detail: [
        { field: "总库存", from: "新增", to: String(totalStock) },
        { field: "进价", from: "新增", to: String(record.cost_price) },
      ],
    });
    invalidateSummaryCache();
    // 补录/入库写入会影响补录视图"那天时点"快照, 立即失效其缓存
    invalidateRestockCache();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PUT: 编辑入库记录
// 优先按行 id 精确更新(同编号多条入库记录时避免全行覆盖); 未提供 id 时按 sale_id 更新
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sale_id, id, size_totals, ...fields } = body;

    if (!sale_id && !id) {
      return NextResponse.json({ error: "sale_id 或 id 不能为空" }, { status: 400 });
    }

    // 错库存行内修正: 按编号设置每尺码入库总量(跨行分摊增减, 最新行优先), 用于总表错库存补充行直接改库存
    if (size_totals && typeof size_totals === "object" && sale_id) {
      const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];
      const targets: Record<number, number> = {};
      for (const s of SIZES) {
        const v = size_totals[String(s)];
        if (v !== undefined && v !== null && v !== "") targets[s] = Math.max(0, Number(v) || 0);
      }
      if (Object.keys(targets).length === 0) {
        return NextResponse.json({ error: "没有需要调整的尺码" }, { status: 400 });
      }

      const sizeCols = "id," + SIZES.map((s) => `size_${s}`).join(",");
      const { data: rows, error: fetchErr } = await supabase
        .from("inbound_records")
        .select(sizeCols)
        .eq("sale_id", sale_id)
        .order("id", { ascending: false });

      if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 400 });
      }
      const rowList = (rows || []) as unknown as Record<string, unknown>[];
      if (rowList.length === 0) {
        return NextResponse.json({ error: "该编号没有入库记录" }, { status: 400 });
      }

      // 计算每行需要变更的尺码值
      const updates: { id: number; changes: Record<string, number> }[] = rowList.map((r) => ({ id: Number(r.id), changes: {} }));
      const sizeLog: LogDetail[] = [];
      for (const s of Object.keys(targets).map(Number)) {
        const col = `size_${s}`;
        const current = rowList.reduce((sum, r) => sum + (Number(r[col]) || 0), 0);
        const delta = targets[s] - current;
        if (delta !== 0) sizeLog.push({ field: cnField(col), from: String(current), to: String(targets[s]) });

        if (delta > 0) {
          // 增加: 优先加到已有该尺码的最新一行, 否则加到最新一行
          const idx = rowList.findIndex((r) => (Number(r[col]) || 0) > 0);
          const t = idx >= 0 ? idx : 0;
          updates[t].changes[col] = (Number(rowList[t][col]) || 0) + delta;
        } else if (delta < 0) {
          // 减少: 从最新行开始逐行扣减, 不低于0
          let need = -delta;
          for (let i = 0; i < rowList.length && need > 0; i++) {
            const have = Number(rowList[i][col]) || 0;
            if (have <= 0) continue;
            const take = Math.min(have, need);
            updates[i].changes[col] = have - take;
            need -= take;
          }
        }
      }

      // 应用更新并重算每行 total_stock
      for (const u of updates) {
        if (Object.keys(u.changes).length === 0) continue;
        const orig = rowList.find((r) => Number(r.id) === u.id) as Record<string, unknown>;
        let total = 0;
        const updateData: Record<string, unknown> = { ...u.changes };
        for (const s of SIZES) {
          total += u.changes[`size_${s}`] !== undefined ? u.changes[`size_${s}`] : Number(orig[`size_${s}`]) || 0;
        }
        updateData.total_stock = total;
        const { error: updErr } = await supabase.from("inbound_records").update(updateData).eq("id", u.id);
        if (updErr) {
          return NextResponse.json({ error: updErr.message }, { status: 400 });
        }
      }

      invalidateSummaryCache();
      invalidateRestockCache();
      void logOp(request, { action: "inbound_edit", label: "修正入库库存", table: "inbound_records", target: sale_id, detail: sizeLog });
    return NextResponse.json({ message: "入库尺码已修正", sale_id, adjusted: Object.keys(targets).length });
    }

    // 计算 total_stock
    const updateData: Record<string, unknown> = {};

    if (fields.photo !== undefined) updateData.photo = String(fields.photo).replace(/^`+|`+$/g, "").trim();
    if (fields.name !== undefined) updateData.name = fields.name;
    if (fields.manufacturer !== undefined) updateData.manufacturer = fields.manufacturer;
    if (fields.cost_price !== undefined) updateData.cost_price = Number(fields.cost_price) || 0;
    if (fields.shelf_no !== undefined) updateData.shelf_no = fields.shelf_no;
    if (fields.sell_price !== undefined) updateData.sell_price = Number(fields.sell_price) || 0;
    if (fields.season !== undefined) updateData.season = fields.season;
    if (fields.style_category !== undefined) updateData.style_category = fields.style_category;
    if (fields.notes !== undefined) updateData.notes = fields.notes;

    // 尺码字段
    let totalStock = 0;
    for (const s of [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180]) {
      if (fields[`size_${s}`] !== undefined) {
        const val = Number(fields[`size_${s}`]) || 0;
        updateData[`size_${s}`] = val;
        totalStock += val;
      }
    }

    if (totalStock > 0 || Object.keys(updateData).some((k) => k.startsWith("size_"))) {
      // 如果修改了尺码，需要重新计算 total_stock
      // 先获取现有记录中未修改的尺码值（优先按 id 精确取行；否则按 sale_id 取第一行, limit(1) 避免多行报错）
      const sizeCols = "size_80,size_90,size_95,size_100,size_105,size_110,size_120,size_130,size_140,size_150,size_160,size_170,size_180";
      const fetchExisting = id
        ? supabase.from("inbound_records").select(sizeCols).eq("id", id).maybeSingle()
        : supabase.from("inbound_records").select(sizeCols).eq("sale_id", sale_id).limit(1).maybeSingle();
      const { data: existing } = await fetchExisting;

      let calculatedTotal = totalStock;
      if (existing) {
        const ex = existing as Record<string, unknown>;
        for (const s of [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180]) {
          if (fields[`size_${s}`] === undefined) {
            calculatedTotal += Number(ex[`size_${s}`]) || 0;
          }
        }
      }
      updateData.total_stock = calculatedTotal;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "没有需要更新的字段" }, { status: 400 });
    }

    // 查旧行生成改前→改后明细（必须在更新前查！更新后查到的是新值，diff 会恒为空）
    const diffKeys = Object.keys(updateData);
    const { data: oldRow } = id
      ? await supabase.from("inbound_records").select(diffKeys.join(",")).eq("id", id).maybeSingle()
      : await supabase.from("inbound_records").select(diffKeys.join(",")).eq("sale_id", sale_id).limit(1).maybeSingle();

    const updateQuery = supabase.from("inbound_records").update(updateData);
    const { error } = id
      ? await updateQuery.eq("id", id)
      : await updateQuery.eq("sale_id", sale_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    void logOp(request, {
      action: "inbound_edit",
      label: "修改入库",
      table: "inbound_records",
      id: id ? String(id) : undefined,
      target: sale_id,
      detail: buildDiff(oldRow as Record<string, unknown> | null, updateData, diffKeys),
    });
    invalidateSummaryCache();
    invalidateRestockCache();
    return NextResponse.json({ message: "更新成功", sale_id, updated: Object.keys(updateData) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}