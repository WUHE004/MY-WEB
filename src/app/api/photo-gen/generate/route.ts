import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || "";
const DOUBAO_ENDPOINT_ID = process.env.DOUBAO_ENDPOINT_ID || "";
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";

const DOUBAO_BASE = "https://ark.cn-beijing.volces.com/api/v3";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1";
// Qwen 图片编辑需要走 multimodal-generation 端点（非 image-generation）
const QWEN_IMAGE_EDIT_ENDPOINT = `${DASHSCOPE_BASE}/services/aigc/multimodal-generation/generation`;
const MAX_SIZE_BYTES = 200 * 1024; // 200KB
const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

type ModelType = "doubao" | "qwen" | "aitryon" | "agnes" | "custom";

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

// 下载图片并转为 base64 data URI（用于解决外部 API 无法访问内网 URL 的问题）
async function urlToBase64DataUri(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    const base64 = buffer.toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error(`图片下载失败 (${url}):`, err);
    throw new Error("图片下载失败，请检查图片链接是否可访问");
  }
}

// 调用 Qwen-Image-Edit API（使用 base64 data URI 传图，避免 URL 访问问题）
async function callQwenImageEdit(productPhotoUrl: string, modelPhotoUrl: string): Promise<string | null> {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("DashScope API Key 未配置");
  }

  console.log("下载商品图片...");
  const productBase64 = await urlToBase64DataUri(productPhotoUrl);
  console.log("下载模特图片...");
  const modelBase64 = await urlToBase64DataUri(modelPhotoUrl);

  const prompt = "让模特穿上这件衣服,保持衣服的款式、纹理、图案、颜色、细节完全不变。模特穿着该衣服自然站立展示效果。";

  const payload = {
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
      prompt_extend: true,
    },
  };

  console.log("调用 Qwen API... (图片已转 base64)");

  const res = await fetch(QWEN_IMAGE_EDIT_ENDPOINT, {
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

// 调用阿里云百炼 AI试衣 (aitryon-plus) API
// 注意: aitryon-plus 要求传入公网可访问的 HTTP URL，不能用 base64
async function callAitryonPlus(productPhotoUrl: string, modelPhotoUrl: string): Promise<string | null> {
  if (!DASHSCOPE_API_KEY) {
    throw new Error("DashScope API Key 未配置");
  }

  const payload = {
    model: "aitryon-plus",
    input: {
      person_image_url: modelPhotoUrl,
      top_garment_url: productPhotoUrl,
    },
    parameters: {
      resolution: -1,
      restore_face: true,
    },
  };

  console.log("调用 aitryon-plus API...");

  // 1. 创建异步任务
  const createRes = await fetch(`${DASHSCOPE_BASE}/services/aigc/image2image/image-synthesis/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(payload),
  });

  const createData = await createRes.json();

  if (!createRes.ok) {
    console.error("aitryon API 错误:", createData);
    throw new Error(`AI试衣 API 错误: ${createData.message || JSON.stringify(createData)}`);
  }

  const taskId = createData?.output?.task_id;
  if (!taskId) {
    console.error("aitryon 返回无 task_id:", createData);
    throw new Error("AI试衣未返回任务ID");
  }

  console.log("aitryon 任务已创建:", taskId);

  // 2. 轮询任务结果 (最多等待 120 秒)
  const maxAttempts = 24; // 24 * 5s = 120s
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const pollRes = await fetch(`${DASHSCOPE_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${DASHSCOPE_API_KEY}` },
    });
    const pollData = await pollRes.json();
    const status = pollData?.output?.task_status;

    console.log(`aitryon 状态 (${i + 1}/${maxAttempts}): ${status}`);

    if (status === "SUCCEEDED") {
      // aitryon-plus 返回字段是 output.image_url（不是 results[0].url）
      const imageUrl = pollData?.output?.image_url
        || pollData?.output?.results?.[0]?.url
        || pollData?.output?.results?.[0]?.image;
      if (imageUrl) {
        console.log("aitryon 生成成功:", imageUrl);
        return imageUrl;
      }
      console.error("aitryon SUCCEEDED 但未找到图片，完整响应:", JSON.stringify(pollData));
      throw new Error("AI试衣任务成功但未返回图片");
    }

    if (status === "FAILED") {
      throw new Error(`AI试衣任务失败: ${pollData?.output?.message || "未知错误"}`);
    }

    // PENDING 或 RUNNING，继续轮询
  }

  throw new Error("AI试衣任务超时 (120s)");
}

// 调用 Agnes 只生成白底平铺图（一键生成 flat_only 用，Agnes图生图保留细节）
async function callAgnesFlatOnly(productPhotoUrl: string): Promise<string | null> {
  if (!AGNES_API_KEY) {
    throw new Error("Agnes API Key 未配置");
  }

  console.log("Agnes-Flat: 生成白底平铺图（图生图）...");
  try {
    const flatRes = await fetch(`${AGNES_BASE}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
      body: JSON.stringify({
        model: "agnes-image-2.0-flash",
        prompt: `Transform the garment into a professionally shot flat-lay product photo. Preserve the exact garment type, colors, patterns, prints, fabric texture, every detail from the photo. Laid flat and smooth, front view, on a pure white background. Clean sharp edges, no model, no shadow, professional product photography.`,
        size: "1024x1024",
        tags: ["img2img"],
        extra_body: { image: [productPhotoUrl], response_format: "url" },
      }),
    });
    const flatData = await flatRes.json();
    if (flatRes.ok) {
      const url = flatData?.data?.[0]?.url || null;
      console.log("Agnes-Flat: 白底图生成成功:", url);
      return url;
    }
    console.error("Agnes-Flat: 白底图生成失败:", flatData);
    return null;
  } catch (err) {
    console.error("Agnes-Flat: 生成异常:", err);
    return null;
  }
}

// 调用 Agnes 文本模型生成拍摄场景和配饰描述
async function callAgnesTextModel(garmentDesc: string, modelDesc: string): Promise<string> {
  try {
    const prompt = `Based on this clothing: "${garmentDesc}", worn by ${modelDesc}, generate a professional fashion photoshoot scene and outfit suggestion. If the clothing is a top (t-shirt, shirt, hoodie, etc.), suggest matching bottoms (pants, jeans, skirt) and shoes. If it's a dress, suggest matching shoes and accessories. Describe the scene: location, lighting, composition, camera angle. Output ONLY the scene description in English, under 80 words, format: "Wearing [outfit], [scene description], [photography style]". No extra text.`;

    const res = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
      body: JSON.stringify({
        model: "agnes-2.0-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });
    const data = await res.json();
    const scene = data?.choices?.[0]?.message?.content || "";
    console.log("Agnes: 场景描述:", scene);
    return scene;
  } catch (err) {
    console.error("Agnes: 场景描述生成失败:", err);
    return "";
  }
}

// 503 重试包装（最多3次，间隔3秒，平衡可靠性与 Vercel 超时）
const AGNES_MAX_RETRIES = 3;
const AGNES_RETRY_DELAY_MS = 3000;

async function agnesImageFetch(url: string, body: unknown, retries = AGNES_MAX_RETRIES): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (res.status === 503 && retries > 0) {
    console.log(`[Agnes] 503 服务繁忙，剩余 ${retries} 次重试，${AGNES_RETRY_DELAY_MS}ms 后重试...`);
    await new Promise((r) => setTimeout(r, AGNES_RETRY_DELAY_MS));
    return agnesImageFetch(url, body, retries - 1);
  }
  return res;
}

// 调用 Agnes 模型（一键生成流程：白底图 ‖ 试穿图 并行生成）
async function callAgnesModel(productPhotoUrl: string, modelPhotoUrl: string): Promise<{ modelUrl: string | null; flatUrl: string | null; sceneDescription: string }> {
  if (!AGNES_API_KEY) {
    throw new Error("Agnes API Key 未配置");
  }

  // 白底图提示词：只换背景为纯白，不改变衣服任何特征（防止袖长/领型/颜色变形）
  const flatPrompt = `Remove the background completely and replace it with pure white #FFFFFF. Keep the original garment exactly as-is — same style, same sleeve length, same collar type, same colors, same patterns, same prints, same fabric texture, same proportions, same every single detail. Do NOT alter, redraw, transform, or regenerate the garment in any way. The garment must be a pixel-perfect copy of the original, only the background changes to pure white. Flat-lay front view, no model, no shadow, no mannequin, professional e-commerce product photography, sharp focus.`;

  // 试穿图提示词：浅灰质感棚拍背景，3:4，强调保留袖长/版型/模特幼态可爱感
  // 姿势随机变化，避免每张图动作雷同
  const childPoses = [
    "standing naturally with a gentle innocent smile, hands relaxed at sides",
    "slightly tilting head with a cute playful smile, one hand lightly touching the garment hem",
    "standing with hands behind back, cheerful childlike expression",
    "gently posing with one hand on hip, natural sweet smile",
    "standing casually with arms crossed loosely, bright innocent look",
    "slightly turning body with a lovely smile, hands naturally positioned in front",
    "standing with one hand touching hair, adorable childlike expression",
    "gently stepping forward with a warm cute smile, hands relaxed",
  ];
  const randomPose = childPoses[Math.floor(Math.random() * childPoses.length)];

  const tryOnPrompt = `A premium fashion studio photograph of the model wearing the exact garment from the reference clothing photo. The model's face, facial features, body shape, skin tone, hairstyle, AND age appearance must remain strictly identical to the reference model photo — preserve the cute childlike charm, youthful innocence, and adorable features exactly. DO NOT make the model look older, more mature, or lose the child's innocent vibe. The garment must be preserved with absolute fidelity — same style, same sleeve length, same collar, same fit, same colors, same patterns, same prints, same fabric texture, same every detail, no alteration whatsoever. Light gray textured seamless studio backdrop (#E8E8E8 tone), premium fashion photography, soft even studio lighting, subtle natural shadow, full body shot, vertical 3:4 composition, ${randomPose}, sharp focus, high-end editorial quality.`;

  // 白底图和试穿图并行生成（互不依赖，节省一半时间）
  // 试穿图直接用衣服原图+模特图，避免白底图变形累积误差
  console.log("Agnes: 并行生成白底图和试穿图...");

  const flatTask = (async (): Promise<string | null> => {
    try {
      const flatRes = await agnesImageFetch(`${AGNES_BASE}/images/generations`, {
        model: "agnes-image-2.1-flash",
        prompt: flatPrompt,
        size: "1024x1024",
        tags: ["img2img"],
        extra_body: { image: [productPhotoUrl], response_format: "url" },
      });
      const flatData = await flatRes.json();
      if (!flatRes.ok) {
        console.error("Agnes: 白底图生成失败:", flatData);
        return null;
      }
      const url = flatData?.data?.[0]?.url || null;
      console.log("Agnes: 白底图生成成功:", url);
      return url;
    } catch (err) {
      console.error("Agnes: 白底图生成异常:", err);
      return null;
    }
  })();

  const tryOnTask = (async (): Promise<string> => {
    const modelRes = await agnesImageFetch(`${AGNES_BASE}/images/generations`, {
      model: "agnes-image-2.1-flash",
      prompt: tryOnPrompt,
      size: "768x1024",
      tags: ["img2img"],
      extra_body: { image: [productPhotoUrl, modelPhotoUrl], response_format: "url" },
    });
    const modelData = await modelRes.json();
    if (!modelRes.ok) {
      console.error("Agnes: 试穿图生成失败:", modelData);
      throw new Error(`试穿图生成失败: ${JSON.stringify(modelData)}`);
    }
    const url = modelData?.data?.[0]?.url || null;
    if (!url) throw new Error("试穿图生成失败：未返回图片");
    console.log("Agnes: 试穿图生成成功:", url);
    return url;
  })();

  const [flatUrl, modelUrl] = await Promise.all([flatTask, tryOnTask]);

  return { modelUrl, flatUrl, sceneDescription: "" };
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

// 解析 JSON 路径 (如 "output.0" 或 "data.url")
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const idx = parseInt(part, 10);
    if (!isNaN(idx) && Array.isArray(current)) {
      current = current[idx];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

// 调用自定义模型 API
async function callCustomModel(
  productPhotoUrl: string,
  modelPhotoUrl: string,
  config: { apiEndpoint: string; apiKey: string; modelId: string; requestTemplate: string; responseImagePath: string; extraHeaders: string }
): Promise<string | null> {
  console.log("下载商品图片 (自定义模型)...");
  const productBase64 = await urlToBase64DataUri(productPhotoUrl);
  console.log("下载模特图片 (自定义模型)...");
  const modelBase64 = await urlToBase64DataUri(modelPhotoUrl);

  // 替换占位符
  let bodyStr = config.requestTemplate
    .replace(/\{\{MODEL_ID\}\}/g, config.modelId)
    .replace(/\{\{PRODUCT_IMAGE\}\}/g, productBase64)
    .replace(/\{\{MODEL_IMAGE\}\}/g, modelBase64);

  let payload: unknown;
  try {
    payload = JSON.parse(bodyStr);
  } catch {
    throw new Error("请求体模板 JSON 格式错误");
  }

  // 构建请求头
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };
  try {
    if (config.extraHeaders) {
      Object.assign(headers, JSON.parse(config.extraHeaders));
    }
  } catch {
    // 忽略无效的额外请求头
  }

  console.log(`调用自定义模型: ${config.apiEndpoint}`);
  const res = await fetch(config.apiEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("自定义模型 API 错误:", data);
    throw new Error(`自定义模型 API 错误: ${JSON.stringify(data)}`);
  }

  // 通过路径提取图片 URL
  const imageUrl = getByPath(data, config.responseImagePath);
  if (typeof imageUrl !== "string" || !imageUrl) {
    console.error("自定义模型返回无图片:", data);
    throw new Error(`自定义模型未返回图片 (路径: ${config.responseImagePath})`);
  }

  console.log("自定义模型生成成功:", imageUrl);
  return imageUrl;
}

// 发送企业微信文本消息
async function sendTextToWechat(content: string): Promise<boolean> {
  if (!WECHAT_WEBHOOK_URL) return false;
  try {
    const wechatRes = await fetch(WECHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content } }),
    });
    const data = await wechatRes.json();
    return data?.errcode === 0;
  } catch (err) {
    console.error("企业微信 文本 发送失败:", err);
    return false;
  }
}

