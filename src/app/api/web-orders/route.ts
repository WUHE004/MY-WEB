import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/web-orders - 获取网页下单记录
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("id");

  // 单个订单详情
  if (orderId) {
    const { data, error } = await supabase
      .from("web_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  // 全部订单列表
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
    const memberId = body.member_id || "";

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
      member_id: memberId,
      member_name: body.member_name || "",
      payment_status: "pending",
    };

    const { data: orderData, error: orderError } = await supabase
      .from("web_orders")
      .insert(order)
      .select()
      .single();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 400 });
    }

    // 2. 查找商品信息（从 inbound_records 获取基本信息）
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
        notes: `网页下单 #${orderData.id} - ${body.customer || "未知顾客"}`,
        registrant: "网页下单",
      });

    if (salesError) {
      console.error("Create sales record error:", salesError);
    }

    // 4. 返回包含 photo 的订单数据
    return NextResponse.json({ ...orderData, photo, product_name: productName }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PUT /api/web-orders - 更新订单状态（支付、物流）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId = body.id;

    if (!orderId) {
      return NextResponse.json({ error: "订单ID不能为空" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    // 更新支付状态
    if (body.payment_status) {
      updateData.payment_status = body.payment_status;
    }

    // 更新支付方式
    if (body.payment_method) {
      updateData.payment_method = body.payment_method;
    }

    // 更新物流信息
    if (body.tracking_number) {
      updateData.tracking_number = body.tracking_number;
    }
    if (body.shipping_status) {
      updateData.shipping_status = body.shipping_status;
    }
    if (body.shipping_company) {
      updateData.shipping_company = body.shipping_company;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "没有需要更新的字段" }, { status: 400 });
    }

    const { error } = await supabase
      .from("web_orders")
      .update(updateData)
      .eq("id", orderId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "订单更新成功" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/web-orders?id=xxx - 删除订单并恢复库存
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("id");

    if (!orderId) {
      return NextResponse.json({ error: "订单ID不能为空" }, { status: 400 });
    }

    // 1. 获取订单详情
    const { data: order, error: fetchError } = await supabase
      .from("web_orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    // 2. 删除 web_orders 记录
    const { error: deleteOrderError } = await supabase
      .from("web_orders")
      .delete()
      .eq("id", orderId);

    if (deleteOrderError) {
      return NextResponse.json({ error: deleteOrderError.message }, { status: 500 });
    }

    // 3. 找到并删除对应的 sales_records 记录（恢复库存）
    // 通过 notes 字段匹配 "网页下单 #orderId"
    const { data: salesRecords, error: findSalesError } = await supabase
      .from("sales_records")
      .select("id")
      .like("notes", `%#${orderId}%`);

    if (!findSalesError && salesRecords && salesRecords.length > 0) {
      // 删除售卖记录（summary表库存会自动恢复）
      for (const record of salesRecords) {
        await supabase
          .from("sales_records")
          .delete()
          .eq("id", record.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: "订单已删除，库存已恢复",
      deletedOrder: order
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}