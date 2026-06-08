import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 获取所有模特
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("model_library")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 新增模特
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, photo_url } = body;

    if (!name || !photo_url) {
      return NextResponse.json({ error: "缺少 name 或 photo_url" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("model_library")
      .insert({ name, photo_url })
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

// DELETE: 删除模特
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