import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const BUCKET = "model-photos";
const MAX_SIZE_BYTES = 200 * 1024; // 200KB

// 确保 bucket 存在
async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error && !error.message.includes("already exists")) {
      console.error("创建 bucket 失败:", error.message);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // 确保 bucket 存在
    await ensureBucket();

    const body = await request.json();
    const { file_name, file_data } = body;

    if (!file_name || !file_data) {
      return NextResponse.json({ error: "缺少 file_name 或 file_data" }, { status: 400 });
    }

    // 从 base64 data URL 中提取纯 base64 和 mime type
    const matches = file_data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: "无效的 base64 格式" }, { status: 400 });
    }

    const base64Data = matches[2];
    let buffer = Buffer.from(base64Data, "base64");

    // 压缩图片到 200KB 以内
    const originalSize = buffer.length;
    console.log(`原始图片大小: ${(originalSize / 1024).toFixed(1)} KB`);

    if (originalSize > MAX_SIZE_BYTES) {
      let quality = 80;
      buffer = await sharp(buffer)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();

      // 逐步降低质量直到小于 200KB
      while (buffer.length > MAX_SIZE_BYTES && quality > 20) {
        quality -= 10;
        buffer = await sharp(buffer)
          .jpeg({ quality })
          .toBuffer();
      }

      console.log(`压缩后图片大小: ${(buffer.length / 1024).toFixed(1)} KB (quality: ${quality})`);
    }

    // 统一转为 jpg 文件名
    const jpgFileName = file_name.replace(/\.[^.]+$/, ".jpg");

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabase
      .storage
      .from(BUCKET)
      .upload(jpgFileName, buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 获取公开 URL
    const { data: urlData } = supabase
      .storage
      .from(BUCKET)
      .getPublicUrl(jpgFileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Upload error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}