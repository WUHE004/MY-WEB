import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 各厂家各尺码剩余库存 = 入库各尺码 - 售出各尺码 + 退货各尺码
export async function GET() {
  try {
    // 1. 读取入库记录（含厂家和各尺码）
    let inboundData: Record<string, any>[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("inbound_records")
        .select(["sale_id", "manufacturer", ...ALL_SIZES.map((s) => `size_${s}`)].join(","))
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      inboundData = inboundData.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 2. 读取售出汇总（含各尺码）
    let salesData: Record<string, any>[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_summary")
        .select(["sale_id", ...ALL_SIZES.map((s) => `size_${s}`)].join(","))
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      salesData = salesData.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 3. 读取退货汇总（含各尺码）
    let returnsData: Record<string, any>[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("returns_summary")
        .select(["sale_id", ...ALL_SIZES.map((s) => `size_${s}`)].join(","))
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      returnsData = returnsData.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 4. 按 sale_id 构建售出/退货尺码映射
    const salesMap: Record<string, Record<string, number>> = {};
    for (const s of salesData) {
      const sid = String(s.sale_id || "").toUpperCase();
      if (!sid) continue;
      salesMap[sid] = {};
      for (const sz of ALL_SIZES) salesMap[sid][`size_${sz}`] = Number(s[`size_${sz}`]) || 0;
    }
    const returnsMap: Record<string, Record<string, number>> = {};
    for (const r of returnsData) {
      const sid = String(r.sale_id || "").toUpperCase();
      if (!sid) continue;
      returnsMap[sid] = {};
      for (const sz of ALL_SIZES) returnsMap[sid][`size_${sz}`] = Number(r[`size_${sz}`]) || 0;
    }

    // 5. 按厂家聚合各尺码剩余
    const mfrMap: Record<string, Record<string, number>> = {};
    for (const ib of inboundData) {
      const mfr = String(ib.manufacturer || "未知").trim() || "未知";
      const sid = String(ib.sale_id || "").toUpperCase();
      if (!mfrMap[mfr]) {
        mfrMap[mfr] = { manufacturer: mfr };
        for (const sz of ALL_SIZES) mfrMap[mfr][`size_${sz}`] = 0;
      }
      for (const sz of ALL_SIZES) {
        const inbound = Number(ib[`size_${sz}`]) || 0;
        const sold = salesMap[sid]?.[`size_${sz}`] || 0;
        const returned = returnsMap[sid]?.[`size_${sz}`] || 0;
        const remaining = inbound - sold + returned;
        mfrMap[mfr][`size_${sz}`] += Math.max(0, remaining);
      }
    }

    // 转为数组并按总剩余量排序
    const result = Object.values(mfrMap)
      .map((m) => ({
        ...m,
        total: ALL_SIZES.reduce((sum, sz) => sum + (Number(m[`size_${sz}`]) || 0), 0),
      }))
      .filter((m) => m.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // 取前10个厂家

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
