import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";

// ===== 企业微信发送视频 =====
async function sendVideoToWechat(videoUrl: string): Promise<boolean> {
  if (!WECHAT_WEBHOOK_URL) return false;
  try {
    // 企业微信 webhook 不直接支持发送视频，改用文本+链接
    const textMsg = `✨ 视频生成完成！\n点击查看：${videoUrl}`;
    const res = await fetch(WECHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content: textMsg } }),
    });
    const data = await res.json();
    return data?.errcode === 0;
  } catch (err) {
    console.error("企业微信 视频通知 发送失败:", err);
    return false;
  }
}

// ===== 下载远程图片并转为 Base64 =====
async function urlToBase64DataUri(url: string): Promise<string> {
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  const base64 = buffer.toString("base64");
  return `data:${contentType};base64,${base64}`;
}

// ===== 轮询等待视频生成完成 =====
async function pollVideoResult(taskId: string, maxWaitMs: number = 300000): Promise<string | null> {
  const startTime = Date.now();
  const interval = 5000; // 每5秒轮询一次

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`${AGNES_BASE}/videos/results/${taskId}`, {
        headers: {
          Authorization: `Bearer ${AGNES_API_KEY}`,
        },
      });
      const data = await res.json();

      if (data.status === "completed" && data.video_url) {
        console.log("[Agnes] 视频生成完成:", data.video_url);
        return data.video_url;
      }

      if (data.status === "failed") {
        console.error("[Agnes] 视频生成失败:", data.error);
        throw new Error(data.error || "视频生成失败");
      }

      console.log(`[Agnes] 等待视频生成... status: ${data.status}`);
    } catch (err) {
      console.error("[Agnes] 轮询错误:", err);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  console.error("[Agnes] 视频生成超时");
  throw new Error("视频生成超时，请稍后重试");
}

// ===== 调用 Agnes 视频生成 API =====
async function generateVideoWithAgnes(photoUrl: string, prompt: string): Promise<string | null> {
  if (!AGNES_API_KEY) {
    throw new Error("Agnes API Key 未配置 (AGNES_API_KEY)");
  }

  console.log("[Agnes] 下载照片...");
  const photoBase64 = await urlToBase64DataUri(photoUrl);

  console.log("[Agnes] 调用视频生成 API...");
  
  // 尝试使用 Agnes 视频生成 API
  // 注意：具体的 API 端点可能需要根据 Agnes 实际文档调整
  const res = await fetch(`${AGNES_BASE}/videos/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGNES_API_KEY}`,
    },
    body: JSON.stringify({
      model: "agnes-video-1.0", // 或 "agnes-video-1.0-t2v" 根据实际模型名
      input: {
        image: photoBase64,
        prompt: prompt,
      },
      parameters: {
        duration: 5, // 5秒视频
        resolution: "1080p", // 最高质量
        fps: 30,
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("[Agnes] API 错误:", JSON.stringify(data));
    throw new Error(data.message || data.error || "Agnes API 调用失败");
  }

  // 如果是异步任务，返回 task_id 进行轮询
  if (data.task_id) {
    console.log("[Agnes] 任务ID:", data.task_id);
    return await pollVideoResult(data.task_id);
  }

  // 如果直接返回视频 URL
  if (data.video_url) {
    console.log("[Agnes] 视频生成成功:", data.video_url);
    return data.video_url;
  }

  console.error("[Agnes] 未知响应格式:", JSON.stringify(data));
  throw new Error("Agnes 返回格式异常");
}

// ===== POST 主入口 =====
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { photo_url, prompt, member_id } = body;

    if (!photo_url) {
      return NextResponse.json({ error: "缺少 photo_url" }, { status: 400 });
    }

    if (!prompt || prompt.trim() === "") {
      return NextResponse.json({ error: "缺少 prompt" }, { status: 400 });
    }

    console.log("[视频生成] 开始生成...");
    console.log("[视频生成] 照片URL:", photo_url);
    console.log("[视频生成] 提示词:", prompt);

    // 生成视频
    const videoUrl = await generateVideoWithAgnes(photo_url, prompt);

    if (!videoUrl) {
      throw new Error("视频生成失败，未返回视频URL");
    }

    // 发送到企业微信群
    let wechatSent = false;
    if (WECHAT_WEBHOOK_URL) {
      wechatSent = await sendVideoToWechat(videoUrl);
      console.log("[视频生成] 企业微信通知:", wechatSent ? "成功" : "失败");
    }

    // 记录用量
    if (member_id) {
      try {
        await supabase.from("model_usage").insert({
          member_id,
          model_name: "agnes-video",
        });
      } catch (e: any) {
        console.error("[视频生成] 用量记录失败:", e?.message || e);
      }
    }

    console.log("[视频生成] 完成!");

    return NextResponse.json({
      video_url: videoUrl,
      wechat_sent: wechatSent,
      prompt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[视频生成] 错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