// 查询商品详情
async function getProductDetail(saleId: string) {
  const { data } = await supabase
    .from("inbound_records")
    .select("*")
    .eq("sale_id", saleId)
    .maybeSingle();
  return data || null;
}

// 查询商品销量和退货量（含分尺码）
async function getSalesStats(saleId: string) {
  const [salesRes, returnRes] = await Promise.all([
    supabase.from("sales_records").select("quantity, sell_price, size").eq("sale_id", saleId),
    supabase.from("return_records").select("quantity, size").eq("sale_id", saleId),
  ]);
  let soldTotal = 0, sellPrice = 0;
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
    `【AI 穿衣】商品信息`,
    ``,
    `售卖编号：${saleId}`,
    `商品名称：${name}`,
    `进货厂家：${manufacturer}`,
    `进价：¥${costPrice}  售价：¥${sellPrice}  利润：¥${profit}`,
    `总库存：${totalStock}  售出：${stats.soldTotal}  退货：${stats.returnTotal}  剩余：${remaining}`,
    ``,
    `各尺码入库数量：`,
    inboundLines || "无尺码数据",
    ``,
    `各尺码剩余数量：`,
    remainingLines || "无尺码数据",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sale_id, product_photo_url, model_id, ai_model, custom_model, member_id, flat_only } = body;

    const activeModel: ModelType = ai_model === "qwen" ? "qwen" : ai_model === "aitryon" ? "aitryon" : ai_model === "agnes" ? "agnes" : ai_model === "custom" ? "custom" : "doubao";

    // flat_only 模式：只生成白底图，不需要模特
    if (flat_only) {
      if (!sale_id || !product_photo_url) {
        return NextResponse.json({ error: "缺少 sale_id 或 product_photo_url" }, { status: 400 });
      }

      console.log(`[flat_only] 使用 ${activeModel} 模型只生成白底图`);
      let flatUrl: string | null = null;

      if (activeModel === "agnes") {
        flatUrl = await callAgnesFlatOnly(product_photo_url);
      } else {
        // 其他模型不支持 flat_only，降级使用 Agnes
        flatUrl = await callAgnesFlatOnly(product_photo_url);
      }

      if (!flatUrl) {
        return NextResponse.json({ error: "白底图生成失败" }, { status: 500 });
      }

      // 记录用量
      if (member_id) {
        await supabase.from("model_usage").insert({
          member_id,
          model_name: activeModel,
        }).then(({ error }) => { if (error) console.error("用量记录失败:", error.message); });
      }

      return NextResponse.json({ flat_url: flatUrl, sale_id });
    }

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
    let flatUrl: string | null = null;

    if (activeModel === "custom" && custom_model) {
      generatedUrl = await callCustomModel(product_photo_url, modelPhotoUrl, custom_model);
    } else if (activeModel === "qwen") {
      generatedUrl = await callQwenImageEdit(product_photo_url, modelPhotoUrl);
    } else if (activeModel === "aitryon") {
      generatedUrl = await callAitryonPlus(product_photo_url, modelPhotoUrl);
    } else if (activeModel === "agnes") {
      const agnesResult = await callAgnesModel(product_photo_url, modelPhotoUrl);
      if (agnesResult) {
        generatedUrl = agnesResult.modelUrl;
        flatUrl = agnesResult.flatUrl;
      }
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

    // 4. 查询商品详情并发送企业微信（先文本，再白底图，再试穿图）
    let wechatSent = false;
    if (WECHAT_WEBHOOK_URL) {
      try {
        // 1. 先发送商品信息文本
        const [productDetail, salesStats] = await Promise.all([
          getProductDetail(sale_id),
          getSalesStats(sale_id),
        ]);
        const productText = productDetail
          ? buildProductText(productDetail, salesStats)
          : `售卖编号：${sale_id}`;
        await sendTextToWechat(productText);

        // 2. 再发送白底图
        if (flatUrl) {
          try {
            const flatRes = await fetch(flatUrl);
            const flatRawBuffer = Buffer.from(await flatRes.arrayBuffer());
            const flatCompressed = await compressImage(flatRawBuffer);
            const flatBase64 = flatCompressed.toString("base64");
            const flatMd5 = await computeMd5(flatCompressed);
            const flatWechatRes = await fetch(WECHAT_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ msgtype: "image", image: { base64: flatBase64, md5: flatMd5 } }),
            });
            const flatWechatData = await flatWechatRes.json();
            console.log("企业微信发送白底图结果:", flatWechatData);
          } catch (flatErr) {
            console.error("微信发送白底图失败:", flatErr);
          }
        }

        // 3. 最后发送试穿图
        const base64Image = imageBuffer.toString("base64");
        const md5 = await computeMd5(imageBuffer);
        const wechatRes = await fetch(WECHAT_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ msgtype: "image", image: { base64: base64Image, md5 } }),
        });
        const wechatData = await wechatRes.json();
        console.log("企业微信发送试穿图结果:", wechatData);
        wechatSent = wechatData?.errcode === 0;
      } catch (wechatErr) {
        console.error("微信发送失败:", wechatErr);
      }
    }

    // 直接返回生成图片的 URL（不存入 Supabase，节省存储空间）
    // 记录用量（用于跨设备同步剩余次数）
    if (member_id) {
      const { error: usageError } = await supabase.from("model_usage").insert({
        member_id,
        model_name: activeModel === "custom" && custom_model?.id
          ? `custom_${custom_model.id}`
          : activeModel,
      });
      if (usageError) console.error("用量记录失败:", usageError.message);
    }

    return NextResponse.json({
      generated_url: generatedUrl,
      flat_url: flatUrl,
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