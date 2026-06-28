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

    // 限制文件大小 50MB
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "文件大小不能超过 50MB" }, { status: 400 });
    }

    // 读取文件
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 校验原文件
    if (buffer.length < 50) {
      return NextResponse.json({ error: "文件数据异常，太小" }, { status: 400 });
    }

    // 保留原图格式和扩展名
    const originalExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    let finalExt = originalExt;
    let finalContentType = file.type || "application/octet-stream";

    // 确定 MIME 类型
    if (originalExt === "png") {
      finalContentType = "image/png";
    } else if (originalExt === "webp") {
      finalContentType = "image/webp";
    } else if (originalExt === "gif") {
      finalContentType = "image/gif";
    } else if (originalExt === "jpg" || originalExt === "jpeg") {
      finalContentType = "image/jpeg";
      finalExt = "jpg"; // 统一 jpg 扩展名
    } else {
      // 未知格式，默认用原扩展名
      finalContentType = "application/octet-stream";
    }

    // 生成唯一文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fileName = `${folder}/${timestamp}_${random}.${finalExt}`;

    console.log(`[上传] 文件: ${file.name}, 大小: ${(buffer.length / 1024).toFixed(1)}KB, 类型: ${finalContentType}`);

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("product-photos")
      .upload(fileName, buffer, {
        contentType: finalContentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[上传] Supabase upload error:", uploadError);
      
      // 提供更详细的错误信息
      let errorMsg = uploadError.message;
      if (uploadError.message.includes("policy") || uploadError.message.includes("Permission")) {
        errorMsg = "Storage权限不足，请在Supabase中设置product-photos存储桶的写入权限";
      } else if (uploadError.message.includes("bucket") && uploadError.message.includes("not found")) {
        errorMsg = "product-photos存储桶不存在，请先在Supabase中创建";
      }
      
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    // 获取公开 URL
    const { data: urlData } = supabase.storage
      .from("product-photos")
      .getPublicUrl(fileName);

    console.log(`[上传] 成功: ${fileName}`);
    return NextResponse.json({ url: urlData.publicUrl, path: fileName }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[上传] 错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}