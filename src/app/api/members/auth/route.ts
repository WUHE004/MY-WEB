import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, phone, password, name, address } = body as {
      action: "login" | "register";
      phone: string;
      password: string;
      name?: string;
      address?: string;
    };

    if (!phone || !password) {
      return NextResponse.json({ error: "手机号和密码不能为空" }, { status: 400 });
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

      const token = Buffer.from(`${member.id}:${Date.now()}`).toString("base64");

      return NextResponse.json({
        token,
        name: member.name,
        role: member.role,
        phone: member.phone,
      });
    }

    return NextResponse.json({ error: "无效操作" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}