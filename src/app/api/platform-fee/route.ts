import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeDailyChannelStats, type Channel } from "@/lib/daily-stats";

// 平台抽点统计(渠道化实时重算, 含退货扣减)
// 抖音: 快递按面单分档 rate1/2/3, 抽点 = 销售额×rate%(无门槛)
// 多多: 快递 = 件数×ddShip 元, 抽点 = 销售额×ddRate%(无门槛)
// 返回: records 按 (date, channel) 逐行; totals 分渠道 + 合计

interface ChannelTotals {
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  total_shipping: number;
  total_platform_fee: number;
  total_net_profit: number;
  total_qty: number;
}

function emptyTotals(): ChannelTotals {
  return { total_revenue: 0, total_cost: 0, total_profit: 0, total_shipping: 0, total_platform_fee: 0, total_net_profit: 0, total_qty: 0 };
}

async function readAll(table: string, select: string): Promise<Record<string, unknown>[]> {
  let out: Record<string, unknown>[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: chunk, error } = await supabase
      .from(table)
      .select(select)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error || !chunk || chunk.length === 0) break;
    out = out.concat(chunk as unknown as Record<string, unknown>[]);
    if (chunk.length < pageSize) break;
    page++;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rate = Number(searchParams.get("rate")) || 5; // 抖音抽点%, 默认5
  const rate1 = Number(searchParams.get("rate1")) || 0;
  const rate2 = Number(searchParams.get("rate2")) || 0;
  const rate3 = Number(searchParams.get("rate3")) || 0;
  const ddRate = Number(searchParams.get("ddRate")) || 0.6; // 多多抽点%, 默认0.6
  const ddShip = Number(searchParams.get("ddShip")) || 2; // 多多每件快递元, 默认2

  try {
    const [sales, inbound, returns] = await Promise.all([
      readAll("sales_records", "sale_id, sell_price, quantity, tracking_number, registration_date, order_time"),
      readAll("inbound_records", "sale_id, cost_price"),
      readAll("return_records", "sale_id, quantity, return_price, return_time, created_at"),
    ]);

    const rows = computeDailyChannelStats(sales, inbound, returns, { rate1, rate2, rate3, platformRate: rate, ddRate, ddShip });

    // total_cost 拆分: profit + cost = revenue(毛利口径), 由 profit 反推 cost 展示
    const totals: Record<"douyin" | "duoduo" | "all", ChannelTotals> = {
      douyin: emptyTotals(),
      duoduo: emptyTotals(),
      all: emptyTotals(),
    };
    const perDay = new Map<string, { date: string; channel: Channel; total_qty: number; total_revenue: number; total_cost: number; total_profit: number; shipping_fee: number; platform_fee: number; net_profit: number }>();
    for (const r of rows) {
      const cost = r.total_amount - r.total_profit - r.return_loss; // 反推进货成本(退货损失单列)
      const rec = {
        date: r.date,
        channel: r.channel,
        total_qty: r.total_quantity,
        total_revenue: r.total_amount,
        total_cost: cost,
        return_loss: r.return_loss,
        total_profit: r.total_profit,
        shipping_fee: r.shipping_fee,
        platform_fee: r.platform_fee,
        net_profit: r.total_profit - r.shipping_fee - r.platform_fee,
      };
      perDay.set(`${r.date}|${r.channel}`, rec);
      const t = totals[r.channel];
      t.total_revenue += rec.total_revenue;
      t.total_cost += rec.total_cost;
      t.total_profit += rec.total_profit;
      t.total_shipping += rec.shipping_fee;
      t.total_platform_fee += rec.platform_fee;
      t.total_net_profit += rec.net_profit;
      t.total_qty += rec.total_qty;
      const a = totals.all;
      a.total_revenue += rec.total_revenue;
      a.total_cost += rec.total_cost;
      a.total_profit += rec.total_profit;
      a.total_shipping += rec.shipping_fee;
      a.total_platform_fee += rec.platform_fee;
      a.total_net_profit += rec.net_profit;
      a.total_qty += rec.total_qty;
    }

    const records = Array.from(perDay.values()).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      records,
      totals,
      total_revenue: totals.all.total_revenue,
      total_cost: totals.all.total_cost,
      total_profit: totals.all.total_profit,
      total_shipping: totals.all.total_shipping,
      total_platform_fee: totals.all.total_platform_fee,
      total_net_profit: totals.all.total_net_profit,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
