import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";
const MAX_SIZE_BYTES = 200 * 1024;

// 压缩图片
async function compressImage(inputBuffer: Buffer): Promise<Buffer> {
  if (inputBuffer.length <= MAX_SIZE_BYTES) return inputBuffer;
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
  console.log(`压缩后: ${(buffer.length / 1024).toFixed(1)} KB`);
  return Buffer.from(buffer);
}

// MD5
async function computeMd5(buffer: Buffer): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("md5").update(buffer).digest("hex");
}

// 发送企业微信图片
async function sendToWechat(imageUrl: string, label: string): Promise<boolean> {
  if (!WECHAT_WEBHOOK_URL) {
    console.log(`企业微信未配置，跳过发送 ${label}`);
    return false;
  }
  try {
    const res = await fetch(imageUrl);
    const rawBuffer = Buffer.from(await res.arrayBuffer());
    const compressed = await compressImage(rawBuffer);
    const base64 = compressed.toString("base64");
    const md5 = await computeMd5(compressed);

    const wechatRes = await fetch(WECHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "image", image: { base64, md5 } }),
    });
    const data = await wechatRes.json();
    console.log(`企业微信 ${label} 发送结果:`, data);
    return data?.errcode === 0;
  } catch (err) {
    console.error(`企业微信 ${label} 发送失败:`, err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!AGNES_API_KEY) {
      return NextResponse.json({ error: "Agnes API Key 未配置" }, { status: 500 });
    }

    const body = await request.json();
    const { sale_id, product_photo_url, member_id } = body;

    if (!sale_id || !product_photo_url) {
      return NextResponse.json({ error: "缺少 sale_id 或 product_photo_url" }, { status: 400 });
    }

    // ===== 步骤 1: 文本模型分析服装 =====
    console.log("Agnes 步骤1: 分析服装...");
    const textRes = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGNES_API_KEY}`,
      },
      body: JSON.stringify({
        model: "agnes-2.0-flash",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: product_photo_url } },
            { type: "text", text: "请详细描述这件衣服的以下特征：1.材质和面料质感 2.颜色和图案细节 3.款式和版型 4.适合的穿着场景 5.建议的搭配风格。请用中文简洁描述，控制在200字以内。" },
          ],
        }],
        max_tokens: 500,
      }),
    });

    const textData = await textRes.json();
    if (!textRes.ok) {
      console.error("Agnes 文本模型错误:", textData);
      throw new Error(`Agnes 文本分析失败: ${textData.error?.message || JSON.stringify(textData)}`);
    }

    const clothingDesc = textData?.choices?.[0]?.message?.content || "";
    console.log("服装描述:", clothingDesc);

    if (!clothingDesc) {
      throw new Error("Agnes 未返回服装描述");
    }

    // ===== 步骤 2 & 3: 并行生成模特试穿图和白底平铺图 =====
    console.log("Agnes 步骤2&3: 并行生成图片...");

    const modelPrompt = `一个3-6岁的中国儿童模特穿着这件衣服，展示服装效果。${clothingDesc}。保持衣服的颜色、材质、图案、细节完全不变，自然光线，高清摄影棚拍摄，全身照。儿童模特自然微笑，姿势自然可爱。背景是温馨的儿童摄影棚场景。`;

    const flatPrompt = `这件衣服的白色背景专业平铺展示图，服装平整展开，正面展示。${clothingDesc}。保持衣服的颜色、材质、图案、细节完全不变。纯白色背景，专业电商产品摄影，高清，无阴影，无模特。`;

    const [modelRes, flatRes] = await Promise.all([
      fetch(`${AGNES_BASE}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AGNES_API_KEY}`,
        },
        body: JSON.stringify({
          model: "agnes-image-2.0-flash",
          prompt: modelPrompt,
          size: "1024x1024",
          extra_body: { image: [product_photo_url] },
        }),
      }),
      fetch(`${AGNES_BASE}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AGNES_API_KEY}`,
        },
        body: JSON.stringify({
          model: "agnes-image-2.0-flash",
          prompt: flatPrompt,
          size: "1024x1024",
          extra_body: { image: [product_photo_url] },
        }),
      }),
    ]);

    const [modelData, flatData] = await Promise.all([modelRes.json(), flatRes.json()]);

    if (!modelRes.ok) {
      console.error("Agnes 模特图错误:", modelData);
      throw new Error(`Agnes 模特图生成失败: ${modelData.error?.message || JSON.stringify(modelData)}`);
    }
    if (!flatRes.ok) {
      console.error("Agnes 平铺图错误:", flatData);
      throw new Error(`Agnes 平铺图生成失败: ${flatData.error?.message || JSON.stringify(flatData)}`);
    }

    const modelImageUrl = modelData?.data?.[0]?.url;
    const flatImageUrl = flatData?.data?.[0]?.url;

    if (!modelImageUrl || !flatImageUrl) {
      console.error("Agnes 返回无图片:", { modelData, flatData });
      throw new Error("Agnes 未返回生成图片");
    }

    console.log("模特图:", modelImageUrl);
    console.log("平铺图:", flatImageUrl);

    // ===== 步骤 4: 发送企业微信 =====
    const [wechatModelSent, wechatFlatSent] = await Promise.all([
      sendToWechat(modelImageUrl, "模特试穿图"),
      sendToWechat(flatImageUrl, "白底平铺图"),
    ]);

    // ===== 步骤 5: 记录用量 =====
    if (member_id) {
      supabase.from("model_usage").insert({
        member_id,
        model_name: "agnes",
      }).then(({ error }) => {
        if (error) console.error("Agnes 用量记录失败:", error.message);
      });
    }

    return NextResponse.json({
      generated_url: modelImageUrl,
      flat_url: flatImageUrl,
      clothing_desc: clothingDesc,
      wechat_sent: wechatModelSent && wechatFlatSent,
      sale_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Agnes generate error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}