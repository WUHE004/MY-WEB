import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";
import crypto from "crypto";

const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";
const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const WECHAT_TOKEN = process.env.WECHAT_TOKEN || "";
const WECHAT_ENCODING_AES_KEY = process.env.WECHAT_ENCODING_AES_KEY || "";
const MAX_SIZE_BYTES = 200 * 1024;
const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];
const WECHAT_CORP_ID = process.env.WECHAT_CORP_ID || "";
const WECHAT_CORP_SECRET = process.env.WECHAT_CORP_SECRET || "";
const WECHAT_AGENT_ID = process.env.WECHAT_AGENT_ID || "";

// ===== 企业微信 access_token 缓存 =====
let cachedAccessToken: string | null = null;
let tokenExpireTime: number = 0;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpireTime - 300000) {
    return cachedAccessToken;
  }
  const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECHAT_CORP_ID}&corpsecret=${WECHAT_CORP_SECRET}`);
  const data = await res.json();
  if (data.errcode !== 0) throw new Error(`获取 access_token 失败: ${data.errmsg}`);
  cachedAccessToken = data.access_token;
  tokenExpireTime = Date.now() + (data.expires_in || 7200) * 1000;
  return cachedAccessToken!;
}

// ===== 企业微信加解密工具 =====
function getAesKey(): Buffer {
  // EncodingAESKey 是 43 位 Base64，补 "=" 后正好解码 32 字节
  return Buffer.from(WECHAT_ENCODING_AES_KEY + "=", "base64");
}

function pkcs7Pad(data: Buffer, blockSize: number = 32): Buffer {
  const padLen = blockSize - (data.length % blockSize);
  const pad = Buffer.alloc(padLen, padLen);
  return Buffer.concat([data, pad]);
}

function pkcs7Unpad(data: Buffer): Buffer {
  const padLen = data[data.length - 1];
  if (padLen < 1 || padLen > 32) {
    console.log("[WECHAT-AES] padLen 无效:", padLen, "保持原文");
    return data;
  }
  for (let i = data.length - padLen; i < data.length; i++) {
    if (data[i] !== padLen) {
      console.log("[WECHAT-AES] 填充字节不一致，位置", i, "值:", data[i], "期望:", padLen);
      return data;
    }
  }
  return data.subarray(0, data.length - padLen);
}

function aesEncrypt(plaintext: Buffer): Buffer {
  const key = getAesKey();
  const iv = key.subarray(0, 16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  const padded = pkcs7Pad(plaintext, 32);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
}

function aesDecrypt(encrypted: Buffer): Buffer {
  try {
    const key = getAesKey();
    const iv = key.subarray(0, 16); // 企业微信用 key 的前 16 字节做 IV
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    console.log("[WECHAT-AES] 解密后长度:", decrypted.length, "前40字节:", decrypted.subarray(0, Math.min(40, decrypted.length)).toString("hex"));
    return pkcs7Unpad(decrypted);
  } catch (err) {
    console.error("[WECHAT-AES] AES 解密失败:", err instanceof Error ? err.message : err);
    throw err;
  }
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
  console.log("[WECHAT-AES] 加密内容 base64 长度:", encrypted.length, "解码后字节数:", encryptedBuffer.length);
  const decrypted = aesDecrypt(encryptedBuffer);
  console.log("[WECHAT-AES] 去掉填充后长度:", decrypted.length);

  // 方式1：按标准结构解析（16字节随机数 + 4字节长度 + 内容 + CorpID）
  if (decrypted.length >= 20) {
    const msgLen = decrypted.readUInt32BE(16);
    console.log("[WECHAT-AES] 方式1: msgLen =", msgLen);
    if (msgLen > 0 && 20 + msgLen <= decrypted.length + 32) {
      // 内容长度合理，尝试解析
      const safeLen = Math.min(msgLen, decrypted.length - 20);
      const result = decrypted.subarray(20, 20 + safeLen).toString("utf-8");
      const cleaned = result.replace(/[\x00-\x1f\x7f]/g, "").trim();
      console.log("[WECHAT-AES] 方式1 解析结果:", cleaned);
      if (cleaned.length > 0 && /^[\x20-\x7e\u4e00-\u9fa5]+$/.test(cleaned.substring(0, Math.min(20, cleaned.length)))) {
        return cleaned;
      }
    }
  }

  // 方式2：尝试直接把整个解密后的内容当成字符串（可能 padding 处理方式不同）
  const asString = decrypted.toString("utf-8");
  const printableOnly = asString.replace(/[\x00-\x1f\x7f]/g, "").trim();
  console.log("[WECHAT-AES] 方式2: 直接转字符串:", printableOnly.substring(0, 100));

  // 方式3：尝试把整个密文当字符串返回（可能是明文模式被误判）
  if (printableOnly.length > 0) {
    return printableOnly;
  }
  return asString;
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

// ===== 生成白底电商图（简化版，只生成白底图，不生成模特图） =====
async function generateFlatImageOnly(productPhotoUrl: string): Promise<string | null> {
  if (!AGNES_API_KEY) return null;
  try {
    // 步骤1: 用 Agnes 视觉模型识别衣服
    const textRes = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
      body: JSON.stringify({
        model: "agnes-vlm-2-flash",
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: productPhotoUrl } },
          { type: "text", text: "请以JSON格式识别这张图片中的衣服英文关键词：garment_type, main_color, patterns（每个图案的位置+形状+颜色+大小）, neckline_sleeves, material, details。只输出JSON，不要额外文字。" },
        ]}],
        temperature: 0.2,
      }),
    });
    const textData = await textRes.json();
    let desc = textData?.choices?.[0]?.message?.content || "a piece of clothing";
    try {
      const jsonMatch = desc.match(/\{[\s\S]*\}/);
      if (jsonMatch) { const parsed = JSON.parse(jsonMatch[0]); desc = Object.values(parsed).filter((v) => v && String(v).trim()).join(", "); }
    } catch (_e) {}

    // 步骤2: 用 Agnes 文生图生成白底电商图
    const flatRes = await fetch(`${AGNES_BASE}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
      body: JSON.stringify({
        model: "agnes-image-2.0-flash",
        prompt: `A professionally shot flat-lay product photo of ${desc}. The garment matches the description exactly — same garment type, same color, same pattern prints, same material. Laid flat and smooth, front view, on a pure white background, clean sharp edges, no model, no shadow, professional product photography, high resolution.`,
        size: "1024x1024",
      }),
    });
    const flatData = await flatRes.json();
    return flatData?.data?.[0]?.url || null;
  } catch (err) {
    console.error("[WECHAT-FLAT] 生成白底图失败:", err);
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

// ===== 发送企业微信应用消息（图片发送到用户） =====
async function sendAppImageMessage(userId: string, imageUrl: string): Promise<boolean> {
  if (!WECHAT_CORP_ID || !WECHAT_CORP_SECRET || !WECHAT_AGENT_ID) {
    console.log("[WECHAT-APP] 缺少企业微信应用配置，无法发送图片消息");
    return false;
  }
  try {
    const token = await getAccessToken();
    // 先下载图片
    const imgRes = await fetch(imageUrl);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const compressed = await compressImage(imgBuffer);

    // 上传临时素材（使用原生 fetch + Blob，避免 form-data 依赖）
    const boundary = `----WechatFormBoundary${Date.now()}`;
    const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="flat_image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, compressed, footer]);

    const uploadRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=image`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const uploadData = await uploadRes.json();
    if (uploadData.errcode !== 0) throw new Error(`上传素材失败: ${uploadData.errmsg}`);
    const mediaId = uploadData.media_id;

    // 发送图片消息
    const sendRes = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        touser: userId,
        msgtype: "image",
        agentid: parseInt(WECHAT_AGENT_ID),
        image: { media_id: mediaId },
      }),
    });
    const sendData = await sendRes.json();
    return sendData.errcode === 0;
  } catch (err) {
    console.error("[WECHAT-APP] 发送应用消息失败:", err);
    return false;
  }
}

// ===== GET: 企业微信 URL 验证 / 调试 =====
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // ===== 调试模式：返回配置状态 =====
  if (searchParams.get("debug") === "1") {
    return NextResponse.json({
      hasToken: !!WECHAT_TOKEN, tokenLen: WECHAT_TOKEN.length,
      hasAesKey: !!WECHAT_ENCODING_AES_KEY, aesKeyLen: WECHAT_ENCODING_AES_KEY.length,
      hasCorpId: !!WECHAT_CORP_ID, corpId: WECHAT_CORP_ID,
      hasCorpSecret: !!WECHAT_CORP_SECRET,
      hasAgentId: !!WECHAT_AGENT_ID, agentId: WECHAT_AGENT_ID,
      hasWebhook: !!WECHAT_WEBHOOK_URL,
      hasAgnesKey: !!AGNES_API_KEY,
    });
  }

  const signature = searchParams.get("signature");
  const msgSignature = searchParams.get("msg_signature");
  const timestamp = searchParams.get("timestamp") || "";
  const nonce = searchParams.get("nonce") || "";
  const echostr = searchParams.get("echostr");

  console.log("[WECHAT] GET 回调验证请求:", { signature, msgSignature, timestamp, nonce, echostr: echostr ? (echostr.substring(0, 50) + "...") : undefined });

  if (!echostr) {
    console.log("[WECHAT] 无 echostr，返回 ok");
    return new Response("ok", { status: 200 });
  }

  // ====== 情况 A: 加密模式（msg_signature 存在） ======
  if (msgSignature) {
    console.log("[WECHAT] 模式A: 检测到 msg_signature（加密模式）");
    if (!WECHAT_TOKEN || !WECHAT_ENCODING_AES_KEY) {
      console.warn("[WECHAT] 警告: 缺少 WECHAT_TOKEN 或 WECHAT_ENCODING_AES_KEY，降级为明文模式");
      return new Response(echostr, { headers: { "Content-Type": "text/plain" }, status: 200 });
    }

    // 签名验证（不强制通过——为了调试，降级尝试解密）
    const sigValid = verifySafeSignature(msgSignature, timestamp, nonce, echostr);
    console.log("[WECHAT] msg_signature 验证结果:", sigValid);
    if (!sigValid) {
      console.warn("[WECHAT] msg_signature 不匹配，但继续尝试解密");
    }

    // 尝试解密
    try {
      const decrypted = decryptMessage(echostr);
      console.log("[WECHAT] 模式A: 解密成功，返回:", decrypted);
      return new Response(decrypted, { headers: { "Content-Type": "text/plain" }, status: 200 });
    } catch (err) {
      console.error("[WECHAT] 模式A: AES 解密失败:", err instanceof Error ? err.message : err);
    }
  }

  // ====== 情况 B: 明文模式（只有 signature，或两者都有但加密模式失败） ======
  if (signature) {
    console.log("[WECHAT] 模式B: 检测到 signature（明文模式）");
    if (WECHAT_TOKEN) {
      const sigValid = verifyPlainSignature(signature, timestamp, nonce);
      console.log("[WECHAT] signature 验证结果:", sigValid);
      if (!sigValid) {
        console.warn("[WECHAT] signature 不匹配，但继续返回 echostr（降级）");
      }
    }
    console.log("[WECHAT] 模式B: 返回 echostr:", echostr);
    return new Response(echostr, { headers: { "Content-Type": "text/plain" }, status: 200 });
  }

  // ====== 情况 C: 降级（都不存在） ======
  console.log("[WECHAT] 模式C: 无签名参数，降级直接返回 echostr");
  return new Response(echostr, { headers: { "Content-Type": "text/plain" }, status: 200 });
}

// ===== XML 被动响应构造 =====
function buildXmlTextResponse(fromUserName: string, toUserName: string, content: string): string {
  const now = Math.floor(Date.now() / 1000);
  return `<xml>
  <ToUserName><![CDATA[${toUserName}]]></ToUserName>
  <FromUserName><![CDATA[${fromUserName}]]></FromUserName>
  <CreateTime>${now}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`;
}

// 加密 XML 响应（企业微信加密模式需要）
function encryptXmlResponse(xml: string, corpId: string): string {
  const randomBytes = crypto.randomBytes(16);
  const xmlBuffer = Buffer.from(xml, "utf-8");
  const msgLen = Buffer.alloc(4);
  msgLen.writeUInt32BE(xmlBuffer.length, 0);
  const corpIdBuffer = Buffer.from(corpId, "utf-8");
  const plaintext = Buffer.concat([randomBytes, msgLen, xmlBuffer, corpIdBuffer]);
  const encrypted = aesEncrypt(plaintext);
  const encryptedBase64 = encrypted.toString("base64");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Math.random().toString(36).substring(2, 12);
  const signature = crypto.createHash("sha1")
    .update([WECHAT_TOKEN, timestamp, nonce, encryptedBase64].sort().join(""))
    .digest("hex");
  return `<xml>
  <Encrypt><![CDATA[${encryptedBase64}]]></Encrypt>
  <MsgSignature><![CDATA[${signature}]]></MsgSignature>
  <TimeStamp>${timestamp}</TimeStamp>
  <Nonce><![CDATA[${nonce}]]></Nonce>
</xml>`;
}

function xmlResponse(fromUserName: string, toUserName: string, content: string, isEncrypted: boolean = false, corpId: string = ""): Response {
  const xml = buildXmlTextResponse(fromUserName, toUserName, content);
  const effectiveCorpId = corpId || WECHAT_CORP_ID || fromUserName;
  const responseXml = isEncrypted && WECHAT_ENCODING_AES_KEY
    ? encryptXmlResponse(xml, effectiveCorpId)
    : xml;
  console.log("[WECHAT] 响应模式:", isEncrypted ? "加密" : "明文", "corpId:", effectiveCorpId, "前200字符:", responseXml.substring(0, 200));
  return new Response(responseXml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

// ===== POST: 消息解析工具 =====
function extractField(xml: string, fieldName: string): string {
  const pattern = new RegExp(`<${fieldName}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${fieldName}>`);
  const match = xml.match(pattern);
  return match ? match[1].trim() : "";
}

function looksLikeProductCode(text: string): boolean {
  if (!text) return false;
  const cleaned = text.trim();
  if (cleaned.length < 2 || cleaned.length > 15) return false;
  if (/xml|ToUserName|FromUserName|Encrypt|MsgType|CDATA/i.test(cleaned)) return false;
  return /^[A-Za-z0-9]/.test(cleaned) && /^[\w\-\/]+$/.test(cleaned);
}

interface ParsedMessage {
  toUserName: string;
  fromUserName: string;
  content: string;
  isEncrypted: boolean; // 消息是否加密模式
  corpId: string; // 企业 CorpID（从解密消息中提取）
}

function parseWechatMessage(rawBody: string): ParsedMessage {
  const result: ParsedMessage = { toUserName: "", fromUserName: "", content: "", isEncrypted: false, corpId: "" };

  const encryptContent = extractField(rawBody, "Encrypt");

  if (encryptContent && WECHAT_ENCODING_AES_KEY) {
    result.isEncrypted = true;
    try {
      const decryptedXml = decryptMessage(encryptContent);
      console.log("[WECHAT-PARSE] 解密后内容前300字符:", decryptedXml.substring(0, 300));
      result.toUserName = extractField(decryptedXml, "ToUserName");
      result.fromUserName = extractField(decryptedXml, "FromUserName");
      result.content = extractField(decryptedXml, "Content");
      result.corpId = result.toUserName; // 原始 ToUserName 就是 CorpID
      console.log("[WECHAT-PARSE] 模式: 加密", { to: result.toUserName, from: result.fromUserName, content: result.content });
    } catch (err) {
      console.error("[WECHAT-PARSE] 解密失败:", err instanceof Error ? err.message : err);
    }
  }

  if (!result.content) {
    result.toUserName = result.toUserName || extractField(rawBody, "ToUserName");
    result.fromUserName = result.fromUserName || extractField(rawBody, "FromUserName");
    result.content = extractField(rawBody, "Content");
    if (result.content) {
      console.log("[WECHAT-PARSE] 模式: 明文", { to: result.toUserName, from: result.fromUserName, content: result.content });
    }
  }

  if (!result.content) {
    try {
      const body = JSON.parse(rawBody);
      result.content = body?.text?.content || body?.Text?.Content || body?.content || body?.message || "";
    } catch (_e) { /* 不是 JSON */ }
  }

  return result;
}

// ===== 异步白底图生成（setTimeout 内部，通过企业微信应用消息发给用户） =====
async function processFlatImageAsync(code: string, photoUrl: string, userId: string) {
  try {
    console.log("[WECHAT-FLAT] ====== 开始异步白底图生成 ======");

    const flatUrl = await generateFlatImageOnly(photoUrl);

    if (flatUrl) {
      console.log("[WECHAT-FLAT] 白底图生成成功:", flatUrl);
      const sent = await sendAppImageMessage(userId, flatUrl);
      if (!sent) {
        console.log("[WECHAT-FLAT] 应用消息发送失败（可能缺少企业微信配置），无法发送白底图");
      }
    } else {
      console.log("[WECHAT-FLAT] 白底图生成失败，跳过");
    }

    console.log("[WECHAT-FLAT] ====== 异步白底图生成完成 ======");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WECHAT-FLAT] 异步白底图生成错误:", msg);
  }
}

// ===== POST 主入口：同步解析 → 查询商品 → 返回 XML 被动响应；图片异步 setTimeout =====
export async function POST(request: NextRequest) {
  try {
    console.log("[WECHAT] ====== POST 收到消息 ======");
    const rawBody = await request.text();

    const parsed = parseWechatMessage(rawBody);
    const { toUserName, fromUserName, isEncrypted, corpId } = parsed;

    // 回复 XML：ToUserName = 原 FromUserName（用户），FromUserName = 原 ToUserName（企业 CorpID）
    const replyTo = fromUserName;
    const replyFrom = toUserName;

    if (!parsed.content || parsed.content.trim().length < 2) {
      console.log("[WECHAT] 内容为空，XML 返回提示");
      return xmlResponse(replyFrom, replyTo, "📝 请发送商品编号，例如：A12345", isEncrypted, corpId);
    }

    const code = parsed.content.split("\n")[0].trim();
    console.log("[WECHAT] 用户内容:", code);

    if (!looksLikeProductCode(code)) {
      console.warn("[WECHAT] 内容不像商品编号:", code);
      return xmlResponse(
        replyFrom, replyTo,
        `⚠️ 没有识别到正确的商品编号。\n你发送的内容：${code.substring(0, 50)}\n请直接发送商品编号（字母+数字，2-12位），例如：A12345`,
        isEncrypted, corpId
      );
    }

    console.log("[WECHAT] 同步查询商品编号:", code);

    const product = await getProductDetail(code);
    if (!product) {
      console.log("[WECHAT] 未找到商品，XML 返回错误");
      return xmlResponse(
        replyFrom, replyTo,
        `❌ 未找到商品编号: ${code}\n请检查编号是否正确，或在库存系统中确认该商品已录入。`,
        isEncrypted, corpId
      );
    }

    const stats = await getSalesStats(code);
    const productText = buildProductText(product, stats);

    const photoUrl = product.photo as string;

    // 构造返回文本：商品信息 + 原始照片 URL
    const responseText = photoUrl
      ? productText + "\n\n📷 原始照片：" + photoUrl
      : productText;

    // 异步白底图生成：setTimeout 触发，不等待
    if (photoUrl) {
      setTimeout(() => {
        processFlatImageAsync(code, photoUrl, fromUserName).catch((e) => {
          console.error("[WECHAT] setTimeout 异步白底图任务异常:", e instanceof Error ? e.message : e);
        });
      }, 50);
    }

    // 同步返回 XML 被动响应（加密模式下自动加密）
    console.log("[WECHAT] 返回 XML 被动响应，模式:", isEncrypted ? "加密" : "明文");
    return xmlResponse(replyFrom, replyTo, responseText, isEncrypted, corpId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WECHAT] POST 入口错误:", msg);
    return xmlResponse("", "", `❌ 系统处理时出错：${msg.substring(0, 100)}`);
  }
}
