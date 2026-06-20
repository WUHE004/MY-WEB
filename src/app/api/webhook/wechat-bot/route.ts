import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";
const WECHAT_TOKEN = process.env.WECHAT_TOKEN || "";
const MAX_SIZE_BYTES = 200 * 1024;
const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// 验证企业微信签名
async function verifySignature(request: NextRequest): Promise<boolean> {
  if (!WECHAT_TOKEN) return true;
  
  const { searchParams } = new URL(request.url);
  const signature = searchParams.get("signature");
  const timestamp = searchParams.get("timestamp");
  const nonce = searchParams.get("nonce");
  
  if (!signature || !timestamp || !nonce) return false;
  
  const crypto = await import("crypto");
  const sorted = [WECHAT_TOKEN, timestamp, nonce].sort().join("");
  const sha1 = crypto.createHash("sha1").update(sorted).digest("hex");
  
  return sha1 === signature;
}

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
  return Buffer.from(buffer);
}

// MD5
async function computeMd5(buffer: Buffer): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("md5").update(buffer).digest("hex");
}

// 查询商品详情
async function getProductDetail(saleId: string) {
  const { data, error } = await supabase
    .from("inbound_records")
    .select("*")
    .eq("sale_id", saleId.toUpperCase())
    .maybeSingle();
  if (error) console.error("查询商品详情失败:", error.message);
  return data || null;
}

// 查询商品销量和退货量
async function getSalesStats(saleId: string) {
  const [salesRes, returnRes] = await Promise.all([
    supabase.from("sales_records").select("quantity, sell_price, size").eq("sale_id", saleId.toUpperCase()),
    supabase.from("return_records").select("quantity, size").eq("sale_id", saleId.toUpperCase()),
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

// 生成白底平铺图 (Agnes)
async function generateFlatImage(productPhotoUrl: string): Promise<string | null> {
  if (!AGNES_API_KEY) {
    console.log("Agnes API Key 未配置，无法生成白底图");
    return null;
  }

  try {
    // 步骤1: 分析服装
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
            { type: "image_url", image_url: { url: productPhotoUrl } },
            { type: "text", text: "请简要描述这件衣服的颜色、材质、图案和款式，控制在100字以内。" },
          ],
        }],
        max_tokens: 300,
      }),
    });

    const textData = await textRes.json();
    const clothingDesc = textData?.choices?.[0]?.message?.content || "一件服装";

    // 步骤2: 生成白底平铺图
    const flatRes = await fetch(`${AGNES_BASE}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGNES_API_KEY}`,
      },
      body: JSON.stringify({
        model: "agnes-image-2.0-flash",
        prompt: `这件衣服的白色背景专业平铺展示图，服装平整展开，正面展示。${clothingDesc}。保持衣服的颜色、材质、图案、细节完全不变。纯白色背景，专业电商产品摄影，高清，无阴影，无模特。`,
        size: "1024x1024",
        tags: ["img2img"],
        extra_body: { image: [productPhotoUrl] },
      }),
    });

    const flatData = await flatRes.json();
    return flatData?.data?.[0]?.url || null;
  } catch (err) {
    console.error("生成白底图失败:", err);
    return null;
  }
}

// 发送文本到企业微信
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
    console.error("发送文本失败:", err);
    return false;
  }
}

// 发送图片到企业微信
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
    console.error("发送图片失败:", err);
    return false;
  }
}

// GET: URL 验证（企业微信配置回调时会发送 GET 请求）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const signature = searchParams.get("signature");
  const timestamp = searchParams.get("timestamp");
  const nonce = searchParams.get("nonce");
  const echostr = searchParams.get("echostr");
  
  if (signature && timestamp && nonce && WECHAT_TOKEN) {
    const crypto = await import("crypto");
    const sorted = [WECHAT_TOKEN, timestamp, nonce].sort().join("");
    const sha1 = crypto.createHash("sha1").update(sorted).digest("hex");
    if (sha1 !== signature) {
      return NextResponse.json({ error: "签名验证失败" }, { status: 403 });
    }
  }
  
  if (echostr) {
    return new NextResponse(echostr, { status: 200 });
  }
  return NextResponse.json({ status: "ok" });
}

// POST: 接收消息
export async function POST(request: NextRequest) {
  try {
    let content = "";

    // 尝试解析 JSON 格式
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("json")) {
      const body = await request.json();
      // 提取文本内容（支持多种格式）
      content = body?.text?.content
        || body?.Text?.Content
        || body?.content
        || body?.message
        || "";
    } else {
      // 尝试解析 XML 格式
      const text = await request.text();
      const contentMatch = text.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/);
      if (contentMatch) {
        content = contentMatch[1];
      } else {
        // 纯文本
        content = text.trim();
      }
    }

    console.log("收到企业微信消息:", content);

    if (!content) {
      return NextResponse.json({ status: "no_content" }, { status: 200 });
    }

    // 提取商品编号（取第一行，去除前后空格和特殊字符）
    const code = content.split("\n")[0].trim().replace(/[^\w\-]/g, "");
    if (!code || code.length < 2) {
      return NextResponse.json({ status: "no_code" }, { status: 200 });
    }

    console.log("尝试查询商品编号:", code);

    // 查询商品（不区分大小写）
    const product = await getProductDetail(code);
    if (!product) {
      await sendTextToWechat(`未找到商品编号: ${code}`);
      return NextResponse.json({ status: "not_found" }, { status: 200 });
    }

    const stats = await getSalesStats(code);
    const productText = buildProductText(product, stats);

    // 发送商品信息文本
    await sendTextToWechat(productText);

    // 获取商品照片并生成白底图
    const photoUrl = product.photo as string;
    if (photoUrl) {
      // 尝试生成白底平铺图
      const flatUrl = await generateFlatImage(photoUrl);
      if (flatUrl) {
        await sendImageToWechat(flatUrl);
      } else {
        // 如果生成失败，发送原图
        await sendImageToWechat(photoUrl);
      }
    }

    return NextResponse.json({ status: "ok", code }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("企业微信机器人处理错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}