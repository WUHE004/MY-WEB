import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";
const MAX_SIZE_BYTES = 200 * 1024;
const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

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

// 发送企业微信文本消息
async function sendTextToWechat(content: string): Promise<boolean> {
  if (!WECHAT_WEBHOOK_URL) {
    console.log("企业微信未配置，跳过发送文本");
    return false;
  }
  try {
    const wechatRes = await fetch(WECHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "text",
        text: { content },
      }),
    });
    const data = await wechatRes.json();
    console.log("企业微信 文本 发送结果:", data);
    return data?.errcode === 0;
  } catch (err) {
    console.error("企业微信 文本 发送失败:", err);
    return false;
  }
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

// 查询商品详情（含库存、进价、厂家等）
async function getProductDetail(saleId: string) {
  const { data, error } = await supabase
    .from("inbound_records")
    .select("*")
    .eq("sale_id", saleId)
    .maybeSingle();

  if (error) {
    console.error("查询商品详情失败:", error.message);
  }
  return data || null;
}

// 查询商品销量和退货量（含分尺码）
async function getSalesStats(saleId: string) {
  const [salesRes, returnRes] = await Promise.all([
    supabase.from("sales_records").select("quantity, sell_price, size").eq("sale_id", saleId),
    supabase.from("return_records").select("quantity, size").eq("sale_id", saleId),
  ]);

  let soldTotal = 0;
  let sellPrice = 0;
  const soldBySize: Record<string, number> = {};
  if (salesRes.data) {
    for (const row of salesRes.data) {
      const qty = Number(row.quantity) || 0;
      soldTotal += qty;
      if (!sellPrice && Number(row.sell_price) > 0) sellPrice = Number(row.sell_price);
      const sz = String(row.size || "");
      soldBySize[sz] = (soldBySize[sz] || 0) + qty;
    }
  }

  let returnTotal = 0;
  const returnedBySize: Record<string, number> = {};
  if (returnRes.data) {
    for (const row of returnRes.data) {
      const qty = Number(row.quantity) || 0;
      returnTotal += qty;
      const sz = String(row.size || "");
      returnedBySize[sz] = (returnedBySize[sz] || 0) + qty;
    }
  }

  return { soldTotal, returnTotal, sellPrice, soldBySize, returnedBySize };
}

