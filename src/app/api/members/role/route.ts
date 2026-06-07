import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("member_id");

  if (!memberId) {
    return NextResponse.json({ error: "缺少member_id" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("members")
    .select("role")
    .eq("id", memberId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "成员不存在" }, { status: 404 });
  }

  return NextResponse.json({ role: data.role });
}