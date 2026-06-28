import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, phone, password, name, address } = body as {
      action: "login" | "register" | "reset_password";
      phone: string;
      password: string;
      name?: string;
      address?: string;
    };

    if (!phone) {
      return NextResponse.json({ error: "手机号不能为空" }, { status: 400 });
    }

    // 重置密码
    if (action === "reset_password") {
      if (!password || password.length < 6) {
        return NextResponse.json({ error: "密码至少6位" }, { status: 400 });
      }

      // 查找用户
      const { data: member, error: findError } = await supabase
        .from("members")
        .select("id")
        .eq("phone", phone)
        .single();

      if (findError || !member) {
        return NextResponse.json({ error: "该手机号未注册" }, { status: 404 });
      }

      // 更新密码
      const { error: updateError } = await supabase
        .from("members")
        .update({ password })
        .eq("id", member.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: "密码重置成功" });
    }

    if (!password) {
      return NextResponse.json({ error: "密码不能为空" }, { status: 400 });
    }

    if (action === "register") {
      if (!name) {
        return NextResponse.json({ error: "用户名不能为空" }, { status: 400 });
      }

      const { data: existing } = await supabase
        .from("members")
        .select("id")
        .eq("phone", phone)
        .single();

      if (existing) {
        return NextResponse.json({ error: "该手机号已注册" }, { status: 400 });
      }

      const { error } = await supabase.from("members").insert({
        phone,
        password,
        name,
        address: address || "",
        role: "customer",
        phone_verified: true,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "login") {
      const { data: member, error } = await supabase
        .from("members")
        .select("*")
        .eq("phone", phone)
        .eq("password", password)
        .single();

      if (error || !member) {
        return NextResponse.json({ error: "手机号或密码错误" }, { status: 401 });
      }

      // 更新在线状态
      await supabase
        .from("members")
        .update({ is_online: true, last_online: new Date().toISOString() })
        .eq("id", member.id);

      const token = Buffer.from(`${member.id}:${Date.now()}`).toString("base64");

      return NextResponse.json({
        token,
        name: member.name,
        role: member.role,
        phone: member.phone,
        id: member.id,
      });
    }

    return NextResponse.json({ error: "无效操作" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}