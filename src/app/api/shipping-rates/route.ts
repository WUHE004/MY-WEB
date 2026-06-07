import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 获取快递费率设置
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "shipping_rates")
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rates = data?.value || { rate1: 0, rate2: 0, rate3: 0 };
    return NextResponse.json(rates);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: 保存快递费率设置
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rate1, rate2, rate3 } = body;

    const value = {
      rate1: Number(rate1) || 0,
      rate2: Number(rate2) || 0,
      rate3: Number(rate3) || 0,
    };

    const { error } = await supabase
      .from("settings")
      .upsert({ key: "shipping_rates", value }, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rates: value });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}