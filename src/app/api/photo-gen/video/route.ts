import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";

async function sendVideoToWechat(videoUrl: string): Promise<boolean> {
  if (!WECHAT_WEBHOOK_URL) return false;
  try {
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

async function pollVideoResult(videoId: string, maxWaitMs: number = 300000): Promise<string | null> {
  const startTime = Date.now();
  const interval = 5000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(`https://apihub.agnes-ai.com/agnesapi?video_id=${encodeURIComponent(videoId)}`, {
        headers: {
          Authorization: `Bearer ${AGNES_API_KEY}`,
        },
      });
      const data = await res.json();

      console.log(`[Agnes] 轮询结果: status=${data.status}, progress=${data.progress}`);

      if (data.status === "completed") {
        const videoUrl = data.remixed_from_video_id;
        if (videoUrl) {
          console.log("[Agnes] 视频生成完成:", videoUrl);
          return videoUrl;
        }
        throw new Error("视频生成完成但未返回视频URL");
      }

      if (data.status === "failed") {
        console.error("[Agnes] 视频生成失败:", data.error);
        throw new Error(data.error?.message || data.error || "视频生成失败");
      }

      if (data.status === "queued" || data.status === "in_progress") {
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }

      throw new Error(`未知状态: ${data.status}`);
    } catch (err) {
      console.error("[Agnes] 轮询错误:", err);
      if (err instanceof Error && err.message.includes("轮询")) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  console.error("[Agnes] 视频生成超时");
  throw new Error("视频生成超时，请稍后重试");
}

async function generateVideoWithAgnes(photoUrl: string, prompt: string): Promise<string | null> {
  if (!AGNES_API_KEY) {
    throw new Error("Agnes API Key 未配置 (AGNES_API_KEY)");
  }

  console.log("[Agnes] 调用视频生成 API...");
  console.log("[Agnes] 照片URL:", photoUrl);
  console.log("[Agnes] 提示词:", prompt);

  const res = await fetch(`${AGNES_BASE}/videos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGNES_API_KEY}`,
    },
    body: JSON.stringify({
      model: "agnes-video-v2.0",
      prompt: prompt,
      image: photoUrl,
      height: 768,
      width: 1152,
      num_frames: 121,
      frame_rate: 24,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("[Agnes] API 错误:", JSON.stringify(data));
    throw new Error(data.message || data.error || "Agnes API 调用失败");
  }

  const videoId = data.video_id;
  const taskId = data.task_id;

  console.log("[Agnes] 任务创建成功:", { videoId, taskId, status: data.status });

  if (!videoId) {
    throw new Error("Agnes 未返回 video_id");
  }

  return await pollVideoResult(videoId);
}

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

    const videoUrl = await generateVideoWithAgnes(photo_url, prompt);

    if (!videoUrl) {
      throw new Error("视频生成失败，未返回视频URL");
    }

    let wechatSent = false;
    if (WECHAT_WEBHOOK_URL) {
      wechatSent = await sendVideoToWechat(videoUrl);
      console.log("[视频生成] 企业微信通知:", wechatSent ? "成功" : "失败");
    }

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
