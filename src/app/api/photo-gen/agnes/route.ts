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
    const promptShootingScript = p.shootingScript || "根据这张衣服照片，为这件童装撰写一份专业的拍摄脚本，详细描述：1. 儿童模特选择（性别、年龄范围、肤色、气质类型）2. 模特的妆容和发型设计 3. 模特的动作和姿势 4. 拍摄环境和场景。请用中文简洁描述，控制在200字以内，直接输出脚本文字，不要加序号或标签。";
    const promptModel = p.modelPrompt || "一件儿童服装，{{SHOOTING_SCRIPT}}。保持衣服颜色、材质、图案细节不变。竖版高清全身照，专业儿童服装摄影，自然光线，温馨氛围。";
    const promptFlat = p.flatPrompt || "这件衣服的白色背景专业平铺展示图，服装平整展开，正面展示。保持衣服的颜色、材质、图案、细节完全不变。纯白色背景，专业电商产品摄影，高清，无阴影，无模特。";

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

    // ===== 步骤 1: 视觉模型 → 根据衣服照片直接生成拍摄脚本 =====
    console.log("Agnes 步骤1: 根据照片生成拍摄脚本...");
    const scriptRes = await fetch(`${AGNES_BASE}/chat/completions`, {
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
            { type: "text", text: promptShootingScript },
          ],
        }],
        max_tokens: 500,
      }),
    });

    const scriptData = await scriptRes.json();
    if (!scriptRes.ok) {
      console.error("Agnes 拍摄脚本错误:", scriptData);
      throw new Error(`Agnes 拍摄脚本生成失败: ${scriptData.error?.message || JSON.stringify(scriptData)}`);
    }

    const shootingScript = scriptData?.choices?.[0]?.message?.content || "";
    console.log("拍摄脚本:", shootingScript);

    if (!shootingScript) {
      throw new Error("Agnes 未返回拍摄脚本");
    }

    // ===== 步骤 2 & 3: 并行生成模特试穿图和白底平铺图（img2img，以原照片为参考） =====
    console.log("Agnes 步骤2&3: 并行生成图片（img2img）...");

    const randomSeed = Math.floor(Math.random() * 2147483647);

    const modelPrompt = promptModel
      .replace("{{SHOOTING_SCRIPT}}", shootingScript);

    const flatPrompt = promptFlat;

    // 构建 img2img 请求体（尝试传 image 参数以原图为参考）
    const modelBody = JSON.stringify({
      model: "agnes-image-2.0-flash",
      prompt: modelPrompt,
      size: "1024x1536",
      seed: randomSeed,
      image: product_photo_url,
    });
    const flatBody = JSON.stringify({
      model: "agnes-image-2.0-flash",
      prompt: flatPrompt,
      size: "1024x1024",
      image: product_photo_url,
    });

    const fetchHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGNES_API_KEY}`,
    };

    let [modelRes, flatRes] = await Promise.all([
      fetch(`${AGNES_BASE}/images/generations`, { method: "POST", headers: fetchHeaders, body: modelBody }),
      fetch(`${AGNES_BASE}/images/generations`, { method: "POST", headers: fetchHeaders, body: flatBody }),
    ]);

    // 如果 img2img 失败（422），回退到纯文本生成（不带 image 参数）
    if (modelRes.status === 422) {
      console.log("模特图 img2img 失败，回退到纯文本生成");
      modelRes = await fetch(`${AGNES_BASE}/images/generations`, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify({ model: "agnes-image-2.0-flash", prompt: modelPrompt, size: "1024x1536", seed: randomSeed }),
      });
    }
    if (flatRes.status === 422) {
      console.log("平铺图 img2img 失败，回退到纯文本生成");
      flatRes = await fetch(`${AGNES_BASE}/images/generations`, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify({ model: "agnes-image-2.0-flash", prompt: flatPrompt, size: "1024x1024" }),
      });
    }

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
      shooting_script: shootingScript,
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