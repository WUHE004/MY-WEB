import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("model_library")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, photo_url } = body;

    if (!name || !photo_url) {
      return NextResponse.json({ error: "缺少 name 或 photo_url" }, { status: 400 });
    }

    const { data: maxData, error: maxError } = await supabase
      .from("model_library")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxError) {
      return NextResponse.json({ error: maxError.message }, { status: 500 });
    }

    const maxOrder = maxData?.sort_order ?? -1;

    const { data, error } = await supabase
      .from("model_library")
      .insert({ name, photo_url, sort_order: maxOrder + 1 })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { orders } = body;

    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json({ error: "缺少 orders 或格式错误" }, { status: 400 });
    }

    for (const o of orders) {
      if (!o.id || typeof o.sort_order !== "number") continue;
      await supabase
        .from("model_library")
        .update({ sort_order: o.sort_order })
        .eq("id", o.id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("model_library")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
