import { NextRequest, NextResponse } from "next/server";

const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";

// POST /api/payment/upload-screenshot - 上传支付截图到企业微信群
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const orderId = formData.get("order_id") as string;
    const paymentMethod = formData.get("payment_method") as string;

    if (!file) {
      return NextResponse.json({ error: "请上传支付截图" }, { status: 400 });
    }

    if (!WECHAT_WEBHOOK_URL) {
      console.warn("[PAYMENT-SCREENSHOT] 未配置企业微信 Webhook，跳过发送");
      return NextResponse.json({ success: true, message: "已确认（未配置企业微信通知）" });
    }

    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 压缩图片（如果 > 200KB）
    let finalBuffer: Buffer = buffer;
    if (buffer.length > 200 * 1024) {
      try {
        const sharp = (await import("sharp")).default;
        const compressed: Buffer = await sharp(buffer)
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();
        finalBuffer = compressed;
      } catch {
        // sharp 不可用时使用原图
        finalBuffer = buffer;
      }
    }

    const base64 = finalBuffer.toString("base64");
    const crypto = await import("crypto");
    const md5 = crypto.createHash("md5").update(finalBuffer).digest("hex");

    // 先发送文本通知
    const methodLabel = paymentMethod === "wechat" ? "微信支付" : paymentMethod === "alipay" ? "支付宝" : "未知";
    await fetch(WECHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "text",
        text: {
          content: `💰 新支付确认\n订单号: #${orderId}\n支付方式: ${methodLabel}\n请核对下方支付截图`,
        },
      }),
    });

    // 发送图片
    const imgRes = await fetch(WECHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "image", image: { base64, md5 } }),
    });
    const imgData = await imgRes.json();

    if (imgData?.errcode !== 0) {
      console.error("[PAYMENT-SCREENSHOT] 发送图片失败:", imgData);
      return NextResponse.json({ error: "截图发送失败，请重试" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "支付截图已发送" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PAYMENT-SCREENSHOT] 处理失败:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}