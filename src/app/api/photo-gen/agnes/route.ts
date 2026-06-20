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
    const promptClothingDesc = p.clothingDesc || "请详细描述这件衣服的以下特征：1.材质和面料质感 2.颜色和图案细节 3.款式和版型 4.适合的穿着场景 5.建议的搭配风格。请用中文简洁描述，控制在200字以内。";
    const promptCreativeBrief = p.creativeBrief || "根据以下服装描述，为这件衣服设计一个专属的儿童模特拍摄创意方案，包括模特形象、搭配穿搭、场景和动作。要求：1. 根据衣服风格设计模特性别、发型、妆容、肤色 2. 设计配套的下装、鞋子、配饰 3. 选择一个最匹配衣服风格的日常生活场景 4. 设计一个自然小幅度动作。请用中文简洁描述，控制在150字以内，直接输出方案文字，不要加序号或标签。\n\n服装描述：{{CLOTHING_DESC}}";
    const promptModel = p.modelPrompt || "一个中国儿童模特穿着这件衣服，{{CREATIVE_BRIEF}}。严格保持衣服的颜色、材质、图案、细节完全不变。竖版构图，高清全身照，专业儿童服装摄影，自然光线，温馨氛围。";
    const promptFlat = p.flatPrompt || "这件衣服的白色背景专业平铺展示图，服装平整展开，正面展示。{{CLOTHING_DESC}}。保持衣服的颜色、材质、图案、细节完全不变。纯白色背景，专业电商产品摄影，高清，无阴影，无模特。";

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
            { type: "text", text: promptClothingDesc },
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

    // ===== 步骤 2: 基于服装描述生成专属创意方案（模特、穿搭、场景、动作） =====
    console.log("Agnes 步骤2: 生成专属创意方案...");
    const creativeRes = await fetch(`${AGNES_BASE}/chat/completions`, {
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
            { type: "text", text: promptCreativeBrief.replace("{{CLOTHING_DESC}}", clothingDesc) },
          ],
        }],
        max_tokens: 400,
      }),
    });

    const creativeData = await creativeRes.json();
    if (!creativeRes.ok) {
      console.error("Agnes 创意方案错误:", creativeData);
      throw new Error(`Agnes 创意方案生成失败: ${creativeData.error?.message || JSON.stringify(creativeData)}`);
    }

    const creativeBrief = creativeData?.choices?.[0]?.message?.content || "";
    console.log("创意方案:", creativeBrief);

    if (!creativeBrief) {
      throw new Error("Agnes 未返回创意方案");
    }

    // ===== 步骤 3 & 4: 并行生成模特试穿图和白底平铺图 =====
    console.log("Agnes 步骤3&4: 并行生成图片...");

    const randomSeed = Math.floor(Math.random() * 2147483647);

    const modelPrompt = promptModel
      .replace("{{CREATIVE_BRIEF}}", creativeBrief)
      .replace("{{CLOTHING_DESC}}", clothingDesc);

    const flatPrompt = promptFlat
      .replace("{{CLOTHING_DESC}}", clothingDesc)
      .replace("{{CREATIVE_BRIEF}}", creativeBrief);

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
          size: "1024x1536",
          seed: randomSeed,
          tags: ["img2img"],
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
          tags: ["img2img"],
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
      clothing_desc: clothingDesc,
      creative_brief: creativeBrief,
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