// 构建商品信息文本
function buildProductText(
  product: Record<string, unknown>,
  stats: { soldTotal: number; returnTotal: number; sellPrice: number; soldBySize: Record<string, number>; returnedBySize: Record<string, number> }
) {
  const saleId = (product.sale_id as string) || "";
  const manufacturer = (product.manufacturer as string) || "未知";
  const costPrice = Number(product.cost_price) || 0;
  const sellPrice = stats.sellPrice || 0;
  const profit = (sellPrice - costPrice).toFixed(1);
  const totalStock = Number(product.total_stock) || 0;
  const soldTotal = stats.soldTotal;
  const returnTotal = stats.returnTotal;
  const remaining = totalStock - soldTotal + returnTotal;
  const name = (product.name as string) || "";

  // 各尺码入库数量
  const inboundLines = SIZES.map((s) => {
    const qty = Number(product[`size_${s}`]) || 0;
    return qty > 0 ? `${s}:${qty}` : null;
  }).filter(Boolean).join(" ");

  // 各尺码剩余数量 = 入库 - 售出 + 退货
  const remainingLines = SIZES.map((s) => {
    const initial = Number(product[`size_${s}`]) || 0;
    const sold = stats.soldBySize[String(s)] || 0;
    const returned = stats.returnedBySize[String(s)] || 0;
    const rem = initial - sold + returned;
    return rem > 0 ? `${s}:${rem}` : null;
  }).filter(Boolean).join(" ");

  const lines = [
    `【AI 一键生成】商品信息`,
    ``,
    `售卖编号：${saleId}`,
    `商品名称：${name}`,
    `进货厂家：${manufacturer}`,
    `进价：¥${costPrice}  售价：¥${sellPrice}  利润：¥${profit}`,
    `总库存：${totalStock}  售出：${soldTotal}  退货：${returnTotal}  剩余：${remaining}`,
    ``,
    `各尺码入库数量：`,
    inboundLines || "无尺码数据",
    ``,
    `各尺码剩余数量：`,
    remainingLines || "无尺码数据",
  ];

  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    if (!AGNES_API_KEY) {
      return NextResponse.json({ error: "Agnes API Key 未配置" }, { status: 500 });
    }

    const body = await request.json();
    const { sale_id, product_photo_url, member_id, prompts } = body;

    if (!sale_id || !product_photo_url) {
      return NextResponse.json({ error: "缺少 sale_id 或 product_photo_url" }, { status: 400 });
    }

    // 自定义提示词或默认提示词
    const p = prompts || {};
    const promptClothingDesc = p.clothingDesc || `请以JSON格式识别这张图片中的衣服英文关键词：garment_type（如t-shirt, hoodie, dress, polo, shirt, sweatshirt, jacket, romper, vest, skirt set等），main_color（精确颜色），patterns（每个图案的位置+形状+颜色+大小），neckline_sleeves，material，details。只输出JSON，不要额外文字。`;
    const promptSceneScript = p.sceneScript || `Based on this garment description, write a brief 2-3 sentence English description of a stylish photoshoot scene for a kids fashion lookbook. Include: (1) a specific outdoor/cafe/street/rooftop/staircase setting with real details (asphalt ground, glass doors, wooden stairs, tiled walls, etc.), (2) natural lighting (golden hour sunlight, soft window light, warm afternoon sun with shadows), (3) the child model's pose (crouching, sitting on stairs, standing casually by a door, walking, etc.), (4) matching fashion accessories (knit hat, small crossbody bag, sunglasses, colorful necktie, canvas tote bag, boots, sneakers, hair clips, braids — pick 2-3 that fit the garment style). Keep it vivid and concrete. Avoid any studio/neutral/plain/white background words.\n\nGarment: {{GARMENT_DESC}}`;
    const promptModel = p.modelPrompt || "A high-resolution, photorealistic kids fashion editorial photo. A cute Chinese child (with a lovely natural expression and hairstyle) wearing a {{GARMENT_DESC}}. {{SCENE_DESC}}. The garment details match perfectly — same color, same pattern prints and placement, same fabric texture, same neckline and sleeves. Full body shot, eye-level angle, natural skin tones, highly detailed and sharp, professional photography, no collages, no montage, single candid photo.";
    const promptFlat = p.flatPrompt || "A professionally shot flat-lay product photo of a {{GARMENT_DESC}}. The garment matches the description exactly — same color, same pattern prints, same material texture, same neckline and sleeves. Laid flat and smooth, front view, on a pure white background, clean sharp edges, no model, no shadow, professional product photography, high resolution.";

    // ===== 步骤 0: 查询商品详情和销售数据 =====
    console.log("Agnes 步骤0: 查询商品详情...");
    const [productDetail, salesStats] = await Promise.all([
      getProductDetail(sale_id),
      getSalesStats(sale_id),
    ]);

    const productText = productDetail
      ? buildProductText(productDetail, salesStats)
      : `售卖编号：${sale_id}\n（未找到商品详情）`;

    console.log("商品信息文本:\n", productText);

    // ===== 步骤 1: 视觉模型 → 英文关键词精确识别 =====
    console.log("Agnes 步骤1: 视觉识别英文关键词...");
    const descRes = await fetch(`${AGNES_BASE}/chat/completions`, {
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
            { type: "text", text: promptClothingDesc },
          ],
        }],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });

    const descData = await descRes.json();
    if (!descRes.ok) {
      console.error("Agnes 服装识别错误:", descData);
      throw new Error(`Agnes 服装识别失败: ${descData.error?.message || JSON.stringify(descData)}`);
    }

    let rawDesc = descData?.choices?.[0]?.message?.content || "";
    console.log("识别原始输出:", rawDesc);

    // 尝试从 JSON 中提取；失败则直接用原文
    let garmentDesc = rawDesc;
    try {
      const jsonMatch = rawDesc.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        garmentDesc = Object.values(parsed)
          .filter((v) => v && String(v).trim())
          .join(", ");
      }
    } catch (_e) {
      console.log("JSON解析失败，使用原文");
    }

    if (!garmentDesc) {
      throw new Error("Agnes 未返回服装描述");
    }
    console.log("服装描述 (用于生成):", garmentDesc);

    const fetchHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGNES_API_KEY}`,
    };

    // ===== 步骤 1.5: 文本模型 → 基于服装描述生成场景/动作/光线/配饰 =====
    console.log("Agnes 步骤1.5: 生成场景/动作/配饰脚本...");
    let sceneDesc = "";
    try {
      const scenePrompt = promptSceneScript.replace("{{GARMENT_DESC}}", garmentDesc);
      const sceneRes = await fetch(`${AGNES_BASE}/chat/completions`, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify({
          model: "agnes-2.0-flash",
          messages: [{ role: "user", content: scenePrompt }],
          max_tokens: 300,
          temperature: 0.85,
        }),
      });
      const sceneData = await sceneRes.json();
      sceneDesc = sceneData?.choices?.[0]?.message?.content || "";
    } catch (e) {
      console.warn("场景脚本生成失败，使用默认场景:", e);
    }

    if (!sceneDesc.trim()) {
      sceneDesc = "Outdoor setting on asphalt pavement in warm afternoon sunlight with soft shadows. The child crouches naturally with one hand resting near the ground. A cute knit beanie and small crossbody bag complete the casual street-style look.";
    }
    console.log("场景描述 (用于生成):", sceneDesc);

    // ===== 步骤 2 & 3: 并行生成模特试穿图和白底平铺图 =====
    console.log("Agnes 步骤2&3: 并行生成图片...");

    const randomSeed = Math.floor(Math.random() * 2147483647);

    const modelPrompt = promptModel.replace("{{GARMENT_DESC}}", garmentDesc).replace("{{SCENE_DESC}}", sceneDesc);
    const flatPrompt = promptFlat.replace("{{GARMENT_DESC}}", garmentDesc);

    const [modelRes, flatRes] = await Promise.all([
      fetch(`${AGNES_BASE}/images/generations`, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify({
          model: "agnes-image-2.0-flash",
          prompt: modelPrompt,
          size: "1024x1536",
          seed: randomSeed,
        }),
      }),
      fetch(`${AGNES_BASE}/images/generations`, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify({
          model: "agnes-image-2.0-flash",
          prompt: flatPrompt,
          size: "1024x1024",
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

    // ===== 步骤 5: 发送企业微信（先文本，再图片） =====
    const textSent = await sendTextToWechat(productText);
    // 文本和图片之间稍等一下，确保顺序
    const [wechatModelSent, wechatFlatSent] = await Promise.all([
      sendToWechat(modelImageUrl, "模特试穿图"),
      sendToWechat(flatImageUrl, "白底平铺图"),
    ]);

    // ===== 步骤 6: 记录用量 =====
    if (member_id) {
      const { error: usageError } = await supabase.from("model_usage").insert({
        member_id,
        model_name: "agnes",
      });
      if (usageError) console.error("Agnes 用量记录失败:", usageError.message);
    }

    return NextResponse.json({
      generated_url: modelImageUrl,
      flat_url: flatImageUrl,
      clothing_desc: garmentDesc,
      product_text: productText,
      wechat_sent: textSent && wechatModelSent && wechatFlatSent,
      sale_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Agnes generate error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}