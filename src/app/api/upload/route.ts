import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "products";

    if (!file) {
      return NextResponse.json({ error: "未提供文件" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "空文件" }, { status: 400 });
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "文件过大（最大15MB）" }, { status: 400 });
    }

    // 读取文件原始数据
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 50) {
      return NextResponse.json({ error: "文件数据异常" }, { status: 400 });
    }

    // 确定扩展名和 MIME 类型
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    let contentType = file.type || "application/octet-stream";

    // 规范化 MIME 类型
    if (ext === "png") contentType = "image/png";
    else if (ext === "webp") contentType = "image/webp";
    else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
    else if (ext === "gif") contentType = "image/gif";

    // 生成唯一文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    const fileName = `${folder}/${timestamp}_${random}.${ext}`;

    console.log(`[上传] ${file.name} → ${fileName}, ${(buffer.length / 1024).toFixed(1)}KB, ${contentType}`);

    // 直接上传到 Supabase Storage（不经过任何处理）
    const { error: uploadError } = await supabase.storage
      .from("product-photos")
      .upload(fileName, buffer, {
        contentType,
        upsert: false,
        cacheControl: "max-age=3600",
      });

    if (uploadError) {
      console.error("[上传] 失败:", uploadError.message);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 获取公开 URL
    const { data: urlData } = supabase.storage
      .from("product-photos")
      .getPublicUrl(fileName);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ error: "获取URL失败" }, { status: 500 });
    }

    console.log(`[上传] 成功: ${publicUrl}`);
    return NextResponse.json({ url: publicUrl, path: fileName }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[上传] 异常:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}