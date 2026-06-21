import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";

const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";
const QWEN_IMAGE_EDIT_ENDPOINT = `${DASHSCOPE_BASE}/services/aigc/multimodal-generation/generation`;
const MAX_SIZE_BYTES = 200 * 1024;
const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// ===== 工具函数 =====
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
  return Buffer.from(buffer);
}

async function computeMd5(buffer: Buffer): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("md5").update(buffer).digest("hex");
}

async function urlToBase64DataUri(url: string): Promise<string> {
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  const base64 = buffer.toString("base64");
  return `data:${contentType};base64,${base64}`;
}

// ===== 企业微信发送 =====
async function sendTextToWechat(content: string): Promise<boolean> {
  if (!WECHAT_WEBHOOK_URL) return false;
  try {
    const res = await fetch(WECHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content } }),
    });
    const data = await res.json();
    return data?.errcode === 0;
  } catch (err) {
    console.error("企业微信 文本 发送失败:", err);
    return false;
  }
}

async function sendImageToWechat(imageUrl: string): Promise<boolean> {
  if (!WECHAT_WEBHOOK_URL) return false;
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
    return data?.errcode === 0;
  } catch (err) {
    console.error("企业微信 图片 发送失败:", err);
    return false;
  }
}

// ===== 商品查询 =====
async function getProductDetail(saleId: string) {
  const { data, error } = await supabase
    .from("inbound_records")
    .select("*")
    .eq("sale_id", saleId.toUpperCase())
    .maybeSingle();
  if (error) console.error("查询商品详情失败:", error.message);
  return data || null;
}

async function getSalesStats(saleId: string) {
  const [salesRes, returnRes] = await Promise.all([
    supabase.from("sales_records").select("quantity, sell_price, size").eq("sale_id", saleId.toUpperCase()),
    supabase.from("return_records").select("quantity, size").eq("sale_id", saleId.toUpperCase()),
  ]);
  let soldTotal = 0, sellPrice = 0;
  const soldBySize: Record<string, number> = {};
  if (salesRes.data) for (const row of salesRes.data) {
    const qty = Number(row.quantity) || 0;
    soldTotal += qty;
    if (!sellPrice && Number(row.sell_price) > 0) sellPrice = Number(row.sell_price);
    const sz = String(row.size || "");
    soldBySize[sz] = (soldBySize[sz] || 0) + qty;
  }
  let returnTotal = 0;
  const returnedBySize: Record<string, number> = {};
  if (returnRes.data) for (const row of returnRes.data) {
    const qty = Number(row.quantity) || 0;
    returnTotal += qty;
    const sz = String(row.size || "");
    returnedBySize[sz] = (returnedBySize[sz] || 0) + qty;
  }
  return { soldTotal, returnTotal, sellPrice, soldBySize, returnedBySize };
}

function buildProductText(product: Record<string, unknown>, stats: { soldTotal: number; returnTotal: number; sellPrice: number; soldBySize: Record<string, number>; returnedBySize: Record<string, number> }) {
  const saleId = (product.sale_id as string) || "";
  const manufacturer = (product.manufacturer as string) || "未知";
  const costPrice = Number(product.cost_price) || 0;
  const sellPrice = stats.sellPrice || 0;
  const profit = (sellPrice - costPrice).toFixed(1);
  const totalStock = Number(product.total_stock) || 0;
  const remaining = totalStock - stats.soldTotal + stats.returnTotal;
  const name = (product.name as string) || "";
  const inboundLines = SIZES.map((s) => {
    const qty = Number(product[`size_${s}`]) || 0;
    return qty > 0 ? `${s}:${qty}` : null;
  }).filter(Boolean).join(" ");
  const remainingLines = SIZES.map((s) => {
    const initial = Number(product[`size_${s}`]) || 0;
    const sold = stats.soldBySize[String(s)] || 0;
    const returned = stats.returnedBySize[String(s)] || 0;
    const rem = initial - sold + returned;
    return rem > 0 ? `${s}:${rem}` : null;
  }).filter(Boolean).join(" ");
  return [
    `【商品查询】${saleId}`,
    ``,
    `商品名称：${name}`,
    `进货厂家：${manufacturer}`,
    `进价：¥${costPrice}  售价：¥${sellPrice}  利润：¥${profit}`,
    `总库存：${totalStock}  售出：${stats.soldTotal}  退货：${stats.returnTotal}  剩余：${remaining}`,
    ``,
    `各尺码入库：${inboundLines || "无"}`,
    `各尺码剩余：${remainingLines || "无"}`,
  ].join("\n");
}

