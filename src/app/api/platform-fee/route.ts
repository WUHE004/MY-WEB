import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 平台抽点统计
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rate = Number(searchParams.get("rate")) || 5; // 默认5%
  const rate1 = Number(searchParams.get("rate1")) || 0;
  const rate2 = Number(searchParams.get("rate2")) || 0;
  const rate3 = Number(searchParams.get("rate3")) || 0;

  try {
    // 获取所有售卖记录
    let allRecords: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_records")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("order_time", { ascending: false });

      if (error || !chunk || chunk.length === 0) break;
      allRecords = allRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 按日期分组
    const dateMap = new Map<string, {
      total_qty: number;
      total_revenue: number;
      total_cost: number;
      trackingNumbers: Map<string, number>; // tracking_number -> total_qty
    }>();

    // 获取所有入库记录的价格信息
    const { data: inboundData } = await supabase
      .from("inbound_records")
      .select("sale_id, cost_price");

    const costPriceMap = new Map<string, number>();
    for (const row of inboundData || []) {
      const sid = (row.sale_id as string || "").toUpperCase();
      const cp = Number(row.cost_price) || 0;
      if (sid && cp > 0) costPriceMap.set(sid, cp);
    }

    for (const row of allRecords) {
      const ot = (row.order_time as string) || "";
      const date = ot.slice(0, 10);
      if (!date) continue;

      const qty = Number(row.quantity) || 0;
      const sp = Number(row.sell_price) || 0;
      const sid = (row.sale_id as string || "").toUpperCase();
      const cp = costPriceMap.get(sid) || 0;
      const tn = (row.tracking_number as string || "").trim();

      const existing = dateMap.get(date);
      if (existing) {
        existing.total_qty += qty;
        existing.total_revenue += sp * qty;
        existing.total_cost += cp * qty;
        if (tn && tn !== "0") {
          existing.trackingNumbers.set(tn, (existing.trackingNumbers.get(tn) || 0) + qty);
        }
      } else {
        const trackingNumbers = new Map<string, number>();
        if (tn && tn !== "0") trackingNumbers.set(tn, qty);
        dateMap.set(date, {
          total_qty: qty,
          total_revenue: sp * qty,
          total_cost: cp * qty,
          trackingNumbers,
        });
      }
    }

    // 计算每日快递费
    const results: {
      date: string;
      total_qty: number;
      total_revenue: number;
      total_cost: number;
      total_profit: number;
      shipping_fee: number;
      platform_fee: number;
      net_profit: number;
    }[] = [];

    for (const [date, info] of dateMap) {
      let shippingFee = 0;
      for (const [, qty] of info.trackingNumbers) {
        if (qty <= 4) shippingFee += rate1;
        else if (qty <= 7) shippingFee += rate2;
        else shippingFee += rate3;
      }

      const platformFee = info.total_qty >= 100
        ? info.total_revenue * (rate / 100)
        : 0;

      const totalProfit = info.total_revenue - info.total_cost;
      const netProfit = totalProfit - shippingFee - platformFee;

      results.push({
        date,
        total_qty: info.total_qty,
        total_revenue: info.total_revenue,
        total_cost: info.total_cost,
        total_profit: totalProfit,
        shipping_fee: shippingFee,
        platform_fee: platformFee,
        net_profit: netProfit,
      });
    }

    results.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      records: results,
      total_revenue: results.reduce((s, r) => s + r.total_revenue, 0),
      total_cost: results.reduce((s, r) => s + r.total_cost, 0),
      total_profit: results.reduce((s, r) => s + r.total_profit, 0),
      total_shipping: results.reduce((s, r) => s + r.shipping_fee, 0),
      total_platform_fee: results.reduce((s, r) => s + r.platform_fee, 0),
      total_net_profit: results.reduce((s, r) => s + r.net_profit, 0),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}