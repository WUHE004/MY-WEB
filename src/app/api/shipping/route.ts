import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 获取快递费计算数据
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date"); // YYYY-MM-DD
  const rate1 = Number(searchParams.get("rate1")) || 0;
  const rate2 = Number(searchParams.get("rate2")) || 0;
  const rate3 = Number(searchParams.get("rate3")) || 0;

  try {
    // 多多每件快递费: 优先取页面传参, 未传时读 settings(默认 2 元/件)
    let ddShip = Number(searchParams.get("ddShip")) || 0;
    if (!ddShip) {
      const { data: sRes } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "duoduo_ship_per_item")
        .single();
      ddShip = Number(sRes?.value) || 2;
    }
    // 获取所有售卖记录
    let allRecords: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      let query = supabase
        .from("sales_records")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("order_time", { ascending: false });

      if (date) {
        query = query
          .gte("order_time", `${date}T00:00:00`)
          .lt("order_time", `${date}T23:59:59`);
      }

      const { data: chunk, error } = await query;
      if (error || !chunk || chunk.length === 0) break;
      allRecords = allRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 按面单号分组
    const trackingMap = new Map<string, {
      total_qty: number;
      order_time: string;
    }>();

    for (const row of allRecords) {
      const tn = (row.tracking_number as string || "").trim();
      const qty = Number(row.quantity) || 0;
      const ot = (row.order_time as string) || "";

      if (!tn || tn === "0") {
        // 面单号为0或空，跳过
        continue;
      }

      const existing = trackingMap.get(tn);
      if (existing) {
        existing.total_qty += qty;
        if (ot > existing.order_time) existing.order_time = ot;
      } else {
        trackingMap.set(tn, { total_qty: qty, order_time: ot });
      }
    }

    // 计算快递费
    // 抖音面单: 按件数分档(1-4件=1公斤/5-7件=2公斤/8件以上=3公斤)
    // 多多面单("多多+日期"): 按件计费 = 件数 × 每件单价, 不走重量分档
    const results: {
      tracking_number: string;
      total_qty: number;
      order_time: string;
      shipping_fee: number;
      weight_kg: number;
      per_item: boolean; // true=多多按件计费(重量列显示"按件")
    }[] = [];

    for (const [tn, info] of trackingMap) {
      let weightKg = 1;
      let fee = rate1;
      let perItem = false;

      if (tn.includes("多多")) {
        perItem = true;
        fee = info.total_qty * ddShip;
        weightKg = 0;
      } else if (info.total_qty <= 4) {
        weightKg = 1;
        fee = rate1;
      } else if (info.total_qty <= 7) {
        weightKg = 2;
        fee = rate2;
      } else {
        weightKg = 3;
        fee = rate3;
      }

      results.push({
        tracking_number: tn,
        total_qty: info.total_qty,
        order_time: info.order_time ? info.order_time.slice(0, 10) : "",
        shipping_fee: fee,
        weight_kg: weightKg,
        per_item: perItem,
      });
    }

    // 按面单号排序
    results.sort((a, b) => a.tracking_number.localeCompare(b.tracking_number));

    // 计算总快递费
    const totalFee = results.reduce((s, r) => s + r.shipping_fee, 0);

    return NextResponse.json({
      records: results,
      total_fee: totalFee,
      total_count: results.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}