import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shelfNo = searchParams.get("shelf_no");
  const checkSaleId = searchParams.get("check_sale_id");

  // 检查售卖编号是否已存在（检查 inbound_records 表）
  if (checkSaleId) {
    const { data, error } = await supabase
      .from("inbound_records")
      .select("sale_id")
      .eq("sale_id", checkSaleId)
      .limit(1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ exists: data && data.length > 0 });
  }

  let query = supabase
    .from("inbound_records")
    .select("*")
    .order("inbound_date", { ascending: false });

  if (shelfNo) {
    query = query.eq("shelf_no", shelfNo);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body.id || Date.now().toString();

    const product = {
      sale_id: body.sale_id || "",
      manufacturer: body.manufacturer || "",
      photo: body.photo || "",
      name: body.name || "",
      total_stock: Number(body.total_stock) || 0,
      shelf_no: body.shelf_no || "",
      size_80: Number(body.size_80) || 0,
      size_90: Number(body.size_90) || 0,
      size_95: Number(body.size_95) || 0,
      size_100: Number(body.size_100) || 0,
      size_105: Number(body.size_105) || 0,
      size_110: Number(body.size_110) || 0,
      size_120: Number(body.size_120) || 0,
      size_130: Number(body.size_130) || 0,
      size_140: Number(body.size_140) || 0,
      size_150: Number(body.size_150) || 0,
      size_160: Number(body.size_160) || 0,
      size_170: Number(body.size_170) || 0,
      size_180: Number(body.size_180) || 0,
      cost_price: Number(body.cost_price) || 0,
      notes: body.notes || "",
      season: body.season || "",
      style_category: body.style_category || "",
      inbound_date: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("inbound_records")
      .insert(product)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });

    const { error } = await supabase
      .from("inbound_records")
      .update(data)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: updated } = await supabase
      .from("inbound_records")
      .select("*")
      .eq("id", id)
      .single();

    return NextResponse.json(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });

  const { error } = await supabase.from("inbound_records").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}