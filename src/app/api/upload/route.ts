import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const MAX_SIZE_BYTES = 300 * 1024; // 300KB 目标大小
const MAX_WIDTH = 1280;

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
    const buffer: Buffer = Buffer.from(arrayBuffer);
    
    // 校验原文件
    if (buffer.length < 50) {
      return NextResponse.json({ error: "文件数据异常，太小" }, { status: 400 });
    }

    // 确定原图格式
    const originalExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    let finalExt = originalExt;
    let finalContentType = file.type || "application/octet-stream";

    // 如果是图片且原图大于 200KB，尝试压缩
    const isImage = file.type?.startsWith("image/");
    let compressedBuffer: Buffer = buffer;
    let isCompressed = false;

    if (isImage && buffer.length > 200 * 1024) {
      try {
        const sharp = (await import("sharp")).default;
        
        console.log(`[上传] 原始文件: ${file.name}, 大小: ${(buffer.length / 1024).toFixed(1)}KB`);

        // 根据原图格式决定输出格式
        let sharpInstance = sharp(buffer).resize(MAX_WIDTH, MAX_WIDTH, { 
          fit: "inside", 
          withoutEnlargement: true 
        });

        if (originalExt === "png") {
          // PNG 保持 PNG，但限制大小
          let quality = 90;
          let result: Buffer = await sharpInstance.png({ compressionLevel: 9, quality }).toBuffer();
          
          // 如果还是太大，逐步降低质量
          while (result.length > MAX_SIZE_BYTES * 2 && quality > 50) {
            quality -= 10;
            result = await sharpInstance.png({ compressionLevel: 9, quality }).toBuffer();
          }
          
          // PNG 如果还是太大，转为 JPEG
          if (result.length > MAX_SIZE_BYTES * 2) {
            result = await sharp(buffer).resize(MAX_WIDTH, MAX_WIDTH, { 
              fit: "inside", withoutEnlargement: true 
            }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
            finalExt = "jpg";
            finalContentType = "image/jpeg";
            console.log(`[上传] PNG过大(${result.length / 1024}KB)，转为JPEG`);
          } else {
            finalExt = "png";
            finalContentType = "image/png";
          }
          compressedBuffer = result;
        } else if (originalExt === "webp") {
          // WebP 保持 WebP
          let quality = 80;
          let result: Buffer = await sharpInstance.webp({ quality }).toBuffer();
          
          while (result.length > MAX_SIZE_BYTES && quality > 30) {
            quality -= 10;
            result = await sharpInstance.webp({ quality }).toBuffer();
          }
          
          finalExt = "webp";
          finalContentType = "image/webp";
          compressedBuffer = result;
        } else {
          // JPEG 保持 JPEG
          let quality = 80;
          let result: Buffer = await sharpInstance.jpeg({ quality, mozjpeg: true }).toBuffer();
          
          while (result.length > MAX_SIZE_BYTES && quality > 30) {
            quality -= 10;
            result = await sharpInstance.jpeg({ quality, mozjpeg: true }).toBuffer();
          }
          
          finalExt = "jpg";
          finalContentType = "image/jpeg";
          compressedBuffer = result;
        }

        // 校验压缩后的 JPEG 头
        if (finalExt === "jpg") {
          const headerValid = compressedBuffer[0] === 0xFF && compressedBuffer[1] === 0xD8 && compressedBuffer[2] === 0xFF;
          if (!headerValid) {
            console.error(`[上传] JPEG 头校验失败，使用原图`);
            compressedBuffer = buffer;
            finalExt = originalExt;
            finalContentType = file.type || "application/octet-stream";
          }
        }

        isCompressed = true;
        console.log(`[上传] 压缩后: ${(compressedBuffer.length / 1024).toFixed(1)}KB, 格式: ${finalExt}`);
      } catch (sharpError) {
        console.warn("[上传] sharp 处理失败，使用原图:", sharpError instanceof Error ? sharpError.message : String(sharpError));
        // sharp 失败时使用原图
        finalExt = originalExt;
        finalContentType = file.type || "application/octet-stream";
      }
    } else {
      // 小于 200KB 或非图片，不压缩
      if (originalExt === "png") {
        finalContentType = "image/png";
      } else if (originalExt === "webp") {
        finalContentType = "image/webp";
      } else if (originalExt === "jpg" || originalExt === "jpeg") {
        finalContentType = "image/jpeg";
        finalExt = "jpg";
      }
      console.log(`[上传] 文件较小或非图片，不压缩: ${file.name}, ${(buffer.length / 1024).toFixed(1)}KB`);
    }

    // 生成唯一文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fileName = `${folder}/${timestamp}_${random}.${finalExt}`;

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("product-photos")
      .upload(fileName, compressedBuffer, {
        contentType: finalContentType,
        upsert: false,
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
      .getPublicUrl(fileName);

    console.log(`[上传] 成功: ${fileName}, 大小: ${(compressedBuffer.length / 1024).toFixed(1)}KB`);
    return NextResponse.json({ url: urlData.publicUrl, path: fileName }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[上传] 错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}