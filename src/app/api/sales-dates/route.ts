import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "sales" | "returns"
    const date = searchParams.get("date"); // YYYY-MM-DD

    // 带参数：返回该日期对应的 sale_ids 及各尺码聚合数据（用于管理栏日期筛选）
    if (type && date) {
      if (type === "sales") {
        // 从 sales_records 查该日期的所有记录，聚合各尺码数量
        const { data, error } = await supabase
          .from("sales_records")
          .select("sale_id, size, quantity, sell_price, order_time, tracking_number")
          .gte("order_time", `${date}T00:00:00`)
          .lte("order_time", `${date}T23:59:59`);
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
            const ot = String(r.order_time || "");
            const existing = records[sid].sell_price_info[String(sp)];
            if (!existing || ot > existing) {
              records[sid].sell_price_info[String(sp)] = ot;
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

    // 销售日期列表（从 sales_records 原始记录表读取，确保只显示实际有数据的日期）
    // 注意：Supabase 默认最多返回 1000 行，必须分页读取全表，否则日期列表被截断
    const salesDateSet = new Set<string>();
    {
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data: chunk, error: salesErr } = await supabase
          .from("sales_records")
          .select("order_time")
          .order("id", { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (salesErr) {
          console.error("sales_records 查询失败:", salesErr.message);
          break;
        }
        if (!chunk || chunk.length === 0) break;
        for (const r of chunk as any[]) {
          const ot = String(r.order_time || "");
          if (ot) salesDateSet.add(ot.slice(0, 10));
        }
        if (chunk.length < pageSize) break;
        page++;
      }
    }
    const salesDates = Array.from(salesDateSet).sort().reverse();

    // 退货日期列表（同样分页读取，避免超过 1000 行被截断）
    const returnDateSet = new Set<string>();
    {
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data: chunk, error: returnsErr } = await supabase
          .from("return_records")
          .select("return_time, created_at")
          .order("id", { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (returnsErr) {
          console.error("return_records 查询失败:", returnsErr.message);
          break;
        }
        if (!chunk || chunk.length === 0) break;
        for (const r of chunk as any[]) {
          const rt = String(r.return_time || r.created_at || "");
          if (rt) returnDateSet.add(rt.slice(0, 10));
        }
        if (chunk.length < pageSize) break;
        page++;
      }
    }
    const returnDates = Array.from(returnDateSet).sort().reverse();

    // 按 type 返回对应日期列表到 dates 字段（前端 fetchSalesDates/fetchReturnsDates 用 data.dates）
    if (type === "returns") {
      return NextResponse.json({ dates: returnDates, returnDates, salesDates });
    }
    return NextResponse.json({ dates: salesDates, salesDates, returnDates });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
