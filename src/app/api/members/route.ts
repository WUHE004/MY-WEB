import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/members 或 /api/members?phone=xxx 或 /api/members?id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");
  const id = searchParams.get("id");

  // 按手机号查询单个会员
  if (phone) {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("phone", phone)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  }

  // 按ID查询单个会员
  if (id) {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  }

  // 返回全部会员
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, role, name, address, recipient, recipient_phone, douyin, password } = body as {
      id?: string;
      role?: string;
      name?: string;
      address?: string;
      recipient?: string;
      recipient_phone?: string;
      douyin?: string;
      password?: string;
    };

    if (!id) {
      return NextResponse.json({ error: "缺少ID" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (role) {
      if (!["admin", "customer", "operator"].includes(role)) {
        return NextResponse.json({ error: "无效的角色" }, { status: 400 });
      }
      updates.role = role;
    }
    if (name !== undefined) updates.name = name;
    if (address !== undefined) updates.address = address;
    if (recipient !== undefined) updates.recipient = recipient;
    if (recipient_phone !== undefined) updates.recipient_phone = recipient_phone;
    if (douyin !== undefined) updates.douyin = douyin;
    if (password !== undefined) updates.password = password;

    const { error } = await supabase
      .from("members")
      .update(updates)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "缺少ID" }, { status: 400 });
  }

  const { error } = await supabase.from("members").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}