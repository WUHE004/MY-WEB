import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/products/transfer-shelf - 批量搬运商品到新货架
export async function POST(request: Request) {
  try {
    const { fromShelf, toShelf } = await request.json();

    if (!fromShelf || !toShelf) {
      return NextResponse.json({ error: "缺少源货架或目标货架" }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from("products")
      .update({ shelf_no: toShelf })
      .eq("shelf_no", fromShelf)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: (updated || []).length,
      fromShelf,
      toShelf,
    });
  } catch (err) {
    return NextResponse.json({ error: "搬运失败" }, { status: 500 });
  }
}