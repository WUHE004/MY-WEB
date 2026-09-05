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

    if (file.size === 0) {
      return NextResponse.json({ error: "空文件" }, { status: 400 });
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "文件过大（最大15MB）" }, { status: 400 });
    }

    // 读取文件原始数据
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length < 50) {
      return NextResponse.json({ error: "文件数据异常" }, { status: 400 });
    }

    // 魔数检测: 按真实文件头识别格式，不信任前端声明的扩展名/MIME
    // (防御 iOS Safari canvas.toBlob("image/webp") 静默回退输出 PNG 的怪癖)
    const detectImageFormat = (b: Buffer): { format: string; contentType: string } | null => {
      if (b.length < 12) return null;
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { format: "png", contentType: "image/png" };
      if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { format: "jpg", contentType: "image/jpeg" };
      if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { format: "webp", contentType: "image/webp" };
      if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { format: "gif", contentType: "image/gif" };
      return null;
    };

    const detected = detectImageFormat(buffer);
    if (!detected) {
      return NextResponse.json({ error: "无法识别的图片格式（支持 JPG/PNG/WebP/GIF）" }, { status: 400 });
    }

    // 扩展名与 MIME 均按真实内容设置，保证 Content-Type 与文件内容一致
    const ext = detected.format;
    const contentType = detected.contentType;

    // 生成唯一文件名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    const fileName = `${folder}/${timestamp}_${random}.${ext}`;

    console.log(`[上传] ${file.name} → ${fileName}, ${(buffer.length / 1024).toFixed(1)}KB, ${contentType}`);

    // 直接上传到 Supabase Storage（不经过任何处理）
    const { error: uploadError } = await supabase.storage
      .from("product-photos")
      .upload(fileName, buffer, {
        contentType,
        upsert: false,
        cacheControl: "31536000", // 文件名唯一永不复用，可用长缓存(实测Supabase当前强制no-cache,靠SW缓存兜底)
      });

    if (uploadError) {
      console.error("[上传] 失败:", uploadError.message);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 获取公开 URL
    const { data: urlData } = supabase.storage
      .from("product-photos")
      .getPublicUrl(fileName);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ error: "获取URL失败" }, { status: 500 });
    }

    console.log(`[上传] 成功: ${publicUrl}`);
    return NextResponse.json({ url: publicUrl, path: fileName }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[上传] 异常:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}