import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSmsCode, generateCode } from "@/lib/aliyun-sms";

// POST /api/sms/send - 发送短信验证码
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, type } = body as {
      phone: string;
      type: "register" | "login" | "reset_password";
    };

    // 验证手机号格式
    if (!phone || !/^\d{11}$/.test(phone)) {
      return NextResponse.json({ error: "请输入有效的11位手机号" }, { status: 400 });
    }

    // 验证类型
    if (!type || !["register", "login", "reset_password"].includes(type)) {
      return NextResponse.json({ error: "无效的验证码类型" }, { status: 400 });
    }

    // 注册时检查手机号是否已存在
    if (type === "register") {
      const { data: existingMember } = await supabase
        .from("members")
        .select("id")
        .eq("phone", phone)
        .single();

      if (existingMember) {
        return NextResponse.json({ error: "该手机号已注册，请直接登录" }, { status: 400 });
      }
    }

    // 登录/重置密码时检查手机号是否存在
    if (type === "login" || type === "reset_password") {
      const { data: existingMember } = await supabase
        .from("members")
        .select("id")
        .eq("phone", phone)
        .single();

      if (!existingMember) {
        return NextResponse.json({ error: "该手机号未注册" }, { status: 400 });
      }
    }

    // 检查发送频率限制（60秒内只能发送1次）
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: recentCodes } = await supabase
      .from("sms_codes")
      .select("id")
      .eq("phone", phone)
      .eq("type", type)
      .gte("created_at", oneMinuteAgo);

    if (recentCodes && recentCodes.length > 0) {
      return NextResponse.json({ error: "验证码发送过于频繁，请稍后再试" }, { status: 400 });
    }

    // 生成6位随机验证码
    const code = generateCode();

    // 发送短信（阿里云）
    const smsResult = await sendSmsCode(phone, code);
    if (!smsResult.success) {
      return NextResponse.json({ error: smsResult.error || "短信发送失败" }, { status: 500 });
    }

    // 存储验证码记录（有效期5分钟）
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase.from("sms_codes").insert({
      phone,
      code,
      type,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error("Insert SMS code error:", insertError);
      return NextResponse.json({ error: "验证码保存失败" }, { status: 500 });
    }

    // 开发环境：返回验证码（方便测试）
    const isDev = !process.env.ALIYUN_SMS_ACCESS_KEY_ID;
    
    return NextResponse.json({
      success: true,
      message: "验证码已发送",
      // 开发环境返回验证码，生产环境不返回
      ...(isDev && { code })
    });
  } catch (err) {
    console.error("Send SMS error:", err);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}