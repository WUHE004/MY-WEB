import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || "";
const DOUBAO_ENDPOINT_ID = process.env.DOUBAO_ENDPOINT_ID || "";
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";

const DOUBAO_BASE = "https://ark.cn-beijing.volces.com/api/v3";
const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";
const MAX_SIZE_BYTES = 200 * 1024; // 200KB

type ModelType = "doubao" | "qwen";

// 压缩图片到 200KB 以内
async function compressImage(inputBuffer: Buffer): Promise<Buffer> {
  const originalSize = inputBuffer.length;
  console.log(`生成图片原始大小: ${(originalSize / 1024).toFixed(1)} KB`);

  if (originalSize <= MAX_SIZE_BYTES) return inputBuffer;

  let quality = 80;
  let buffer = await sharp(inputBuffer)
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();

  while (buffer.length > MAX_SIZE_BYTES && quality > 20) {
    quality -= 10;
    buffer = await sharp(inputBuffer)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
  }

  const result = Buffer.from(buffer);
  console.log(`压缩后图片大小: ${(result.length / 1024).toFixed(1)} KB (quality: ${quality})`);
  return result;
}

// 调用 Qwen-Image-Edit API
async function callQwenImageEdit(productPhotoUrl: string, modelPhotoUrl: string): Promise<string | null> {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("DashScope API Key 未配置");
  }

  const prompt = "让模特穿上这件衣服,保持衣服的款式、纹理、图案、颜色、细节完全不变。模特穿着该衣服自然站立展示效果。";

  const payload = {
    model: "qwen-image-edit-plus",
    input: {
      messages: [
        {
          role: "user",
          content: [
            { image: productPhotoUrl },
            { image: modelPhotoUrl },
            { text: prompt },
          ],
        },
      ],
    },
    parameters: {
      size: "1024*1024",
      response_format: "url",
    },
  };

  console.log("Qwen API payload:", JSON.stringify(payload, null, 2));

  const res = await fetch(`${DASHSCOPE_BASE}/services/aigc/image-generation/generation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Qwen API 错误:", data);
    throw new Error(`Qwen API 错误: ${data.message || JSON.stringify(data)}`);
  }

  // DashScope 返回格式: { output: { choices: [{ message: { content: [ { image: "url" } ] } }] } }
  const imageUrl = data?.output?.choices?.[0]?.message?.content?.find?.((c: { image?: string }) => c.image)?.image
    || data?.output?.results?.[0]?.url
    || data?.output?.images?.[0];

  if (!imageUrl) {
    console.error("Qwen 返回无图片:", JSON.stringify(data));
    throw new Error("Qwen 未返回生成图片");
  }

  console.log("Qwen 生成成功，图片 URL:", imageUrl);
  return imageUrl;
}

// 调用豆包 Seedream API
async function callDoubaoSeedream(productPhotoUrl: string, modelPhotoUrl: string): Promise<string | null> {
  if (!DOUBAO_API_KEY || !DOUBAO_ENDPOINT_ID) {
    throw new Error("豆包 API Key 或 Endpoint 未配置");
  }

  const prompt = "让模特穿上这件衣服，保持衣服的款式、纹理、图案、颜色、细节完全不变。模特穿着该衣服自然站立，展示衣服效果。";

  const payload: Record<string, unknown> = {
    model: DOUBAO_ENDPOINT_ID,
    prompt,
    image: [productPhotoUrl, modelPhotoUrl],
    size: "2K",
    response_format: "url",
    watermark: false,
    sequential_image_generation: "disabled",
  };

  console.log("Doubao payload:", JSON.stringify(payload, null, 2));

  const res = await fetch(`${DOUBAO_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DOUBAO_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("豆包 API 错误:", data);
    throw new Error(`豆包 API 错误: ${JSON.stringify(data)}`);
  }

  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) {
    console.error("豆包返回无图片:", data);
    throw new Error("豆包未返回生成图片");
  }

  console.log("Doubao 生成成功，图片 URL:", imageUrl);
  return imageUrl;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sale_id, product_photo_url, model_id, ai_model } = body;

    const activeModel: ModelType = ai_model === "qwen" ? "qwen" : "doubao";

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

    // 2. 根据选择的模型调用对应的 API
    console.log(`使用模型: ${activeModel}`);
    let generatedUrl: string | null = null;

    if (activeModel === "qwen") {
      generatedUrl = await callQwenImageEdit(product_photo_url, modelPhotoUrl);
    } else {
      generatedUrl = await callDoubaoSeedream(product_photo_url, modelPhotoUrl);
    }

    if (!generatedUrl) {
      return NextResponse.json({ error: "生成失败，未返回图片" }, { status: 500 });
    }

    // 3. 下载生成图片，压缩后发送微信（不存入数据库）
    const imageRes = await fetch(generatedUrl);
    const rawBuffer = Buffer.from(await imageRes.arrayBuffer());
    const imageBuffer = await compressImage(rawBuffer);

    // 4. 通过企业微信发送图片
    let wechatSent = false;
    if (WECHAT_WEBHOOK_URL) {
      try {
        const base64Image = imageBuffer.toString("base64");
        const md5 = await computeMd5(imageBuffer);

        const wechatRes = await fetch(WECHAT_WEBHOOK_URL, {
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
        const wechatData = await wechatRes.json();
        console.log("企业微信发送结果:", wechatData);
        wechatSent = wechatData?.errcode === 0;
      } catch (wechatErr) {
        console.error("微信发送失败:", wechatErr);
      }
    }

    // 直接返回生成图片的 URL（不存入 Supabase，节省存储空间）
    return NextResponse.json({
      generated_url: generatedUrl,
      sale_id,
      wechat_sent: wechatSent,
      model: activeModel,
    });
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