// ===== 图生图：Qwen Image Edit Plus =====
// 接收衣服照片 + 模特照片，直接生成模特试穿图
async function callQwenImageEdit(productPhotoUrl: string, modelPhotoUrl: string, garmentDesc: string): Promise<string | null> {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("DashScope API Key 未配置 (DASHSCOPE_API_KEY)");
  }
  console.log("[Qwen] 下载商品图片...");
  const productBase64 = await urlToBase64DataUri(productPhotoUrl);
  console.log("[Qwen] 下载模特图片...");
  const modelBase64 = await urlToBase64DataUri(modelPhotoUrl);

  const prompt = `This is a virtual try-on task. Image 1 is a clothing photo showing the garment clearly. Image 2 is a child model. Your task: Make the child model wear this exact garment. The garment (${garmentDesc}) must be preserved perfectly — exact same garment style, exact same main color, exact same pattern design and placement, exact same fabric texture and material, exact same neckline and sleeves, exact same details. The child model should look natural and photorealistic — natural pose, natural expression, natural lighting. Keep the model's face and body shape the same as in image 2. Full body shot. Photorealistic, high quality, no watermark.`;

  console.log("[Qwen] 调用 Image Edit Plus API...");
  const res = await fetch(QWEN_IMAGE_EDIT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "qwen-image-edit-plus",
      input: {
        messages: [
          {
            role: "user",
            content: [
              { image: productBase64 },
              { image: modelBase64 },
              { text: prompt },
            ],
          },
        ],
      },
      parameters: {
        n: 1,
        watermark: false,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("[Qwen] API 错误:", JSON.stringify(data, null, 2));
    throw new Error(`Qwen API 错误: ${data.message || data.code || JSON.stringify(data)}`);
  }

  // 提取返回的图片URL
  const imageUrl =
    data?.output?.choices?.[0]?.message?.content?.find?.((c: { image?: string }) => c.image)?.image
    || data?.output?.results?.[0]?.url
    || data?.output?.images?.[0];

  if (!imageUrl) {
    console.error("[Qwen] 返回无图片:", JSON.stringify(data));
    throw new Error("Qwen 未返回生成图片");
  }
  console.log("[Qwen] 模特图生成成功:", imageUrl);
  return imageUrl;
}

// ===== 从模特库随机选一个 =====
async function getRandomModelFromLibrary(): Promise<{ name: string; photo_url: string } | null> {
  try {
    const { data, error } = await supabase
      .from("model_library")
      .select("name, photo_url")
      .order("created_at", { ascending: false });
    if (error || !data || data.length === 0) return null;
    const randomIdx = Math.floor(Math.random() * data.length);
    console.log(`[模特库] 选中: ${data[randomIdx].name} (${randomIdx + 1}/${data.length})`);
    return data[randomIdx];
  } catch (err) {
    console.error("[模特库] 查询失败:", err);
    return null;
  }
}

// ===== Agnes 生成白底平铺图 =====
async function generateFlatImage(productPhotoUrl: string, garmentDesc: string, flatPromptTemplate: string): Promise<string | null> {
  if (!AGNES_API_KEY) return null;
  try {
    const flatPrompt = flatPromptTemplate.replace("{{GARMENT_DESC}}", garmentDesc);
    const res = await fetch(`${AGNES_BASE}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGNES_API_KEY}`,
      },
      body: JSON.stringify({
        model: "agnes-image-2.0-flash",
        prompt: flatPrompt,
        size: "1024x1024",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Agnes 平铺图错误:", data);
      return null;
    }
    return data?.data?.[0]?.url || null;
  } catch (err) {
    console.error("Agnes 平铺图生成失败:", err);
    return null;
  }
}

// ===== Agnes 视觉识别 =====
async function recognizeGarmentWithAgnes(productPhotoUrl: string, clothingDescPrompt: string): Promise<string> {
  if (!AGNES_API_KEY) {
    console.warn("Agnes API Key 未配置，跳过视觉识别");
    return "a piece of clothing";
  }
  try {
    const res = await fetch(`${AGNES_BASE}/chat/completions`, {
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
            { type: "image_url", image_url: { url: productPhotoUrl } },
            { type: "text", text: clothingDescPrompt },
          ],
        }],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Agnes 视觉识别错误:", data);
      return "a piece of clothing";
    }
    const rawDesc = data?.choices?.[0]?.message?.content || "";
    let desc = rawDesc;
    try {
      const jsonMatch = rawDesc.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        desc = Object.values(parsed).filter((v) => v && String(v).trim()).join(", ");
      }
    } catch (_e) { /* 保持原文 */ }
    return desc || "a piece of clothing";
  } catch (err) {
    console.error("Agnes 视觉识别失败:", err);
    return "a piece of clothing";
  }
}

