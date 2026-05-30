import { NextRequest, NextResponse } from "next/server";
import { initDatabase } from "@/lib/schema";
import { getAccounts, createAccount, updateAccount, deleteAccount } from "@/lib/queries";

export async function GET() {
  await initDatabase();
  const accounts = getAccounts();
  return NextResponse.json(accounts);
}

export async function POST(request: NextRequest) {
  await initDatabase();
  try {
    const body = await request.json();
    const id = body.id || Date.now().toString();
    createAccount({
      id,
      name: body.name || "",
      platform: body.platform || "小红书",
      handle: body.handle || "",
      followers: body.followers || 0,
      posts: body.posts || 0,
      engagement: body.engagement || 0,
      status: body.status || "active",
      avatar: body.avatar || "bg-[#4A90E2]",
      growth: body.growth || 0,
    });
    return NextResponse.json({ id, ...body }, { status: 201 });
  } catch (error) {
    console.error("Create account error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  await initDatabase();
  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });
    updateAccount(id, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update account error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  await initDatabase();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });
  deleteAccount(id);
  return NextResponse.json({ success: true });
}