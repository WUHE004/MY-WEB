import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { computeDailyChannelStats } from "@/lib/daily-stats";

// 手动触发日统计归档：从销售/入库/退货记录回填到 sales_daily_stats
// 渠道化口径: 按 (date, channel) 覆盖写入, 利润已扣当日退货损失
// 抖音: 快递按面单分档, 抽点按 settings.platform_fee_rate(无门槛)
// 多多: 快递 = 件数×duoduo_ship_per_item, 抽点 = 销售额×duoduo_fee_rate(无门槛)
export async function POST() {
  try {
    const diagnostics: string[] = [];

    // ========== 1. 全量读取销售记录 ==========
    let allSalesRecords: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_records")
        .select("registration_date, order_time, sell_price, quantity, sale_id, tracking_number")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      allSalesRecords = allSalesRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }
    diagnostics.push(`读取 ${allSalesRecords.length} 条销售记录`);

    // ========== 2. 全量读取入库成本 ==========
    let allInbound: Record<string, unknown>[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("inbound_records")
        .select("sale_id, cost_price")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      allInbound = allInbound.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // ========== 3. 全量读取退货记录 ==========
    let allReturns: Record<string, unknown>[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("return_records")
        .select("sale_id, quantity, return_price, return_time, created_at")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      allReturns = allReturns.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }
    diagnostics.push(`读取 ${allReturns.length} 条退货记录`);

    // ========== 4. 读取费率设置 ==========
    const [shippingRatesRes, platformRateRes, ddRateRes, ddShipRes] = await Promise.all([
      supabase.from("settings").select("value").eq("key", "shipping_rates").single(),
      supabase.from("settings").select("value").eq("key", "platform_fee_rate").single(),
      supabase.from("settings").select("value").eq("key", "duoduo_fee_rate").single(),
      supabase.from("settings").select("value").eq("key", "duoduo_ship_per_item").single(),
    ]);
    const rates = (shippingRatesRes.data?.value as Record<string, unknown>) || {};

    const rows = computeDailyChannelStats(allSalesRecords, allInbound, allReturns, {
      rate1: Number(rates.rate1) || 0,
      rate2: Number(rates.rate2) || 0,
      rate3: Number(rates.rate3) || 0,
      platformRate: Number(platformRateRes.data?.value) || 5,
      ddRate: Number(ddRateRes.data?.value) || 0.6,
      ddShip: Number(ddShipRes.data?.value) || 2,
    });

    // ========== 5. 按 (date, channel) 覆盖写入 ==========
    let salesSynced = 0;
    if (rows.length > 0) {
      const upsertRows = rows.map((r) => ({
        date: r.date,
        channel: r.channel,
        total_amount: r.total_amount,
        total_quantity: r.total_quantity,
        total_profit: r.total_profit,
        shipping_fee: r.shipping_fee,
        platform_fee: r.platform_fee,
      }));
      const { error: upsertErr } = await supabase
        .from("sales_daily_stats")
        .upsert(upsertRows, { onConflict: "date,channel" });
      if (upsertErr) {
        diagnostics.push(`销售日统计回填失败: ${upsertErr.message}`);
        return NextResponse.json({ error: upsertErr.message, diagnostics }, { status: 500 });
      }
      salesSynced = rows.length;
    }
    diagnostics.push(`销售日统计归档: ${salesSynced} 行(日期×渠道)`);

    // ========== 6. 回填 returns_daily_stats（退货趋势图用, 与利润口径独立）==========
    const retDailyMap = new Map<string, number>();
    for (const row of allReturns) {
      // 退货日期优先用 return_time，没有时回退到 created_at
      const rt = String(row.return_time || row.created_at || "");
      if (!rt) continue;
      const date = rt.slice(0, 10);
      retDailyMap.set(date, (retDailyMap.get(date) || 0) + (Number(row.quantity) || 0));
    }

    let returnsSynced = 0;
    if (retDailyMap.size > 0) {
      const retUpsertBatch = Array.from(retDailyMap.entries()).map(([date, totalReturned]) => ({
        date,
        total_returned: totalReturned,
      }));
      const { error: retUpsertErr } = await supabase
        .from("returns_daily_stats")
        .upsert(retUpsertBatch, { onConflict: "date" });
      if (retUpsertErr) {
        diagnostics.push(`退货日统计回填失败: ${retUpsertErr.message}`);
      } else {
        returnsSynced = retUpsertBatch.length;
      }
    }
    diagnostics.push(`退货日统计归档: ${returnsSynced} 天`);

    return NextResponse.json({
      success: true,
      sales_synced: salesSynced,
      returns_synced: returnsSynced,
      message: `已归档 ${salesSynced} 行渠道统计, ${returnsSynced} 天退货数据`,
      diagnostics,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("backfill-daily-stats error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