// ===== POST 主入口 =====
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sale_id, product_photo_url, member_id, prompts, skip_text_query, only_images } = body;

    if (!sale_id || !product_photo_url) {
      return NextResponse.json({ error: "缺少 sale_id 或 product_photo_url" }, { status: 400 });
    }

    const skipTextQuery = skip_text_query === true || skip_text_query === "true";
    const onlyImages = only_images === true || only_images === "true";

    // ===== 自定义提示词 =====
    const p = prompts || {};
    const clothingDescPrompt = p.clothingDesc || `请以JSON格式识别这张图片中的衣服英文关键词：garment_type（如t-shirt, hoodie, dress, polo, shirt, sweatshirt, jacket, romper, vest, skirt set等），main_color（精确颜色），patterns（每个图案的位置+形状+颜色+大小），neckline_sleeves，material，details。只输出JSON，不要额外文字。`;
    const flatPromptTemplate = p.flatPrompt || "A professionally shot flat-lay product photo of {{GARMENT_DESC}}. The garment matches the description exactly — same color, same pattern prints, same material texture, same neckline and sleeves. Laid flat and smooth, front view, on a pure white background, clean sharp edges, no model, no shadow, professional product photography, high resolution.";

    console.log(`[生成流程开始] 商品: ${sale_id}, skip_text_query: ${skipTextQuery}, only_images: ${onlyImages}`);

    // ===== 并行：查询商品 + 视觉识别 + 选模特 =====
    // skip_text_query=true 时，不查询商品信息（由调用方负责发送文本）
    const [productDetail, salesStats] = skipTextQuery
      ? [null, null]
      : await Promise.all([
          getProductDetail(sale_id),
          getSalesStats(sale_id),
        ]);

    const [garmentDesc, randomModel] = await Promise.all([
      recognizeGarmentWithAgnes(product_photo_url, clothingDescPrompt),
      getRandomModelFromLibrary(),
    ]);

    console.log("服装描述:", garmentDesc);
    console.log("模特:", randomModel?.name || "无模特库，用商品图参考");

    // ===== 生成模特试穿图 (图生图) =====
    let modelImageUrl: string | null = null;
    try {
      const modelPhotoUrl = randomModel?.photo_url || product_photo_url;
      modelImageUrl = await callQwenImageEdit(product_photo_url, modelPhotoUrl, garmentDesc);
    } catch (err) {
      console.error("[模特图生成失败]:", err instanceof Error ? err.message : err);
    }

    // ===== 生成平铺白底图 =====
    const flatImageUrl = await generateFlatImage(product_photo_url, garmentDesc, flatPromptTemplate);

    // ===== 构建商品文本 =====
    const productText = productDetail && salesStats
      ? buildProductText(productDetail, salesStats)
      : `售卖编号：${sale_id}`;

    // ===== 发送企业微信 =====
    // skip_text_query=true 时，只发送图片（不发送商品文本，避免和 wechat-bot 重复）
    let wechatSent = false;
    if (WECHAT_WEBHOOK_URL) {
      if (!skipTextQuery && !onlyImages) {
        await sendTextToWechat(productText);
      }
      if (modelImageUrl) await sendImageToWechat(modelImageUrl);
      if (flatImageUrl) await sendImageToWechat(flatImageUrl);
      wechatSent = true;
    }

    // ===== 记录用量 =====
    if (member_id) {
      try {
        await supabase.from("model_usage").insert({ member_id, model_name: "agnes" });
      } catch (e: any) {
        console.error("用量记录失败:", e?.message || e);
      }
    }

    console.log("[生成流程完成]");

    return NextResponse.json({
      generated_url: modelImageUrl,
      flat_url: flatImageUrl,
      clothing_desc: garmentDesc,
      model_used: randomModel?.name || null,
      product_text: productText,
      wechat_sent: wechatSent,
      sale_id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[生成流程致命错误]:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
