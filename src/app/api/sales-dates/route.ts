import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 并行拉取全表：先 count 总数，再并行请求所有分页
// （取代逐页串行，2万+条售卖记录的日期列表拉取从 ~8s 降到 ~1s）
const PAGE_SIZE = 1000;

async function fetchAllRows(
  table: string,
  select: string
): Promise<{ rows: Record<string, any>[]; error: string | null }> {
  const { count, error: countErr } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (countErr) return { rows: [], error: countErr.message };
  if (!count || count === 0) return { rows: [], error: null };

  const pages = Math.ceil(count / PAGE_SIZE) + 1;
  const results = await Promise.all(
    Array.from({ length: pages }, (_, p) =>
      supabase
        .from(table)
        .select(select)
        .order("id", { ascending: true })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
    )
  );

  const rows: Record<string, any>[] = [];
  for (const r of results) {
    if (r.error) return { rows: [], error: r.error.message };
    if (r.data) rows.push(...(r.data as Record<string, any>[]));
  }
  return { rows, error: null };
}

// 时区安全取日期(北京时间): 数据库返回 UTC ISO 字符串, 直接 slice 会差一天
function toDateStr(v: unknown): string {
  if (!v) return "";
  try {
    return new Date(v as string).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  } catch {
    return String(v).slice(0, 10);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "sales" | "returns"
    const date = searchParams.get("date"); // YYYY-MM-DD

    // 带参数：返回该日期对应的 sale_ids 及各尺码聚合数据（用于管理栏日期筛选）
    if (type && date) {
      if (type === "sales") {
        // 从 sales_records 查该日期(按登记日期,北京时间)的所有记录，聚合各尺码数量
        const { data, error } = await supabase
          .from("sales_records")
          .select("sale_id, size, quantity, sell_price, registration_date, tracking_number")
          .gte("registration_date", `${date}T00:00:00+08:00`)
          .lte("registration_date", `${date}T23:59:59+08:00`);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // 按 sale_id 聚合
        const records: Record<string, any> = {};
        const saleIds: string[] = [];
        const trackingSets: Record<string, Set<string>> = {};
        for (const r of (data || []) as any[]) {
          const sid = String(r.sale_id || "").toUpperCase();
          if (!sid) continue;
          if (!records[sid]) {
            records[sid] = {
              sale_id: sid,
              total: 0,
              total_revenue: 0,
              sell_price_info: {} as Record<string, string>,
              sales_count: 0,
            };
            for (const s of ALL_SIZES) records[sid][`size_${s}`] = 0;
            trackingSets[sid] = new Set<string>();
            saleIds.push(sid);
          }
          const qty = Number(r.quantity) || 0;
          const sz = Number(r.size) || 0;
          const sp = Number(r.sell_price) || 0;
          if (sz >= 80 && sz <= 180) {
            const key = `size_${sz}`;
            records[sid][key] = (records[sid][key] || 0) + qty;
          }
          records[sid].total += qty;
          records[sid].total_revenue += sp * qty;
          if (sp > 0) {
            const rd = String(r.registration_date || "");
            const existing = records[sid].sell_price_info[String(sp)];
            if (!existing || rd > existing) {
              records[sid].sell_price_info[String(sp)] = rd;
            }
          }
          const tn = String(r.tracking_number || "").trim();
          if (tn) trackingSets[sid].add(tn);
        }

        // 计算 sales_count（不同快递单号数）
        for (const sid of saleIds) {
          records[sid].sales_count = trackingSets[sid].size;
        }

        return NextResponse.json({ sale_ids: saleIds, records });
      } else if (type === "returns") {
        // 从 return_records 查该日期的 sale_ids 及各尺码聚合（退货日期用 return_time，回退 created_at）
        const { data, error } = await supabase
          .from("return_records")
          .select("sale_id, size, quantity, return_price, return_time, created_at");
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // 按日期过滤 + 按 sale_id 聚合
        const records: Record<string, any> = {};
        const saleIds: string[] = [];
        for (const r of (data || []) as any[]) {
          const rt = String(r.return_time || r.created_at || "");
          if (rt.slice(0, 10) !== date) continue;
          const sid = String(r.sale_id || "").toUpperCase();
          if (!sid) continue;
          if (!records[sid]) {
            records[sid] = {
              sale_id: sid,
              total: 0,
              total_return_amount: 0,
              return_price_info: {} as Record<string, string>,
              return_count: 0,
            };
            for (const s of ALL_SIZES) records[sid][`size_${s}`] = 0;
            saleIds.push(sid);
          }
          const qty = Number(r.quantity) || 0;
          const sz = Number(r.size) || 0;
          const rp = Number(r.return_price) || 0;
          if (sz >= 80 && sz <= 180) {
            const key = `size_${sz}`;
            records[sid][key] = (records[sid][key] || 0) + qty;
          }
          records[sid].total += qty;
          records[sid].total_return_amount += rp * qty;
          if (rp > 0) {
            const existing = records[sid].return_price_info[String(rp)];
            if (!existing || rt > existing) {
              records[sid].return_price_info[String(rp)] = rt;
            }
          }
        }

        return NextResponse.json({ sale_ids: saleIds, records });
      }
    }

    // 仅 type 无 date：返回对应类型的日期列表
    // 无参数：返回两类日期列表

    // 销售日期列表 + 退货日期列表：两表并行拉取，每表内部并行分页
    const [salesRes, returnsRes] = await Promise.all([
      fetchAllRows("sales_records", "registration_date"),
      fetchAllRows("return_records", "return_time,created_at"),
    ]);

    const salesDateSet = new Set<string>();
    for (const r of salesRes.rows) {
      const rd = toDateStr(r.registration_date);
      if (rd) salesDateSet.add(rd);
    }
    const salesDates = Array.from(salesDateSet).sort().reverse();

    const returnDateSet = new Set<string>();
    for (const r of returnsRes.rows) {
      const rt = String(r.return_time || r.created_at || "");
      if (rt) returnDateSet.add(rt.slice(0, 10));
    }
    const returnDates = Array.from(returnDateSet).sort().reverse();

    // 按 type 返回对应日期列表到 dates 字段（前端 fetchSalesDates/fetchReturnsDates 用 data.dates）
    // 日期列表一天最多变一次（当天首笔新增日期），CDN 缓存 60 秒：
    // 既避免重复全表拉取，又让新日期最多延迟1分钟出现在下拉框
    const response =
      type === "returns"
        ? NextResponse.json({ dates: returnDates, returnDates, salesDates })
        : NextResponse.json({ dates: salesDates, salesDates, returnDates });
    response.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
