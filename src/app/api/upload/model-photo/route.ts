import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
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

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    // 上传到 Supabase Storage
    const { error: uploadError } = await supabase
      .storage
      .from("model-photos")
      .upload(file_name, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 获取公开 URL
    const { data: urlData } = supabase
      .storage
      .from("model-photos")
      .getPublicUrl(file_name);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}