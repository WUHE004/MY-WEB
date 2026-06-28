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

    const arrayBuffer = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(arrayBuffer);

    // 如果是图片，尝试使用 sharp 压缩
    const isImage = file.type?.startsWith("image/");
    if (isImage) {
      try {
        // 动态导入 sharp（Vercel 上可能不可用）
        const sharp = (await import("sharp")).default;
        
        const originalSize = buffer.length;
        let quality = 80;
        
        let compressed = await sharp(buffer)
          .resize(MAX_WIDTH, MAX_WIDTH, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();

        // 如果还是太大，继续降低质量
        while (compressed.length > MAX_SIZE_BYTES && quality > 30) {
          quality -= 15;
          compressed = await sharp(buffer)
            .resize(MAX_WIDTH, MAX_WIDTH, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
        }

        buffer = compressed;
        console.log(`[上传] 图片压缩: ${(originalSize / 1024).toFixed(1)}KB → ${(buffer.length / 1024).toFixed(1)}KB (quality: ${quality})`);
      } catch (err) {
        console.warn("[上传] sharp 压缩不可用，使用原图:", err instanceof Error ? err.message : String(err));
        // sharp 不可用时使用原图，但限制大小
        if (buffer.length > MAX_SIZE_BYTES) {
          return NextResponse.json({ error: `图片太大 (${(buffer.length / 1024).toFixed(0)}KB)，请压缩后重新上传（最大500KB）` }, { status: 400 });
        }
      }
    }

    // 生成唯一文件名（统一用 jpg 扩展名）
    const ext = isImage ? "jpg" : (file.name.split(".").pop() || "jpg");
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fileName = `${folder}/${timestamp}_${random}.${ext}`;

    // 上传到 Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("product-photos")
      .upload(fileName, buffer, {
        contentType: isImage ? "image/jpeg" : file.type,
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
        errorMsg = `文件大小超出限制（当前${(buffer.length / 1024).toFixed(0)}KB，最大5MB）`;
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