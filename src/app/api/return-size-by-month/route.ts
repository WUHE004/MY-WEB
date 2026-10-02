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

// 按月聚合退货各尺码数量(仪表盘"退货尺码分布"图用)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("return_records")
      .select("size, quantity, return_time, created_at")
      .limit(10000);

    if (error) {
      console.error("return-size-by-month 查询失败:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const monthMap: Record<string, Record<string, number | string>> = {};
    for (const rec of data || []) {
      const date = toDateStr(rec.return_time) || toDateStr(rec.created_at);
      if (!date) continue;
      const month = date.slice(0, 7);
      if (!monthMap[month]) {
        monthMap[month] = { month };
        for (const s of ALL_SIZES) monthMap[month][`size_${s}`] = 0;
      }
      const sz = Number(rec.size) || 0;
      const qty = Number(rec.quantity) || 0;
      const sizeKey = `size_${sz}`;
      if (sizeKey in monthMap[month]) {
        monthMap[month][sizeKey] = (Number(monthMap[month][sizeKey]) || 0) + qty;
      }
    }

    const result = Object.values(monthMap).sort((a, b) =>
      String(a.month).localeCompare(String(b.month))
    );

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
