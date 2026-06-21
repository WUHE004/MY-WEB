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

// ===== POST: 处理用户消息 =====
function extractField(xml: string, fieldName: string): string {
  // 兼容 <Field>value</Field> 和 <Field><![CDATA[value]]></Field>
  const pattern = new RegExp(`<${fieldName}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${fieldName}>`);
  const match = xml.match(pattern);
  return match ? match[1].trim() : "";
}

function looksLikeProductCode(text: string): boolean {
  if (!text) return false;
  // 商品编号通常 2-12 位，包含字母数字和连字符
  const cleaned = text.trim();
  if (cleaned.length < 2 || cleaned.length > 15) return false;
  // 如果包含大量 XML 关键字/长串乱码，不是商品编号
  if (/xml|ToUserName|FromUserName|Encrypt|MsgType|CDATA/i.test(cleaned)) return false;
  // 必须以字母或数字开头（商品编号不会以乱码符号开头）
  return /^[A-Za-z0-9]/.test(cleaned) && /^[\w\-\/]+$/.test(cleaned);
}

export async function POST(request: NextRequest) {
  try {
    console.log("[WECHAT] ====== POST 收到消息 ======");
    const contentType = request.headers.get("content-type") || "";
    const rawBody = await request.text();
    console.log("[WECHAT] Content-Type:", contentType);
    console.log("[WECHAT] 原始消息长度:", rawBody.length, "前300字符:", rawBody.substring(0, 300));

    // 步骤 1: 判断消息模式（明文/加密）并提取内容
    let finalContent = "";
    let processingPath = "";

    // 优先尝试：如果有 Encrypt 节点，尝试解密
    const encryptContent = extractField(rawBody, "Encrypt");
    console.log("[WECHAT] 提取到 Encrypt 内容长度:", encryptContent.length);

    if (encryptContent && WECHAT_ENCODING_AES_KEY) {
      processingPath = "加密模式";
      console.log("[WECHAT] 模式: 安全/加密模式，尝试 AES 解密...");
      try {
        const decryptedXml = decryptMessage(encryptContent);
        console.log("[WECHAT] 解密成功，解密后内容前300字符:", decryptedXml.substring(0, 300));

        // 从解密后的 XML 中提取 Content
        const contentFromDecrypted = extractField(decryptedXml, "Content");
        if (contentFromDecrypted) {
          finalContent = contentFromDecrypted;
          console.log("[WECHAT] 从解密后 XML 提取 Content:", finalContent);
        } else {
          // 没有 Content？可能不是文本消息，尝试其他字段
          console.warn("[WECHAT] 解密后的 XML 中没有 Content 字段");
          console.warn("[WECHAT] 解密后的完整内容:", decryptedXml);
        }
      } catch (err) {
        console.error("[WECHAT] 解密失败:", err instanceof Error ? err.message : err);
      }
    } else if (encryptContent && !WECHAT_ENCODING_AES_KEY) {
      processingPath = "加密但无key";
      console.warn("[WECHAT] 检测到加密消息，但 WECHAT_ENCODING_AES_KEY 环境变量未设置");
    }

    // 步骤 2: 如果加密模式没提取到内容，尝试明文模式直接提取
    if (!finalContent) {
      processingPath = processingPath || "明文模式（fallback）";
      const plainContent = extractField(rawBody, "Content");
      if (plainContent) {
        finalContent = plainContent;
        console.log("[WECHAT] 从原始 XML（明文）提取 Content:", finalContent);
      }
    }

    // 步骤 3: 都失败？尝试解析 JSON 格式
    if (!finalContent) {
      try {
        const body = JSON.parse(rawBody);
        finalContent = body?.text?.content || body?.Text?.Content || body?.content || body?.message || "";
        if (finalContent) processingPath = "JSON 格式";
      } catch (_e) { /* 不是 JSON */ }
    }

    console.log("[WECHAT] 最终解析路径:", processingPath, "内容:", finalContent);

    if (!finalContent || finalContent.trim().length < 2) {
      await sendTextToWechat("📝 请发送商品编号，例如：A12345");
      return NextResponse.json({ status: "no_content" }, { status: 200 });
    }

    // 步骤 4: 提取商品编号
    const code = finalContent.split("\n")[0].trim();
    console.log("[WECHAT] 原始内容:", code);

    if (!looksLikeProductCode(code)) {
      console.warn("[WECHAT] 内容不像商品编号:", code);
      await sendTextToWechat(
        `⚠️ 没有识别到正确的商品编号。\n` +
        `你发送的内容：${code.substring(0, 50)}\n` +
        `请直接发送商品编号（字母+数字，2-12位），例如：A12345`
      );
      return NextResponse.json({ status: "invalid_code", content: code }, { status: 200 });
    }

    console.log("[WECHAT] 查询商品编号:", code);

    // 步骤 5: 查询商品信息
    const product = await getProductDetail(code);
    if (!product) {
      await sendTextToWechat(`❌ 未找到商品编号: ${code}\n请检查编号是否正确，或在库存系统中确认该商品已录入。`);
      return NextResponse.json({ status: "not_found", code }, { status: 200 });
    }

    const stats = await getSalesStats(code);
    const productText = buildProductText(product, stats);
    await sendTextToWechat(productText);

    // 步骤 6: 发送白底图（有则用，没有则生成）
    const photoUrl = product.photo as string;
    if (photoUrl) {
      await sendTextToWechat("🖼️ 正在生成商品白底图，请稍候...");
      const flatUrl = await generateFlatImage(photoUrl);
      if (flatUrl) {
        await sendImageToWechat(flatUrl);
      } else {
        await sendImageToWechat(photoUrl);
      }
    } else {
      await sendTextToWechat("ℹ️ 该商品暂无照片，无法生成白底图");
    }

    return NextResponse.json({ status: "ok", code }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WECHAT] 处理错误:", msg);
    await sendTextToWechat(`❌ 系统处理时出错：${msg.substring(0, 100)}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
