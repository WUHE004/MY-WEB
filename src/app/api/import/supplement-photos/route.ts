import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const MAX_WIDTH = 800;
const QUALITY = 85;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const SUPABASE_PAGE_SIZE = 1000; // Supabase 默认每页 1000 行

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

    // 分页查询所有入库记录中 photo 字段为文件名（非 URL）的记录
    // 突破 Supabase 默认 1000 行限制
    let allRecords: { id: number; sale_id: string; photo: string | null }[] = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error: fetchError } = await supabase
        .from("inbound_records")
        .select("id, sale_id, photo")
        .range(page * SUPABASE_PAGE_SIZE, (page + 1) * SUPABASE_PAGE_SIZE - 1)
        .order("id", { ascending: true });

      if (fetchError) {
        return NextResponse.json({ error: `查询入库记录失败: ${fetchError.message}` }, { status: 500 });
      }

      if (data && data.length > 0) {
        allRecords = allRecords.concat(data);
        page++;
      } else {
        hasMore = false;
      }
    }
    console.log(`[补充照片] 共查询到 ${allRecords.length} 条入库记录`);

    // 构建文件名到记录ID的映射（photo 字段为文件名，非 URL）
    // 同时支持多级匹配：精确匹配、去扩展名匹配、大小写不敏感匹配
    const filenameToRecords: Record<string, { id: number; sale_id: string }[]> = {};
    const caseInsensitiveIndex: Record<string, string[]> = {}; // 小写key → 原始key列表
    for (const rec of allRecords || []) {
      const photoVal = (rec.photo || "").trim();
      if (!photoVal) continue;
      // 跳过已经是 URL 的
      if (photoVal.startsWith("http://") || photoVal.startsWith("https://")) continue;
      // 提取文件名（去路径）
      const fileName = photoVal.replace(/^.*[\\/]/, "").trim();
      if (!fileName) continue;
      // 生成多个匹配键：完整文件名、去扩展名
      const baseName = fileName.replace(/\.[^.]+$/, "").trim();
      const keys = new Set<string>([fileName, baseName]);
      for (const k of keys) {
        if (!k) continue;
        if (!filenameToRecords[k]) filenameToRecords[k] = [];
        filenameToRecords[k].push({ id: rec.id, sale_id: rec.sale_id });
        // 大小写不敏感索引
        const lower = k.toLowerCase();
        if (!caseInsensitiveIndex[lower]) caseInsensitiveIndex[lower] = [];
        if (!caseInsensitiveIndex[lower].includes(k)) caseInsensitiveIndex[lower].push(k);
      }
    }
    console.log(`[补充照片] 建立了 ${Object.keys(filenameToRecords).length} 个匹配键，${Object.keys(caseInsensitiveIndex).length} 个大小写索引`);

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
      const fileNameFull = file.name.trim();

      // 多级匹配：完整文件名 → 去扩展名 → 大小写不敏感
      let matchingRecords = filenameToRecords[fileNameFull];
      if (!matchingRecords || matchingRecords.length === 0) {
        matchingRecords = filenameToRecords[fileNameWithoutExt];
      }
      if (!matchingRecords || matchingRecords.length === 0) {
        // 大小写不敏感匹配
        const lowerFull = fileNameFull.toLowerCase();
        const lowerNoExt = fileNameWithoutExt.toLowerCase();
        const ciKeys = caseInsensitiveIndex[lowerFull] || caseInsensitiveIndex[lowerNoExt];
        if (ciKeys) {
          for (const ciKey of ciKeys) {
            const records = filenameToRecords[ciKey];
            if (records && records.length > 0) {
              matchingRecords = records;
              break;
            }
          }
        }
      }

      // 检查是否有匹配的入库记录
      if (!matchingRecords || matchingRecords.length === 0) {
        console.log(`[补充照片] 文件 ${file.name} 无匹配记录，跳过`);
        continue; // 跳过无匹配的文件，不报错
      }
      console.log(`[补充照片] 文件 ${file.name} 匹配到 ${matchingRecords.length} 条记录: ${matchingRecords.map(r => r.sale_id).join(', ')}`);
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

      // 压缩图片（JPEG 格式，兼容性最好）
      // 先读取文件到 buffer（只读一次，避免重复读取导致空 buffer）
      let rawBuffer: Buffer;
      try {
        const arrayBuffer = await file.arrayBuffer();
        rawBuffer = Buffer.from(arrayBuffer);
      } catch (readError) {
        errors.push(`${file.name}: 读取文件失败`);
        continue;
      }

      let compressed = rawBuffer; // 默认使用原图
      let finalExt = "jpg";
      let finalContentType = "image/jpeg";
      let useSharp = true;

      // 如果原图已经很小（< 200KB），直接上传原图，跳过 sharp 压缩
      if (rawBuffer.length < 200 * 1024) {
        useSharp = false;
        console.log(`[补充照片] ${file.name} 原始大小 ${(rawBuffer.length / 1024).toFixed(1)}KB，直接上传`);
      }

      if (useSharp) {
        try {
          const sharpResult = await sharp(rawBuffer)
            .resize(MAX_WIDTH, undefined, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: QUALITY })
            .toBuffer();
          // 校验 JPEG 头：有效 JPEG 必须以 FF D8 FF 开头
          if (sharpResult.length < 100 || sharpResult[0] !== 0xFF || sharpResult[1] !== 0xD8 || sharpResult[2] !== 0xFF) {
            console.warn(`[补充照片] sharp 输出无效 (len=${sharpResult.length}, 头=${sharpResult[0]?.toString(16)}${sharpResult[1]?.toString(16)}${sharpResult[2]?.toString(16)})，改上传原图`);
          } else {
            compressed = sharpResult;
          }
        } catch (sharpError) {
          console.warn(`[补充照片] sharp 压缩失败 (${file.name}): ${sharpError instanceof Error ? sharpError.message : "未知错误"}，改上传原图`);
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
        errors.push(`${file.name}: 处理后文件异常 (${compressed.length}字节)`);
        continue;
      }

      // 上传到 Supabase Storage
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 6);
      const storagePath = `imports/${timestamp}_${random}_${fileNameWithoutExt}.${finalExt}`;

      const { error: uploadError } = await supabase.storage
        .from("product-photos")
        .upload(storagePath, compressed, {
          contentType: finalContentType,
          upsert: true,
          cacheControl: "max-age=3600",
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