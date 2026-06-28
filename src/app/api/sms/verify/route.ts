import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/sms/verify - 验证短信验证码
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, code, type } = body as {
      phone: string;
      code: string;
      type: "register" | "login" | "reset_password";
    };

    // 验证参数
    if (!phone || !code || !type) {
      return NextResponse.json({ error: "手机号、验证码和类型不能为空" }, { status: 400 });
    }

    if (!/^\d{11}$/.test(phone)) {
      return NextResponse.json({ error: "手机号格式不正确" }, { status: 400 });
    }

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "验证码格式不正确" }, { status: 400 });
    }

    // 查找未使用的验证码
    const { data: records, error } = await supabase
      .from("sms_codes")
      .select("*")
      .eq("phone", phone)
      .eq("code", code)
      .eq("type", type)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Query SMS code error:", error);
      return NextResponse.json({ error: "验证码查询失败" }, { status: 500 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json({ error: "验证码无效或已过期" }, { status: 400 });
    }

    // 标记验证码已使用
    await supabase
      .from("sms_codes")
      .update({ used: true })
      .eq("id", records[0].id);

    return NextResponse.json({ success: true, message: "验证码验证成功" });
  } catch (err) {
    console.error("Verify SMS error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}