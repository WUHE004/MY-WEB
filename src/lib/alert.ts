/**
 * 企业微信机器人告警通知
 * 用于 Cron Job 失败等关键错误通知
 */

export async function sendAlert(message: string): Promise<void> {
  const webhookUrl = process.env.WECHAT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[alert] WECHAT_WEBHOOK_URL 未配置，跳过告警通知");
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "text",
        text: {
          content: `[库存管理系统告警]\n时间: ${new Date().toISOString()}\n${message}`,
        },
      }),
    });
  } catch (err) {
    console.error("[alert] 发送企业微信告警失败:", err);
  }
}
