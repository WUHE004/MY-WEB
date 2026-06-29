// 快递100 API 集成
// 环境变量：
// KUAIDI100_KEY      - 快递100的key（32位hex字符串）
// KUAIDI100_CUSTOMER  - 快递100的customer（授权码，较短字符串）

import { createHash } from "crypto";

interface TrackingInfo {
  time: string;
  location: string;
  message: string;
}

interface TrackingResult {
  success: boolean;
  status: string;
  stateCode: number;
  tracks: TrackingInfo[];
  error?: string;
  rawResponse?: string; // 调试用：原始响应
}

// 快递100状态码映射
const STATUS_MAP: Record<number, string> = {
  0: "in_transit",
  1: "shipped",
  2: "in_transit",
  3: "delivered",
  4: "pending",
  5: "in_transit",
  6: "in_transit",
  7: "in_transit",
  10: "in_transit",
  11: "in_transit",
  12: "in_transit",
  13: "in_transit",
  14: "in_transit",
};

// 快递100错误码说明
const ERROR_CODES: Record<string, string> = {
  "400": "找不到对应公司，请检查快递单号是否正确",
  "408": "快递公司参数异常：验证码错误",
  "500": "查询无结果，请隔段时间再查",
  "501": "服务器错误",
  "502": "服务器繁忙",
  "503": "验证签名失败，请检查KEY和CUSTOMER是否正确",
  "601": "key已过期，账号需要充值",
};

function md5(str: string): string {
  return createHash("md5").update(str).digest("hex").toUpperCase();
}

/**
 * 查询物流信息
 * @param trackingNumber 快递单号
 */
export async function queryTracking(trackingNumber: string): Promise<TrackingResult> {
  const key = process.env.KUAIDI100_KEY;
  const customer = process.env.KUAIDI100_CUSTOMER;

  if (!key || !customer) {
    console.log("[Kuaidi100] 未配置API密钥");
    return {
      success: false,
      status: "pending",
      stateCode: 0,
      tracks: [],
      error: "快递100 API 未配置",
    };
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

    // 签名 = MD5(param + key + customer)，32位大写
    const sign = md5(param + key + customer);

    console.log("[Kuaidi100] 请求参数:", { customer, sign: sign.substring(0, 8) + "...", param });

    const response = await fetch("https://poll.kuaidi100.com/poll/query.do", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer,
        sign,
        param,
      }),
    });

    const result = await response.json();
    console.log("[Kuaidi100] 原始响应:", JSON.stringify(result));

    if (result.status === "200" || result.returnCode === "200") {
      const stateCode = Number(result.state) || 0;
      const status = STATUS_MAP[stateCode] || "in_transit";

      return {
        success: true,
        status,
        stateCode,
        tracks: (result.data || []).map((item: Record<string, string>) => ({
          time: item.time || item.ftime || "",
          location: item.location || item.areaName || "",
          message: item.context || "",
        })),
      };
    } else {
      const code = result.returnCode || "未知";
      const msg = result.message || "";
      const desc = ERROR_CODES[code] || "";
      return {
        success: false,
        status: "pending",
        stateCode: 0,
        tracks: [],
        error: `[${code}] ${desc || msg}`,
        rawResponse: JSON.stringify(result),
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "物流查询异常";
    console.error("[Kuaidi100] 查询失败:", msg);
    return {
      success: false,
      status: "pending",
      stateCode: 0,
      tracks: [],
      error: msg,
    };
  }
}

export function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    pending: "未发货",
    shipped: "已发货",
    in_transit: "运输中",
    delivered: "已签收",
    cancelled: "已取消",
  };
  return texts[status] || "未知";
}