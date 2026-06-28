import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const MAX_WIDTH = 800;
const QUALITY = 85;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "products";

    if (!file) {
      return NextResponse.json({ error: "未提供文件" }, { status: 400 });
    }

    // 校验文件
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "文件过大（最大15MB）" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "空文件" }, { status: 400 });
    }

    // 读取文件（只读一次，避免重复读取导致空 buffer）
    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer: Buffer = Buffer.from(arrayBuffer);

    if (rawBuffer.length < 50) {
      return NextResponse.json({ error: "文件数据异常，太小" }, { status: 400 });
    }

    let compressed = rawBuffer; // 默认使用原图
    let finalExt = "jpg";
    let finalContentType = "image/jpeg";
    let useSharp = true;

    // 如果原图已经很小（< 200KB），直接上传原图，跳过 sharp 压缩
    if (rawBuffer.length < 200 * 1024) {
      useSharp = false;
      console.log(`[上传] ${file.name} 原始大小 ${(rawBuffer.length / 1024).toFixed(1)}KB，直接上传`);
    }

    if (useSharp) {
      try {
        const sharpResult = await sharp(rawBuffer)
          .resize(MAX_WIDTH, undefined, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: QUALITY })
          .toBuffer();
        // 校验 JPEG 头：有效 JPEG 必须以 FF D8 FF 开头
        if (sharpResult.length < 100 || sharpResult[0] !== 0xFF || sharpResult[1] !== 0xD8 || sharpResult[2] !== 0xFF) {
          console.warn(`[上传] sharp 输出无效 (len=${sharpResult.length}, 头=${sharpResult[0]?.toString(16)}${sharpResult[1]?.toString(16)}${sharpResult[2]?.toString(16)})，改上传原图`);
        } else {
          compressed = sharpResult;
          console.log(`[上传] ${file.name} 压缩: ${(rawBuffer.length / 1024).toFixed(1)}KB → ${(compressed.length / 1024).toFixed(1)}KB`);
        }
      } catch (sharpError) {
        console.warn(`[上传] sharp 压缩失败 (${file.name}): ${sharpError instanceof Error ? sharpError.message : "未知错误"}，改上传原图`);
      }
    }

    // 如果没用 sharp 或 sharp 失败，保留原图扩展名
    if (compressed === rawBuffer) {
      const origExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      if (origExt === "png") { finalExt = "png"; finalContentType = "image/png"; }
      else if (origExt === "webp") { finalExt = "webp"; finalContentType = "image/webp"; }
      else { finalExt = "jpg"; finalContentType = "image/jpeg"; }
    }

    // 最终校验：确保上传的不是空数据
    if (compressed.length < 50) {
      return NextResponse.json({ error: "处理后文件异常" }, { status: 400 });
    }

    // 生成唯一文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    const fileNameWithoutExt = file.name.replace(/\.[^.]+$/, "");
    const storagePath = `${folder}/${timestamp}_${random}_${fileNameWithoutExt}.${finalExt}`;

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("product-photos")
      .upload(storagePath, compressed, {
        contentType: finalContentType,
        upsert: false,
        cacheControl: "max-age=3600",
      });

    if (uploadError) {
      console.error("[上传] Supabase upload error:", uploadError);
      
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
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ error: "获取URL失败" }, { status: 500 });
    }

    console.log(`[上传] 成功: ${storagePath}, 大小: ${(compressed.length / 1024).toFixed(1)}KB`);
    return NextResponse.json({ url: publicUrl, path: storagePath }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[上传] 错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}