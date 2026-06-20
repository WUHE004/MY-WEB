import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/photo-gen/usage?member_id=xxx
// 返回该用户各模型的使用次数
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("member_id");

  if (!memberId) {
    return NextResponse.json({ error: "缺少 member_id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("model_usage")
    .select("model_name")
    .eq("member_id", memberId);

  if (error) {
    console.error("查询用量失败:", error.message);
    // 表不存在时返回空对象
    return NextResponse.json({});
  }

  // 按 model_name 聚合计数
  const usage: Record<string, number> = {};
  for (const row of data || []) {
    usage[row.model_name] = (usage[row.model_name] || 0) + 1;
  }

  return NextResponse.json(usage);
}