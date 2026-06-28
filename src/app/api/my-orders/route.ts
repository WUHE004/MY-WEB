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

      return NextResponse.json(data);
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

    return NextResponse.json(data);
  } catch (err) {
    console.error("Get my orders error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}