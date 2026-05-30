import { NextRequest, NextResponse } from "next/server";
import { initDatabase } from "@/lib/schema";
import { getLinks, createLink, updateLink, deleteLink } from "@/lib/queries";

export async function GET() {
  await initDatabase();
  const links = getLinks();
  return NextResponse.json(links);
}

export async function POST(request: NextRequest) {
  await initDatabase();
  try {
    const body = await request.json();
    const id = body.id || Date.now().toString();
    createLink({
      id,
      name: body.name || "",
      url: body.url || "",
      short_url: body.short_url || body.shortUrl || "",
      platform: body.platform || "淘宝",
      clicks: body.clicks || 0,
      conversions: body.conversions || 0,
      status: body.status || "active",
    });
    return NextResponse.json({ id, ...body }, { status: 201 });
  } catch (error) {
    console.error("Create link error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  await initDatabase();
  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });
    updateLink(id, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update link error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  await initDatabase();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });
  deleteLink(id);
  return NextResponse.json({ success: true });
}