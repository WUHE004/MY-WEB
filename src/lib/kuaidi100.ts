// 快递100 API 集成
// 需要在环境变量中配置：
// KUAIDI100_KEY
// KUAIDI100_CUSTOMER

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

function md5(str: string): string {
  return createHash("md5").update(str).digest("hex").toLowerCase();
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
      com: "auto",
      num: trackingNumber,
    });

    // 签名 = MD5(param + key + customer)，32位小写
    const sign = md5(param + key + customer);

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
      return {
        success: false,
        status: "pending",
        stateCode: 0,
        tracks: [],
        error: result.message || "查询失败",
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