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

// 查询商品销量和退货量
async function getSalesStats(saleId: string) {
  const upperId = saleId.toUpperCase();

  const [salesRes, returnRes] = await Promise.all([
    supabase.from("sales_records").select("quantity, sell_price").eq("sale_id", saleId),
    supabase.from("return_records").select("quantity, size").eq("sale_id", saleId),
  ]);

  let soldTotal = 0;
  let sellPrice = 0;
  if (salesRes.data) {
    for (const row of salesRes.data) {
      soldTotal += Number(row.quantity) || 0;
      if (!sellPrice && Number(row.sell_price) > 0) {
        sellPrice = Number(row.sell_price);
      }
    }
  }

  let returnTotal = 0;
  if (returnRes.data) {
    for (const row of returnRes.data) {
      returnTotal += Number(row.quantity) || 0;
    }
  }

  return { soldTotal, returnTotal, sellPrice };
}

// 构建商品信息文本
function buildProductText(product: Record<string, unknown>, stats: { soldTotal: number; returnTotal: number; sellPrice: number }) {
  const saleId = (product.sale_id as string) || "";
  const manufacturer = (product.manufacturer as string) || "未知";
  const costPrice = Number(product.cost_price) || 0;
  const sellPrice = stats.sellPrice || 0;
  const profit = sellPrice - costPrice;
  const totalStock = Number(product.total_stock) || 0;
  const soldTotal = stats.soldTotal;
  const returnTotal = stats.returnTotal;
  const remaining = totalStock - soldTotal + returnTotal;
  const name = (product.name as string) || "";

  // 计算各尺码剩余库存
  // 先从入库记录获取各尺码初始库存，再减去售卖量
  const sizeStock: Record<string, number> = {};
  for (const s of SIZES) {
    const initial = Number(product[`size_${s}`]) || 0;
    sizeStock[`${s}`] = initial;
  }

  // 简单处理：用总库存和剩余比例估算各尺码剩余（无法精确追踪每个尺码的售卖）
  // 实际展示各尺码入库数量
  const sizeLines = SIZES.map((s) => {
    const qty = sizeStock[`${s}`] || 0;
    return qty > 0 ? `${s}:${qty}` : null;
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
    sizeLines || "无尺码数据",
  ];

  return lines.join("\n");
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

    // 竖版高清、生活化场景、多样动作全身照
    const modelPrompt = `一个3-6岁的中国儿童模特穿着这件衣服，展示服装效果。${clothingDesc}。保持衣服的颜色、材质、图案、细节完全不变。

拍摄要求：
- 竖版构图，高清全身照
- 自然柔和的户外光线
- 场景要生活化、自然：如公园草地、阳光街道、游乐场、花园、海滩等日常场景
- 儿童模特姿势自然多样：可以是奔跑、跳跃、蹲下玩耍、侧身回眸、坐着微笑、手拿玩具等，不要僵硬站立
- 配搭建议：根据衣服风格搭配适合的裤子/裙子、鞋子和配饰
- 整体氛围温馨可爱，像专业儿童服装品牌广告片`;

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
          size: "1024x1536", // 竖版 2:3 比例
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

    // ===== 步骤 4: 发送企业微信（先文本，再图片） =====
    const textSent = await sendTextToWechat(productText);
    // 文本和图片之间稍等一下，确保顺序
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