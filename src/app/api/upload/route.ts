import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const MAX_SIZE_BYTES = 500 * 1024; // 500KB
const MAX_WIDTH = 1280;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "products";

    if (!file) {
      return NextResponse.json({ error: "未提供文件" }, { status: 400 });
    }

    // 限制文件大小 10MB（压缩前）
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "文件大小不能超过 10MB" }, { status: 400 });
    }

    // 读取文件
    const arrayBuffer = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);
    
    // 校验原文件头，确保读取成功
    if (rawBuffer.length < 50) {
      return NextResponse.json({ error: "文件数据异常，太小" }, { status: 400 });
    }

    // 确定文件格式和扩展名
    const originalExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    let useSharp = false;
    let compressed = rawBuffer;
    let finalExt = originalExt;
    let finalContentType = file.type || "application/octet-stream";

    // 如果是图片，尝试使用 sharp 压缩
    const isImage = file.type?.startsWith("image/");
    if (isImage) {
      // 小于 200KB 的图片直接上传，不压缩
      if (rawBuffer.length < 200 * 1024) {
        console.log(`[上传] 图片较小 (${(rawBuffer.length / 1024).toFixed(1)}KB)，跳过压缩`);
      } else {
        try {
          const sharp = (await import("sharp")).default;
          
          const originalSize = rawBuffer.length;
          let quality = 80;
          
          // 根据原图格式选择输出格式
          let sharpPipeline = sharp(rawBuffer)
            .resize(MAX_WIDTH, MAX_WIDTH, { fit: "inside", withoutEnlargement: true });
          
          // 保留原图格式（png/webp/tiff等）
          if (originalExt === "png") {
            sharpPipeline = sharpPipeline.png({ quality: Math.min(quality, 90) });
            finalExt = "png";
            finalContentType = "image/png";
          } else if (originalExt === "webp") {
            sharpPipeline = sharpPipeline.webp({ quality });
            finalExt = "webp";
            finalContentType = "image/webp";
          } else {
            // 默认输出 JPEG
            sharpPipeline = sharpPipeline.jpeg({ quality, mozjpeg: true });
            finalExt = "jpg";
            finalContentType = "image/jpeg";
          }
          
          const sharpResult = await sharpPipeline.toBuffer();
          
          // 校验 JPEG 头：有效 JPEG 必须以 FF D8 FF 开头
          if (finalExt === "jpg") {
            if (sharpResult.length < 100 || sharpResult[0] !== 0xFF || sharpResult[1] !== 0xD8 || sharpResult[2] !== 0xFF) {
              console.warn(`[上传] sharp 输出 JPEG 无效 (len=${sharpResult.length}, 头=${sharpResult[0]?.toString(16)}${sharpResult[1]?.toString(16)}${sharpResult[2]?.toString(16)})，改上传原图`);
            } else {
              compressed = sharpResult;
              useSharp = true;
            }
          } else {
            compressed = sharpResult;
            useSharp = true;
          }
          
          // 如果压缩后还是太大，继续降低质量
          while (useSharp && compressed.length > MAX_SIZE_BYTES && quality > 30) {
            quality -= 15;
            let retryPipeline = sharp(rawBuffer)
              .resize(MAX_WIDTH, MAX_WIDTH, { fit: "inside", withoutEnlargement: true });
            
            if (finalExt === "png") {
              retryPipeline = retryPipeline.png({ quality: Math.min(quality, 90) });
            } else if (finalExt === "webp") {
              retryPipeline = retryPipeline.webp({ quality });
            } else {
              retryPipeline = retryPipeline.jpeg({ quality, mozjpeg: true });
            }
            
            const retryResult = await retryPipeline.toBuffer();
            
            // 再次校验
            if (finalExt === "jpg") {
              if (retryResult[0] === 0xFF && retryResult[1] === 0xD8 && retryResult[2] === 0xFF) {
                compressed = retryResult;
              }
            } else {
              compressed = retryResult;
            }
          }

          console.log(`[上传] 图片压缩: ${(originalSize / 1024).toFixed(1)}KB → ${(compressed.length / 1024).toFixed(1)}KB (quality: ${quality}, sharp: ${useSharp})`);
        } catch (sharpError) {
          console.warn("[上传] sharp 压缩失败:", sharpError instanceof Error ? sharpError.message : String(sharpError));
          // sharp 失败时使用原图
          useSharp = false;
        }
      }
    }

    // 如果没用 sharp 或 sharp 失败，保留原图格式
    if (!useSharp) {
      if (originalExt === "png") {
        finalExt = "png";
        finalContentType = "image/png";
      } else if (originalExt === "webp") {
        finalExt = "webp";
        finalContentType = "image/webp";
      } else {
        finalExt = "jpg";
        finalContentType = "image/jpeg";
      }
    }

    // 生成唯一文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fileName = `${folder}/${timestamp}_${random}.${finalExt}`;

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("product-photos")
      .upload(fileName, compressed, {
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
      } else if (uploadError.message.includes("size")) {
        errorMsg = `文件大小超出限制（当前${(compressed.length / 1024).toFixed(0)}KB，最大5MB）`;
      }
      
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }

    // 获取公开 URL
    const { data: urlData } = supabase.storage
      .from("product-photos")
      .getPublicUrl(fileName);

    console.log(`[上传] 成功: ${fileName}, 大小: ${(compressed.length / 1024).toFixed(1)}KB`);
    return NextResponse.json({ url: urlData.publicUrl, path: fileName }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[上传] 错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}