import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

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

    // 如果是图片，进行压缩
    const isImage = file.type?.startsWith("image/");
    if (isImage) {
      try {
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
        console.warn("[上传] 图片压缩失败，使用原图:", err);
      }
    }

    // 生成唯一文件名
    const ext = isImage ? "jpg" : (file.name.split(".").pop() || "webp");
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fileName = `${folder}/${timestamp}_${random}.${ext}`;

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("product-photos")
      .upload(fileName, buffer, {
        contentType: isImage ? "image/jpeg" : (file.type || "image/webp"),
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 获取公开 URL
    const { data: urlData } = supabase.storage
      .from("product-photos")
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl, path: fileName }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}