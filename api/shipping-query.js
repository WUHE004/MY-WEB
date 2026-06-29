// Vercel Serverless Function - 快递100物流查询
// 访问路径: /api/shipping-query?tracking_number=XXX

const { createHash } = require("crypto");

const STATUS_MAP = {
  0: "in_transit", 1: "shipped", 2: "in_transit", 3: "delivered",
  4: "pending", 5: "in_transit", 6: "in_transit", 7: "in_transit",
  10: "in_transit", 11: "in_transit", 12: "in_transit", 13: "in_transit", 14: "in_transit",
};

const ERROR_CODES = {
  "400": "找不到对应公司，请检查快递单号是否正确",
  "408": "快递公司参数异常：验证码错误",
  "500": "查询无结果，请隔段时间再查",
  "501": "服务器错误",
  "502": "服务器繁忙",
  "503": "验证签名失败",
  "601": "key已过期，账号需要充值",
};

function md5(str) {
  return createHash("md5").update(str).digest("hex").toUpperCase();
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const trackingNumber = searchParams.get("tracking_number");

  if (!trackingNumber) {
    return res.status(400).json({ error: "请提供快递单号" });
  }

  const key = process.env.KUAIDI100_KEY;
  const customer = process.env.KUAIDI100_CUSTOMER;

  if (!key || !customer) {
    return res.status(500).json({ error: "快递100 API 未配置" });
  }

  try {
    const param = JSON.stringify({
      com: "",
      num: trackingNumber,
      phone: "",
      from: "",
      to: "",
      resultv2: "0",
      show: "0",
      order: "desc",
    });

    const sign = md5(param + key + customer);

    const response = await fetch("https://poll.kuaidi100.com/poll/query.do", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ customer, sign, param }).toString(),
    });

    const result = await response.json();

    if (result.status === "200" || result.returnCode === "200") {
      const stateCode = Number(result.state) || 0;
      return res.status(200).json({
        success: true,
        status: STATUS_MAP[stateCode] || "in_transit",
        stateCode,
        tracks: (result.data || []).map((item) => ({
          time: item.time || item.ftime || "",
          location: item.location || item.areaName || "",
          message: item.context || "",
        })),
      });
    }

    const code = result.returnCode || "未知";
    const msg = result.message || "";
    const desc = ERROR_CODES[code] || "";
    return res.status(500).json({
      success: false,
      error: `[${code}] ${desc || msg}`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || "物流查询异常",
    });
  }
};