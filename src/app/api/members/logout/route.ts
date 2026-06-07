import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone } = body as { phone: string };

    if (!phone) {
      return NextResponse.json({ error: "缺少手机号" }, { status: 400 });
    }

    const { error } = await supabase
      .from("members")
      .update({ is_online: false })
      .eq("phone", phone);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}