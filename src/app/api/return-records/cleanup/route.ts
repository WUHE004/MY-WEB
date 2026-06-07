import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Vercel Cron Job: 每月1号凌晨3点自动清空 return_records 表
export async function GET() {
  try {
    const { error } = await supabase
      .from("return_records")
      .delete()
      .neq("id", 0);

    if (error) {
      console.error("清理 return_records 失败:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[${new Date().toISOString()}] return_records 表已自动清空`);
    return NextResponse.json({ success: true, message: "return_records 表已清空" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("清理 return_records 异常:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}