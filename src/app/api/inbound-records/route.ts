import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("inbound_records")
    .select("*")
    .order("inbound_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const totalStock =
      Number(body.size_80 || 0) +
      Number(body.size_90 || 0) +
      Number(body.size_95 || 0) +
      Number(body.size_100 || 0) +
      Number(body.size_105 || 0) +
      Number(body.size_110 || 0) +
      Number(body.size_120 || 0) +
      Number(body.size_130 || 0) +
      Number(body.size_140 || 0) +
      Number(body.size_150 || 0) +
      Number(body.size_160 || 0) +
      Number(body.size_170 || 0) +
      Number(body.size_180 || 0);

    const record = {
      inbound_date: body.inbound_date || new Date().toISOString(),
      sale_id: body.sale_id || "",
      photo: body.photo || "",
      name: body.name || "",
      manufacturer: body.manufacturer || "",
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
      shelf_no: body.shelf_no || "",
      total_stock: totalStock,
      cost_price: Number(body.cost_price) || 0,
      season: body.season || "",
      style_category: body.style_category || "",
      notes: body.notes || "",
    };

    const { data, error } = await supabase
      .from("inbound_records")
      .insert(record)
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