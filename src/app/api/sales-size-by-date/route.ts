import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 时区安全取日期(北京时间): 数据库返回 UTC ISO 字符串, 直接 slice 会差一天
function toDateStr(v: unknown): string {
  if (!v) return "";
  try {
    return new Date(v as string).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  } catch {
    return String(v).slice(0, 10);
  }
}

// 按日期聚合各尺码售出数量（从 sales_records 原始表读取，按登记日期归档）
export async function GET() {
  try {
    // 并行拉取全表：count + 全页并行（原先 21 页串行 ~7.4s，并行后 ~1.5s）
    // 排序加 id 次级键保证分页确定性（registration_date 存在大量同值组）
    const PAGE_SIZE = 1000;
    const { count, error: countErr } = await supabase
      .from("sales_records")
      .select("registration_date", { count: "exact", head: true });

    let allRecords: Record<string, unknown>[] = [];
    if (!countErr && count && count > 0) {
      const pages = Math.ceil(count / PAGE_SIZE) + 1;
      const results = await Promise.all(
        Array.from({ length: pages }, (_, p) =>
          supabase
            .from("sales_records")
            .select("registration_date, order_time, size, quantity")
            .order("registration_date", { ascending: false })
            .order("id", { ascending: false })
            .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
        )
      );
      for (const r of results) {
        if (r.error) {
          console.error("sales-size-by-date 查询失败:", r.error.message);
          break;
        }
        if (r.data) allRecords = allRecords.concat(r.data as unknown as Record<string, unknown>[]);
      }
    } else if (countErr) {
      console.error("sales-size-by-date count 失败:", countErr.message);
    }

    // 按登记日期聚合各尺码数量
    const dailyMap: Record<string, Record<string, number | string>> = {};
    for (const rec of allRecords) {
      const date = toDateStr(rec.registration_date) || toDateStr(rec.order_time);
      if (!date) continue;
      if (!dailyMap[date]) {
        dailyMap[date] = { date };
        for (const s of ALL_SIZES) dailyMap[date][`size_${s}`] = 0;
      }
      const sz = Number(rec.size) || 0;
      const qty = Number(rec.quantity) || 0;
      const sizeKey = `size_${sz}`;
      if (sizeKey in dailyMap[date]) {
        dailyMap[date][sizeKey] = (Number(dailyMap[date][sizeKey]) || 0) + qty;
      }
    }

    const result = Object.values(dailyMap).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
