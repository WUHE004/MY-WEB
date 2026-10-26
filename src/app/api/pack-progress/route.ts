import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 打包进度 — 最新登记日期(北京时间, 按导入/登记日归批)的非多多面单数 vs 已提交到打包的面单数(多多面单号不参与进度)
// 同时返回 needs: 该批次每个商品的尺码需求/已找/剩余件数(供悬浮搜索卡片「本次找货」显示, 10s 轮询自动更新)
export async function GET() {
  try {
    // 最新一条售卖记录的登记日期(timestamptz), 排除多多面单号(多多开头)
    const { data: latest, error: latestErr } = await supabase
      .from("sales_records")
      .select("registration_date")
      .not("registration_date", "is", null)
      .not("tracking_number", "like", "多多%")
      .order("registration_date", { ascending: false })
      .limit(1);

    if (latestErr) {
      return NextResponse.json({ error: latestErr.message }, { status: 500 });
    }

    const latestRegTime = latest && latest.length > 0 ? String(latest[0].registration_date || "") : "";
    const parsed = latestRegTime ? new Date(latestRegTime) : null;
    if (!parsed || isNaN(parsed.getTime())) {
      return NextResponse.json({ date: "", total: 0, packed: 0, needs: {} });
    }

    // 北京时间日期(YYYY-MM-DD)与该日期的 UTC 起止
    const bjDate = new Date(parsed.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const startMs = new Date(`${bjDate}T00:00:00+08:00`).getTime();
    const startUtc = new Date(startMs).toISOString();
    const endUtc = new Date(startMs + 24 * 3600 * 1000).toISOString();

    // 该登记日期(北京时间)导入的所有售卖记录(面单号+商品+尺码+数量): 面单去重与尺码需求聚合共用
    const { data: sales, error: salesErr } = await supabase
      .from("sales_records")
      .select("tracking_number, sale_id, size, quantity")
      .gte("registration_date", startUtc)
      .lt("registration_date", endUtc)
      .not("tracking_number", "like", "多多%");

    if (salesErr) {
      return NextResponse.json({ error: salesErr.message }, { status: 500 });
    }

    const waybills = Array.from(
      new Set((sales || []).map((r) => String(r.tracking_number || "").trim()).filter((t) => t && t !== "0"))
    );
    const total = waybills.length;

    // 需求聚合: sale_id → 各尺码件数 + 总件数(本次导入全部记录, 不限当前搜索的面单)
    const needs: Record<string, { sizes: Record<string, number>; total: number; packed: number; remaining: number }> = {};
    for (const r of sales || []) {
      const sid = String(r.sale_id || "").trim();
      if (!sid) continue;
      const e = needs[sid] || (needs[sid] = { sizes: {}, total: 0, packed: 0, remaining: 0 });
      const qty = Number(r.quantity) || 0;
      const sizeKey = String(r.size ?? "");
      e.sizes[sizeKey] = (e.sizes[sizeKey] || 0) + qty;
      e.total += qty;
    }

    // 已提交打包(任意状态: 找齐/挂起/发货均算已提交)的面单数 + 本批次各商品已找件数
    // 注意: 商品明细在独立表 pack_items(按 pack_id 关联), pack_records 无 items 列,
    // select 带不存在的列会让整条查询报错 data=null 导致进度全0
    let packed = 0;
    if (total > 0) {
      // 全量拉打包记录(仅数百行, 与旧版进度逻辑一致); 同面单可能有多条(发货后可再建), 按 id 倒序取最新一条
      const { data: packs, error: packsErr } = await supabase
        .from("pack_records")
        .select("id, tracking_number")
        .order("id", { ascending: false });
      if (packsErr) console.error("pack-progress packs error:", packsErr.message);
      const packList = (packs || []) as { id: number; tracking_number: string }[];
      const latestByTn = new Map<string, number>();
      for (const p of packList) {
        const tn = String(p.tracking_number || "").trim();
        if (tn && !latestByTn.has(tn)) latestByTn.set(tn, p.id);
      }
      const batchPackIds = waybills
        .map((t) => latestByTn.get(t))
        .filter((id): id is number => typeof id === "number");
      packed = batchPackIds.length;

      // 已找件数: 本批次已提交面单的 pack_items 按 sale_id 求和(pack_id 分批查询, 100/批防 URL 超长)
      const CHUNK = 100;
      const chunks = Array.from({ length: Math.ceil(batchPackIds.length / CHUNK) }, (_, i) =>
        batchPackIds.slice(i * CHUNK, (i + 1) * CHUNK)
      );
      const results = await Promise.all(
        chunks.map((c) => supabase.from("pack_items").select("sale_id, quantity").in("pack_id", c))
      );
      for (const r of results) {
        if (r.error) {
          console.error("pack-progress items chunk error:", r.error.message);
          continue;
        }
        for (const it of (r.data || []) as { sale_id: string; quantity: number }[]) {
          const e = needs[String(it?.sale_id || "").trim()];
          if (e) e.packed += Number(it?.quantity) || 0;
        }
      }
    }
    for (const e of Object.values(needs)) e.remaining = Math.max(0, e.total - e.packed);

    return NextResponse.json({ date: bjDate, total, packed, needs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
