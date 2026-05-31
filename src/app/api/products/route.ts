import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

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
      id,
      sale_id: body.sale_id || "",
      manufacturer: body.manufacturer || "",
      photo: body.photo || "",
      name: body.name || "",
      total_stock: Number(body.total_stock) || 0,
      sold_qty: Number(body.sold_qty) || 0,
      remaining_stock: Number(body.remaining_stock) || 0,
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
      stock_warning: Number(body.stock_warning) || 10,
      cost_price: Number(body.cost_price) || 0,
      sell_price: Number(body.sell_price) || 0,
      profit: Number(body.profit) || 0,
      return_qty: Number(body.return_qty) || 0,
      return_rate: Number(body.return_rate) || 0,
      inventory_value: Number(body.inventory_value) || 0,
      last_order_time: body.last_order_time || "",
      status: body.status || "active",
    };

    const { data, error } = await supabase
      .from("products")
      .upsert(product, { onConflict: "id" })
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
      .from("products")
      .update(data)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: updated } = await supabase
      .from("products")
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

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}