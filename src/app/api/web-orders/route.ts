import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/web-orders - 获取网页下单记录
export async function GET() {
  const { data, error } = await supabase
    .from("web_orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/web-orders - 创建网页下单（同时创建售卖记录以扣减库存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const saleId = body.sale_id || "";
    const size = Number(body.size) || 0;
    const quantity = Number(body.quantity) || 1;
    const sellPrice = Number(body.sell_price) || 0;

    // 1. 插入网页下单记录
    const order = {
      customer: body.customer || "",
      address: body.address || "",
      recipient: body.recipient || "",
      recipient_phone: body.recipient_phone || "",
      sale_id: saleId,
      size,
      quantity,
      sell_price: sellPrice,
      total_price: quantity * sellPrice,
    };

    const { data: orderData, error: orderError } = await supabase
      .from("web_orders")
      .insert(order)
      .select()
      .single();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 400 });
    }

    // 2. 查找商品信息（从 summary 或 inbound_records 获取基本信息）
    const { data: inboundRecord } = await supabase
      .from("inbound_records")
      .select("*")
      .eq("sale_id", saleId)
      .limit(1)
      .single();

    const productName = inboundRecord?.name || "";
    const photo = inboundRecord?.photo || "";
    const manufacturer = inboundRecord?.manufacturer || "";
    const costPrice = Number(inboundRecord?.cost_price) || 0;
    const shelfNo = inboundRecord?.shelf_no || "";
    const profit = sellPrice - costPrice;
    const totalProfit = profit * quantity;

    // 3. 创建售卖记录（用于总表库存扣减）
    const { error: salesError } = await supabase
      .from("sales_records")
      .insert({
        sale_id: saleId,
        size,
        quantity,
        sell_price: sellPrice,
        cost_price: costPrice,
        profit,
        total_profit: totalProfit,
        product_name: productName,
        photo,
        manufacturer,
        shelf_no: shelfNo,
        notes: `网页下单 - ${body.customer || "未知顾客"}`,
        registrant: "网页下单",
      });

    if (salesError) {
      console.error("Create sales record error:", salesError);
    }

    return NextResponse.json(orderData, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}