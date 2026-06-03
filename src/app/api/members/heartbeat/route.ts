import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { member_id, offline } = body;

    if (!member_id) {
      return NextResponse.json({ error: "缺少member_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("members")
      .update({
        is_online: !offline,
        last_online: new Date().toISOString(),
      })
      .eq("phone", member_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}