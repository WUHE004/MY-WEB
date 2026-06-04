import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const MAX_WIDTH = 800;
const QUALITY = 75;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

// GET: 获取 Supabase Storage 中已存在的照片文件名列表（用于前端去重）
export async function GET() {
  try {
    const { data, error } = await supabase.storage
      .from("product-photos")
      .list("imports", { limit: 1000 });

    if (error) {
      return NextResponse.json({ error: `获取文件列表失败: ${error.message}` }, { status: 500 });
    }

    // 提取文件名（去扩展名和路径），用于匹配
    const existingNames = new Set<string>();
    for (const file of data || []) {
      const baseName = file.name.replace(/\.[^.]+$/, "").trim();
      if (baseName) existingNames.add(baseName);
    }

    return NextResponse.json({ existingNames: Array.from(existingNames) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const photos = formData.getAll("photos") as File[];

    if (!photos || photos.length === 0) {
      return NextResponse.json({ error: "未提供照片文件" }, { status: 400 });
    }

    // 查询所有入库记录中 photo 字段为文件名（非 URL）的记录
    const { data: allRecords, error: fetchError } = await supabase
      .from("inbound_records")
      .select("id, sale_id, photo");

    if (fetchError) {
      return NextResponse.json({ error: `查询入库记录失败: ${fetchError.message}` }, { status: 500 });
    }

    // 构建文件名到记录ID的映射（photo 字段为文件名，非 URL）
    const filenameToRecords: Record<string, { id: number; sale_id: string }[]> = {};
    for (const rec of allRecords || []) {
      const photoVal = (rec.photo || "").trim();
      if (!photoVal) continue;
      // 跳过已经是 URL 的
      if (photoVal.startsWith("http://") || photoVal.startsWith("https://")) continue;
      // 提取文件名（去路径和扩展名）
      const baseName = photoVal.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim();
      if (!baseName) continue;
      if (!filenameToRecords[baseName]) filenameToRecords[baseName] = [];
      filenameToRecords[baseName].push({ id: rec.id, sale_id: rec.sale_id });
    }

    let processed = 0;
    let matched = 0;
    let uploaded = 0;
    let updated = 0;
    const errors: string[] = [];
    const total = photos.length;

    // 逐个处理照片
    for (const file of photos) {
      processed++;
      const fileNameWithoutExt = file.name.replace(/\.[^.]+$/, "").trim();
      const key = fileNameWithoutExt;

      // 检查是否有匹配的入库记录
      const matchingRecords = filenameToRecords[key];
      if (!matchingRecords || matchingRecords.length === 0) {
        continue; // 跳过无匹配的文件，不报错
      }
      matched++;

      // 校验文件
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: 文件过大`);
        continue;
      }
      if (file.size === 0) {
        errors.push(`${file.name}: 空文件`);
        continue;
      }

      // 压缩图片
      let compressed: Buffer;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        compressed = await sharp(buffer)
          .resize(MAX_WIDTH, undefined, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: QUALITY })
          .toBuffer();
      } catch (sharpError) {
        const msg = sharpError instanceof Error ? sharpError.message : "未知错误";
        errors.push(`${file.name}: 压缩失败 - ${msg}`);
        continue;
      }

      // 上传到 Supabase Storage
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

      uploaded++;

      // 获取公开 URL
      const { data: urlData } = supabase.storage
        .from("product-photos")
        .getPublicUrl(storagePath);

      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) {
        errors.push(`${file.name}: 获取URL失败`);
        continue;
      }

      // 更新所有匹配的入库记录
      for (const rec of matchingRecords) {
        const { error: updateError } = await supabase
          .from("inbound_records")
          .update({ photo: publicUrl })
          .eq("id", rec.id);

        if (updateError) {
          errors.push(`${file.name}: 更新记录 ${rec.sale_id} 失败 - ${updateError.message}`);
        } else {
          updated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      matched,
      uploaded,
      updated,
      total,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}