import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const photos = formData.getAll("photos") as File[];

    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: "未提供照片文件" }, { status: 400 });
    }

    const photoMap: Record<string, string> = {};
    const errors: string[] = [];
    const MAX_WIDTH = 800;
    const QUALITY = 75;
    const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

    for (const file of photos) {
      try {
        const fileNameWithoutExt = file.name.replace(/\.[^.]+$/, "");
        const key = fileNameWithoutExt.trim();

        if (!key) {
          errors.push(`跳过无效文件名: ${file.name}`);
          continue;
        }

        // 限制文件大小
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: 文件过大 (${(file.size / 1024 / 1024).toFixed(1)}MB)，已跳过`);
          continue;
        }

        if (file.size === 0) {
          errors.push(`${file.name}: 空文件，已跳过`);
          continue;
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 压缩图片
        let compressed: Buffer;
        try {
          compressed = await sharp(buffer)
            .resize(MAX_WIDTH, undefined, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: QUALITY })
            .toBuffer();
        } catch (sharpError) {
          errors.push(`${file.name}: 图片处理失败 (${sharpError instanceof Error ? sharpError.message : "未知错误"})`);
          continue;
        }

        // 生成唯一文件名用于存储
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 6);
        const storagePath = `imports/${timestamp}_${random}_${key}.webp`;

        const { error: uploadError } = await supabase.storage
          .from("product-photos")
          .upload(storagePath, compressed, {
            contentType: "image/webp",
            upsert: true,
            cacheControl: "3600",
          });

        if (uploadError) {
          errors.push(`${file.name}: 上传失败 - ${uploadError.message}`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("product-photos")
          .getPublicUrl(storagePath);

        if (urlData?.publicUrl) {
          photoMap[key] = urlData.publicUrl;
        } else {
          errors.push(`${file.name}: 获取公开 URL 失败`);
        }
      } catch (fileError) {
        errors.push(`${file.name}: ${fileError instanceof Error ? fileError.message : "处理异常"}`);
        continue;
      }
    }

    return NextResponse.json({
      photoMap,
      count: Object.keys(photoMap).length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}