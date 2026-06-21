import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";
import crypto from "crypto";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";
const WECHAT_TOKEN = process.env.WECHAT_TOKEN || "";
const WECHAT_ENCODING_AES_KEY = process.env.WECHAT_ENCODING_AES_KEY || "";
const MAX_SIZE_BYTES = 200 * 1024;
const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

// ===== 企业微信加解密工具 =====
function getAesKey(): Buffer {
  // EncodingAESKey 是 43 位 Base64，补 "=" 后正好解码 32 字节
  return Buffer.from(WECHAT_ENCODING_AES_KEY + "=", "base64");
}

function pkcs7Unpad(data: Buffer): Buffer {
  const padLen = data[data.length - 1];
  if (padLen < 1 || padLen > 32) return data;
  // 验证填充是否正确
  for (let i = data.length - padLen; i < data.length; i++) {
    if (data[i] !== padLen) return data;
  }
  return data.subarray(0, data.length - padLen);
}

function aesDecrypt(encrypted: Buffer): Buffer {
  const key = getAesKey();
  const iv = key.subarray(0, 16); // 企业微信用 key 的前 16 字节做 IV
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return pkcs7Unpad(decrypted);
}

// 明文模式签名: SHA1(sort(token, timestamp, nonce))
function verifyPlainSignature(signature: string, timestamp: string, nonce: string): boolean {
  const sorted = [WECHAT_TOKEN, timestamp, nonce].sort().join("");
  const sha1 = crypto.createHash("sha1").update(sorted).digest("hex");
  return sha1 === signature;
}

// 安全模式签名: SHA1(sort(token, timestamp, nonce, encryptedMsg))
function verifySafeSignature(msgSignature: string, timestamp: string, nonce: string, encrypted: string): boolean {
  const sorted = [WECHAT_TOKEN, timestamp, nonce, encrypted].sort().join("");
  const sha1 = crypto.createHash("sha1").update(sorted).digest("hex");
  return sha1 === msgSignature;
}

// 解密：16字节随机数 + 4字节消息长度(大端) + 消息内容 + CorpID
function decryptMessage(encrypted: string): string {
  const encryptedBuffer = Buffer.from(encrypted, "base64");
  const decrypted = aesDecrypt(encryptedBuffer);
  const msgLen = decrypted.readUInt32BE(16);
  return decrypted.subarray(20, 20 + msgLen).toString("utf-8");
}

// ===== 图片工具 =====
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
  return crypto.createHash("md5").update(buffer).digest("hex");
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

