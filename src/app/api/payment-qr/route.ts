import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/payment-qr - 获取收款码列表
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("payment_qr_codes")
      .select("*")
      .eq("is_active", true)
      .order("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// PUT /api/payment-qr - 更新收款码图片
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, image_url } = body;

    if (!id || !image_url) {
      return NextResponse.json({ error: "ID和图片URL不能为空" }, { status: 400 });
    }

    const { error } = await supabase
      .from("payment_qr_codes")
      .update({
        image_url,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST /api/payment-qr - 上传收款码（通过URL）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, image_url } = body;

    if (!type || !image_url) {
      return NextResponse.json({ error: "类型和图片URL不能为空" }, { status: 400 });
    }

    if (!["wechat", "alipay"].includes(type)) {
      return NextResponse.json({ error: "无效的支付类型" }, { status: 400 });
    }

    // 更新或插入
    const { data: existing } = await supabase
      .from("payment_qr_codes")
      .select("id")
      .eq("type", type)
      .single();

    if (existing) {
      // 更新
      const { error } = await supabase
        .from("payment_qr_codes")
        .update({
          image_url,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "收款码更新成功" });
    } else {
      // 插入
      const { error } = await supabase
        .from("payment_qr_codes")
        .insert({
          type,
          image_url,
          description: type === "wechat" ? "微信收款码" : "支付宝收款码"
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "收款码添加成功" });
    }
  } catch (err) {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}