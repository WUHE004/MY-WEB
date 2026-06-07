import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 获取操作台整合数据
export async function GET() {
  try {
    // 1. 获取快递费率
    const { data: rateData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "shipping_rates")
      .single();

    const rates = (rateData?.value as Record<string, number>) || { rate1: 0, rate2: 0, rate3: 0 };
    const rate1 = Number(rates.rate1) || 0;
    const rate2 = Number(rates.rate2) || 0;
    const rate3 = Number(rates.rate3) || 0;

    // 2. 获取平台抽点率
    const { data: platformData } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "platform_fee_rate")
      .single();

    const platformRate = Number((platformData?.value as Record<string, number>)?.value || (platformData?.value as number) || 5);

    // 3. 获取最近有数据的日期
    const { data: salesData } = await supabase
      .from("sales_records")
      .select("order_time, tracking_number, quantity, sell_price, sale_id")
      .order("order_time", { ascending: false })
      .limit(5000);

    if (!salesData || salesData.length === 0) {
      return NextResponse.json({
        latest_shipping_fee: 0,
        latest_platform_fee: 0,
        latest_date: "",
        selected_count: 0,
        dates: [],
      });
    }

    // 提取所有日期
    const dateSet = new Set<string>();
    for (const row of salesData) {
      const ot = (row.order_time as string) || "";
      const d = ot.slice(0, 10);
      if (d) dateSet.add(d);
    }
    const dates = Array.from(dateSet).sort().reverse();

    // 最近日期
    const latestDate = dates[0] || "";

    // 获取入库记录的价格
    const { data: inboundData } = await supabase
      .from("inbound_records")
      .select("sale_id, cost_price");

    const costPriceMap = new Map<string, number>();
    for (const row of inboundData || []) {
      const sid = (row.sale_id as string || "").toUpperCase();
      const cp = Number(row.cost_price) || 0;
      if (sid && cp > 0) costPriceMap.set(sid, cp);
    }

    // 计算最近日期的快递费
    const latestRecords = salesData.filter((r) => {
      const ot = (r.order_time as string) || "";
      return ot.startsWith(latestDate);
    });

    // 按面单号分组
    const trackingMap = new Map<string, number>();
    let latestTotalQty = 0;
    let latestTotalRevenue = 0;

    for (const row of latestRecords) {
      const tn = (row.tracking_number as string || "").trim();
      const qty = Number(row.quantity) || 0;
      const sp = Number(row.sell_price) || 0;

      latestTotalQty += qty;
      latestTotalRevenue += sp * qty;

      if (tn && tn !== "0") {
        trackingMap.set(tn, (trackingMap.get(tn) || 0) + qty);
      }
    }

    let latestShippingFee = 0;
    for (const [, qty] of trackingMap) {
      if (qty <= 4) latestShippingFee += rate1;
      else if (qty <= 7) latestShippingFee += rate2;
      else latestShippingFee += rate3;
    }

    const latestPlatformFee = latestTotalQty >= 100
      ? latestTotalRevenue * (platformRate / 100)
      : 0;

    // 4. 获取直播选品数量
    const { data: selectionsData } = await supabase
      .from("live_selections")
      .select("sale_id");

    const uniqueSelected = new Set((selectionsData || []).map((r: { sale_id: string }) => r.sale_id));
    const selectedCount = uniqueSelected.size;

    return NextResponse.json({
      latest_shipping_fee: latestShippingFee,
      latest_platform_fee: latestPlatformFee,
      latest_date: latestDate,
      selected_count: selectedCount,
      dates,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}