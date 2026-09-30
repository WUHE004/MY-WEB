import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAlert } from "@/lib/alert";
import { computeDailyChannelStats } from "@/lib/daily-stats";

// Vercel Cron Job: 每月1号凌晨3点归档并清空 sales_records 表
// 归档口径与 sync-summary/backfill 一致: 渠道化(抖音/多多), 利润扣当日退货损失
export async function GET() {
  try {
    // 1. 读取所有销售记录，按渠道+日期汇总
    let allRecords: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_records")
        .select("registration_date, order_time, sell_price, quantity, sale_id, tracking_number")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      allRecords = allRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 获取入库记录的成本价
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

    // 读取退货记录(利润扣当日退货损失, 与明细重算口径一致, 归档后不重复扣)
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

    // 读取费率: 抖音快递三档/抖音抽点 + 多多抽点/多多每件快递
    const [shippingRatesRes, platformRateRes, ddRateRes, ddShipRes] = await Promise.all([
      supabase.from("settings").select("value").eq("key", "shipping_rates").single(),
      supabase.from("settings").select("value").eq("key", "platform_fee_rate").single(),
      supabase.from("settings").select("value").eq("key", "duoduo_fee_rate").single(),
      supabase.from("settings").select("value").eq("key", "duoduo_ship_per_item").single(),
    ]);
    const rates = (shippingRatesRes.data?.value as Record<string, unknown>) || {};

    const rows = computeDailyChannelStats(allRecords, allInbound, allReturns, {
      rate1: Number(rates.rate1) || 0,
      rate2: Number(rates.rate2) || 0,
      rate3: Number(rates.rate3) || 0,
      platformRate: Number(platformRateRes.data?.value) || 5,
      ddRate: Number(ddRateRes.data?.value) || 0.6,
      ddShip: Number(ddShipRes.data?.value) || 2,
    });

    // 2. Upsert 到 sales_daily_stats（按 (date, channel) 覆盖，幂等：重复执行不会重复累计）
    const upsertBatch = rows.map((r) => ({
      date: r.date,
      channel: r.channel,
      total_amount: r.total_amount,
      total_quantity: r.total_quantity,
      total_profit: r.total_profit,
      shipping_fee: r.shipping_fee,
      platform_fee: r.platform_fee,
    }));
    if (upsertBatch.length > 0) {
      const { error: upsertErr } = await supabase
        .from("sales_daily_stats")
        .upsert(upsertBatch, { onConflict: "date,channel" });
      if (upsertErr) {
        await sendAlert(`归档 sales_daily_stats 失败: ${upsertErr.message}\n已读取 ${allRecords.length} 条记录但归档失败，未清空原表！`);
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });
      }
    }

    // 3. 删除所有记录
    const { error: deleteErr } = await supabase
      .from("sales_records")
      .delete()
      .neq("id", 0);

    if (deleteErr) {
      console.error("清理 sales_records 失败:", deleteErr.message);
      await sendAlert(`清理 sales_records 失败（删除阶段）: ${deleteErr.message}\n已归档 ${allRecords.length} 条记录但未成功清空，请手动检查！`);
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    console.log(`[${new Date().toISOString()}] sales_records 已归档并清空（${allRecords.length} 条）`);
    return NextResponse.json({ success: true, message: `已归档 ${allRecords.length} 条记录并清空` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("清理 sales_records 异常:", msg);
    await sendAlert(`清理 sales_records 异常: ${msg}\n请手动检查数据是否已归档！`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}