// ===== 生成白底平铺图 =====
async function generateFlatImage(productPhotoUrl: string): Promise<string | null> {
  if (!AGNES_API_KEY) return null;
  try {
    const textRes = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
      body: JSON.stringify({
        model: "agnes-2.0-flash",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: productPhotoUrl } },
            { type: "text", text: "请以英文关键词精确描述这件衣服：garment_type（如t-shirt、hoodie、dress、polo、shirt、jacket），main_color，patterns（位置+形状+颜色+大小的每个图案），neckline_sleeves，material，details。示例：{\"garment_type\":\"round neck short-sleeve cotton t-shirt\",\"main_color\":\"pure white\",\"patterns\":\"blue uppercase word printed on chest, red cartoon character below the text\",\"neckline_sleeves\":\"round neck, short sleeves\",\"material\":\"270gsm cotton fabric\",\"details\":\"ribbed collar, straight hem\"}。只输出JSON。" },
          ],
        }],
        max_tokens: 500,
        temperature: 0.2,
      }),
    });

    const textData = await textRes.json();
    let desc = textData?.choices?.[0]?.message?.content || "a piece of clothing";
    try {
      const jsonMatch = desc.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        desc = Object.values(parsed).filter((v) => v && String(v).trim()).join(", ");
      }
    } catch (_e) { /* 保持原文本 */ }

    const flatRes = await fetch(`${AGNES_BASE}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
      body: JSON.stringify({
        model: "agnes-image-2.0-flash",
        prompt: `A professionally shot flat-lay product photo of ${desc}. Laid flat and smooth, front view, on a pure white background, clean sharp edges, no model, no shadow, professional product photography, high resolution.`,
        size: "1024x1024",
      }),
    });

    const flatData = await flatRes.json();
    return flatData?.data?.[0]?.url || null;
  } catch (err) {
    console.error("生成白底图失败:", err);
    return null;
  }
}

// ===== 发送企业微信 =====
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

// ===== GET: 企业微信 URL 验证 =====
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const signature = searchParams.get("signature");
  const msgSignature = searchParams.get("msg_signature");
  const timestamp = searchParams.get("timestamp") || "";
  const nonce = searchParams.get("nonce") || "";
  const echostr = searchParams.get("echostr");

  console.log("[WECHAT] GET 回调验证请求:", { signature, msgSignature, timestamp, nonce, echostr });

  if (!echostr) {
    console.log("[WECHAT] 无 echostr，返回 ok");
    return new Response("ok", { status: 200 });
  }

  // 情况 1: 明文模式 — signature = SHA1(sort(token, timestamp, nonce))，返回 echostr
  if (signature && !msgSignature) {
    console.log("[WECHAT] 检测到明文模式，验证 signature...");
    if (WECHAT_TOKEN && !verifyPlainSignature(signature, timestamp, nonce)) {
      console.error("[WECHAT] 明文模式签名验证失败");
      return new Response("signature verification failed", { status: 403 });
    }
    console.log("[WECHAT] 明文模式验证成功，返回 echostr:", echostr);
    return new Response(echostr, { headers: { "Content-Type": "text/plain" }, status: 200 });
  }

  // 情况 2: 安全模式 — msg_signature = SHA1(sort(token, timestamp, nonce, echostr))，需 AES 解密
  if (msgSignature && echostr) {
    console.log("[WECHAT] 检测到安全模式（msg_signature）...");
    if (!WECHAT_TOKEN || !WECHAT_ENCODING_AES_KEY) {
      console.error("[WECHAT] 缺少 WECHAT_TOKEN 或 WECHAT_ENCODING_AES_KEY 环境变量");
      return new Response("config error: missing token or encoding aes key", { status: 500 });
    }
    if (!verifySafeSignature(msgSignature, timestamp, nonce, echostr)) {
      console.error("[WECHAT] 安全模式签名验证失败");
      return new Response("signature verification failed", { status: 403 });
    }
    try {
      const decrypted = decryptMessage(echostr);
      console.log("[WECHAT] 安全模式解密成功，返回:", decrypted);
      return new Response(decrypted, { headers: { "Content-Type": "text/plain" }, status: 200 });
    } catch (err) {
      console.error("[WECHAT] 安全模式 AES 解密失败:", err);
      return new Response("decrypt failed", { status: 500 });
    }
  }

  // 降级：没有任何签名参数，仍然返回 echostr
  console.log("[WECHAT] 降级：直接返回 echostr");
  return new Response(echostr, { headers: { "Content-Type": "text/plain" }, status: 200 });
}

// ===== POST: 处理用户消息 =====
export async function POST(request: NextRequest) {
  try {
    console.log("[WECHAT] POST 收到消息");
    let content = "";

    const contentType = request.headers.get("content-type") || "";
    const rawBody = await request.text();

    // 优先尝试解析 XML（企业微信标准格式）
    let xmlContent = rawBody;

    // 如果是安全模式，Encrypt 节点需要解密
    if (xmlContent.includes("<Encrypt>")) {
      const encryptMatch = xmlContent.match(/<Encrypt>([^<]*)<\/Encrypt>/);
      if (encryptMatch && WECHAT_TOKEN && WECHAT_ENCODING_AES_KEY) {
        try {
          const encrypted = encryptMatch[1];
          console.log("[WECHAT] 安全模式 POST，解密 Encrypt...");
          const decryptedXml = decryptMessage(encrypted);
          console.log("[WECHAT] 解密后 XML:", decryptedXml.substring(0, 200));
          xmlContent = decryptedXml;
        } catch (err) {
          console.error("[WECHAT] POST 消息解密失败:", err);
        }
      }
    }

    // 从 XML 中提取内容
    const contentMatch = xmlContent.match(/<Content><!\[CDATA\[(.*?)\]\]><\/Content>/);
    if (contentMatch) {
      content = contentMatch[1];
    } else {
      // 尝试 JSON 解析
      try {
        const body = JSON.parse(rawBody);
        content = body?.text?.content || body?.Text?.Content || body?.content || body?.message || "";
      } catch (_e) {
        content = xmlContent.trim();
      }
    }

    console.log("[WECHAT] 解析出用户消息:", content);

    if (!content || content.trim().length < 2) {
      return NextResponse.json({ status: "no_content" }, { status: 200 });
    }

    const code = content.split("\n")[0].trim().replace(/[^\w\-]/g, "");
    if (!code || code.length < 2) {
      return NextResponse.json({ status: "no_code" }, { status: 200 });
    }
    console.log("[WECHAT] 查询商品编号:", code);

    const product = await getProductDetail(code);
    if (!product) {
      await sendTextToWechat(`未找到商品编号: ${code}`);
      return NextResponse.json({ status: "not_found" }, { status: 200 });
    }

    const stats = await getSalesStats(code);
    const productText = buildProductText(product, stats);
    await sendTextToWechat(productText);

    const photoUrl = product.photo as string;
    if (photoUrl) {
      const flatUrl = await generateFlatImage(photoUrl);
      if (flatUrl) {
        await sendImageToWechat(flatUrl);
      } else {
        await sendImageToWechat(photoUrl);
      }
    }

    return NextResponse.json({ status: "ok", code }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WECHAT] 处理错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
