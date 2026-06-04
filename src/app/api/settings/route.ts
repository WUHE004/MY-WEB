import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/settings - 获取所有设置
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result: Record<string, unknown> = {};
    (data || []).forEach((row: { key: string; value: unknown }) => {
      result[row.key] = row.value;
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: "获取设置失败" }, { status: 500 });
  }
}

// PUT /api/settings - 更新设置（批量）
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const entries = Object.entries(body) as [string, unknown][];

    for (const [key, value] of entries) {
      const { error } = await supabase
        .from("settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "更新设置失败" }, { status: 500 });
  }
}