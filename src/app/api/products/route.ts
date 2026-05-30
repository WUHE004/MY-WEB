import { NextRequest, NextResponse } from "next/server";
import { initDatabase } from "@/lib/schema";
import { getProducts, createProduct, updateProduct, deleteProduct, getProductById } from "@/lib/queries";

export async function GET() {
  await initDatabase();
  const products = getProducts();
  return NextResponse.json(products);
}

export async function POST(request: NextRequest) {
  await initDatabase();
  try {
    const body = await request.json();
    const id = body.id || Date.now().toString();
    createProduct({ ...body, id });
    const product = getProductById(id);
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Create product error:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  await initDatabase();
  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });
    updateProduct(id, data);
    const product = getProductById(id);
    return NextResponse.json(product);
  } catch (error) {
    console.error("Update product error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  await initDatabase();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });
  deleteProduct(id);
  return NextResponse.json({ success: true });
}