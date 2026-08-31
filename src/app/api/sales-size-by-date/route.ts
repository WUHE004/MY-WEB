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
    // 分页读取所有售出记录的 registration_date 和 size 字段
    let allRecords: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_records")
        .select("registration_date, order_time, size, quantity")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) {
        console.error("sales-size-by-date 查询失败:", error.message);
        break;
      }
      if (!chunk || chunk.length === 0) break;
      allRecords = allRecords.concat(chunk as unknown as Record<string, unknown>[]);
      if (chunk.length < pageSize) break;
      page++;
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
