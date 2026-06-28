import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/my-orders?member_id=xxx - 获取用户自己的订单列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get("member_id");
    const orderId = searchParams.get("order_id");

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

      // 数据隔离：验证订单属于该用户
      if (memberId && data.member_id !== memberId) {
        return NextResponse.json({ error: "无权查看此订单" }, { status: 403 });
      }

      // 查询商品信息（从 inbound_records 获取照片和名称）
      let photo = "";
      let product_name = "";
      if (data?.sale_id) {
        const { data: inboundRecord } = await supabase
          .from("inbound_records")
          .select("name, photo")
          .eq("sale_id", data.sale_id)
          .limit(1)
          .single();
        if (inboundRecord) {
          photo = inboundRecord.photo || "";
          product_name = inboundRecord.name || "";
        }
      }

      return NextResponse.json({ ...data, photo, product_name });
    }

    // 订单列表
    if (!memberId) {
      return NextResponse.json({ error: "请提供会员ID" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("web_orders")
      .select("*")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 批量查询商品信息
    const saleIds = data?.map(o => o.sale_id).filter(Boolean) || [];
    let productMap: Record<string, { name: string; photo: string }> = {};
    
    if (saleIds.length > 0) {
      const { data: inboundRecords } = await supabase
        .from("inbound_records")
        .select("sale_id, name, photo")
        .in("sale_id", saleIds);
      
      if (inboundRecords) {
        inboundRecords.forEach(r => {
          productMap[r.sale_id] = { name: r.name || "", photo: r.photo || "" };
        });
      }
    }

    // 合并商品信息到订单数据
    const enrichedData = data?.map(order => ({
      ...order,
      photo: productMap[order.sale_id]?.photo || "",
      product_name: productMap[order.sale_id]?.name || "",
    })) || [];

    return NextResponse.json(enrichedData);
  } catch (err) {
    console.error("Get my orders error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}