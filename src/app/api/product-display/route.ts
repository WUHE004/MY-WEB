import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/product-display - 获取所有商品展示售价
export async function GET() {
  const { data, error } = await supabase
    .from("product_display")
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// POST /api/product-display - 设置/更新商品展示售价
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sale_id, sell_price } = body;

    if (!sale_id) {
      return NextResponse.json({ error: "sale_id 不能为空" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("product_display")
      .upsert({
        sale_id: sale_id.toUpperCase(),
        sell_price: Number(sell_price) || 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/product-display - 删除商品展示售价
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const saleId = searchParams.get("sale_id");

  if (!saleId) {
    return NextResponse.json({ error: "sale_id 不能为空" }, { status: 400 });
  }

  const { error } = await supabase
    .from("product_display")
    .delete()
    .eq("sale_id", saleId.toUpperCase());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "已删除" });
}