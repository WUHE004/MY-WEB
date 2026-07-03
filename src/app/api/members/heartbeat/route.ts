import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { member_id, offline } = body;

    // 优先使用 proxy 注入的身份（更可信，不可伪造）
    const userIdFromProxy = request.headers.get("x-user-id");
    const verifiedMemberId = userIdFromProxy || member_id;

    if (!verifiedMemberId) {
      return NextResponse.json({ error: "缺少 member_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("members")
      .update({
        is_online: !offline,
        last_online: new Date().toISOString(),
      })
      .eq("id", verifiedMemberId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
