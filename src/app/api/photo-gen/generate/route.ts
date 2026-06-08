import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || "";
const DOUBAO_ENDPOINT_ID = process.env.DOUBAO_ENDPOINT_ID || "";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";

const DOUBAO_BASE = "https://ark.cn-beijing.volces.com/api/v3";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sale_id, product_photo_url, model_id } = body;

    if (!sale_id || !model_id) {
      return NextResponse.json({ error: "缺少 sale_id 或 model_id" }, { status: 400 });
    }

    // 1. 获取模特图片
    const { data: modelData, error: modelError } = await supabase
      .from("model_library")
      .select("photo_url, name")
      .eq("id", model_id)
      .single();

    if (modelError || !modelData) {
      return NextResponse.json({ error: "找不到该模特" }, { status: 404 });
    }

    const modelPhotoUrl = modelData.photo_url;

    if (!product_photo_url) {
      return NextResponse.json({ error: "该商品没有照片" }, { status: 400 });
    }

    // 2. 调用豆包 Seedream API 进行虚拟换衣
    console.log("调用豆包 API...");
    const prompt = `让模特穿上这件衣服，保持衣服的款式、纹理、图案、颜色、细节完全不变。模特穿着该衣服自然站立，展示衣服效果。`;

    const doubaoPayload: Record<string, unknown> = {
      model: DOUBAO_ENDPOINT_ID,
      prompt,
      image: [product_photo_url, modelPhotoUrl],
      size: "2K",
      response_format: "url",
      watermark: false,
      sequential_image_generation: "disabled",
    };

    console.log("Doubao payload:", JSON.stringify(doubaoPayload, null, 2));

    const doubaoRes = await fetch(`${DOUBAO_BASE}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DOUBAO_API_KEY}`,
      },
      body: JSON.stringify(doubaoPayload),
    });

    const doubaoData = await doubaoRes.json();

    if (!doubaoRes.ok) {
      console.error("豆包 API 错误:", doubaoData);
      return NextResponse.json({
        error: `豆包 API 错误: ${JSON.stringify(doubaoData)}`,
      }, { status: 500 });
    }

    // 获取生成的图片 URL
    const generatedUrl = doubaoData?.data?.[0]?.url;
    if (!generatedUrl) {
      console.error("豆包返回无图片:", doubaoData);
      return NextResponse.json({ error: "豆包未返回生成图片" }, { status: 500 });
    }

    console.log("生成成功，图片 URL:", generatedUrl);

    // 3. 下载生成图片并上传到 Supabase Storage
    const imageRes = await fetch(generatedUrl);
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const genFileName = `gen-${sale_id}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase
      .storage
      .from("model-photos")
      .upload(genFileName, imageBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    let storedUrl = generatedUrl;
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from("model-photos").getPublicUrl(genFileName);
      storedUrl = urlData.publicUrl;
    }

    // 4. 通过企业微信发送图片
    if (WECHAT_WEBHOOK_URL) {
      try {
        // 将图片转为 base64
        const base64Image = imageBuffer.toString("base64");
        const md5 = await computeMd5(imageBuffer);

        await fetch(WECHAT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            msgtype: "image",
            image: {
              base64: base64Image,
              md5,
            },
          }),
        });
        console.log("已通过企业微信发送图片");
      } catch (wechatErr) {
        console.error("微信发送失败:", wechatErr);
        // 微信发送失败不影响主流程
      }
    }

    return NextResponse.json({ generated_url: storedUrl, sale_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Generate error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// 简单的 MD5 计算（用于微信图片消息）
async function computeMd5(buffer: Buffer): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("md5").update(buffer).digest("hex");
}