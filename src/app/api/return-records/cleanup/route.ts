import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendAlert } from "@/lib/alert";

// Vercel Cron Job: 每月1号凌晨3点归档并清空 return_records 表
export async function GET() {
  try {
    // 1. 读取所有退货记录，按日期汇总（退货日期用 return_time）
    let allRecords: Record<string, any>[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("return_records")
        .select("return_time, created_at, quantity")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error || !chunk || chunk.length === 0) break;
      allRecords = allRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 按日期汇总（优先用 return_time，没有时回退到 created_at）
    const dailyMap: Record<string, { date: string; total_returned: number }> = {};
    for (const row of allRecords) {
      const rt = (row.return_time as string) || (row.created_at as string) || "";
      if (!rt) continue;
      const date = rt.slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { date, total_returned: 0 };
      dailyMap[date].total_returned += Number(row.quantity) || 0;
    }

    // 2. Upsert 到 returns_daily_stats（累加）
    for (const [, stats] of Object.entries(dailyMap)) {
      const { data: existing } = await supabase
        .from("returns_daily_stats")
        .select("id, total_returned")
        .eq("date", stats.date)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("returns_daily_stats")
          .update({
            total_returned: Number(existing.total_returned) + stats.total_returned,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("returns_daily_stats").insert(stats);
      }
    }

    // 3. 删除所有记录
    const { error: deleteErr } = await supabase
      .from("return_records")
      .delete()
      .neq("id", 0);

    if (deleteErr) {
      console.error("清理 return_records 失败:", deleteErr.message);
      await sendAlert(`清理 return_records 失败（删除阶段）: ${deleteErr.message}\n已归档 ${allRecords.length} 条记录但未成功清空，请手动检查！`);
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    console.log(`[${new Date().toISOString()}] return_records 已归档并清空（${allRecords.length} 条）`);
    return NextResponse.json({ success: true, message: `已归档 ${allRecords.length} 条记录并清空` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("清理 return_records 异常:", msg);
    await sendAlert(`清理 return_records 异常: ${msg}\n请手动检查数据是否已归档！`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}