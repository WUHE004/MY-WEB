import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import sharp from "sharp";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const WECHAT_WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL || "";

const STORAGE_BUCKET = "product-photos";
const TEMP_FOLDER = "temp-videos";
const MAX_IMAGE_BYTES = 500 * 1024;

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 8000;

function base64ToBuffer(base64Str: string): Buffer {
  const base64 = base64Str.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}

async function compressImageBuffer(inputBuffer: Buffer): Promise<Buffer> {
  if (inputBuffer.length <= MAX_IMAGE_BYTES) return inputBuffer;
  let quality = 80;
  let buffer = await sharp(inputBuffer)
    .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  while (buffer.length > MAX_IMAGE_BYTES && quality > 30) {
    quality -= 15;
    buffer = await sharp(inputBuffer)
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }
  return Buffer.from(buffer);
}

async function uploadTempPhoto(buffer: Buffer): Promise<{ url: string; path: string }> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const fileName = `${TEMP_FOLDER}/${timestamp}_${random}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`图片上传失败: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);

  return { url: urlData.publicUrl, path: fileName };
}

async function deleteTempPhoto(filePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
    if (error) {
      console.warn("[临时图片删除] 失败:", error.message);
      return false;
    }
    console.log("[临时图片删除] 成功:", filePath);
    return true;
  } catch (err) {
    console.warn("[临时图片删除] 异常:", err);
    return false;
  }
}

async function createVideoTask(
  photo_url: string,
  prompt: string,
  negative_prompt: string,
  retries: number = MAX_RETRIES
): Promise<{ video_id: string; task_id: string; status: string }> {
  try {
    const res = await fetch(`${AGNES_BASE}/videos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGNES_API_KEY}`,
      },
      body: JSON.stringify({
        model: "agnes-video-v2.0",
        prompt: prompt,
        image: photo_url,
        width: 1080,
        height: 1920,
        num_frames: 121,
        frame_rate: 24,
        negative_prompt: negative_prompt,
        seed: Math.floor(Math.random() * 2147483647),
      }),
    });

    const data = await res.json();

    if (res.status === 503 && retries > 0) {
      console.log(`[Agnes] 服务繁忙 (503)，${retries - 1} 次重试后再试...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return createVideoTask(photo_url, prompt, negative_prompt, retries - 1);
    }

    if (!res.ok) {
      console.error("[Agnes] API 错误:", JSON.stringify(data));
      const errorMsg = data?.error?.message || data?.message || data?.error || "Agnes API 调用失败";
      throw new Error(errorMsg);
    }

    const videoId = data.video_id;
    const taskId = data.task_id;

    if (!videoId) {
      throw new Error("Agnes 未返回 video_id");
    }

    return {
      video_id: videoId,
      task_id: taskId,
      status: data.status || "queued",
    };
  } catch (err) {
    if (retries > 0 && err instanceof Error && err.message.includes("503")) {
      console.log(`[Agnes] 服务繁忙，${retries - 1} 次重试后再试...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return createVideoTask(photo_url, prompt, negative_prompt, retries - 1);
    }
    throw err;
  }
}

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

// POST: 创建视频生成任务
export async function POST(request: NextRequest) {
  try {
    if (!AGNES_API_KEY) {
      return NextResponse.json(
        { error: "Agnes API Key 未配置 (AGNES_API_KEY)" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { photo_data, prompt, member_id, negative_prompt } = body;

    if (!photo_data) {
      return NextResponse.json({ error: "缺少 photo_data (base64图片)" }, { status: 400 });
    }

    if (!prompt || prompt.trim() === "") {
      return NextResponse.json({ error: "缺少 prompt" }, { status: 400 });
    }

    console.log("[视频生成] 创建任务...");
    console.log("[视频生成] 照片大小:", Math.round(photo_data.length / 1024), "KB");
    console.log("[视频生成] 提示词:", prompt);

    const negPrompt = negative_prompt || "distorted face, deformed body, extra limbs, morphing, blurry, jittery, flickering, inconsistent background, watermark, text, low quality, ugly, disfigured, bad anatomy, cropped, out of frame";

    const rawBuffer = base64ToBuffer(photo_data);
    const compressedBuffer = await compressImageBuffer(rawBuffer);
    console.log("[视频生成] 图片压缩后:", Math.round(compressedBuffer.length / 1024), "KB");

    const { url: photoUrl, path: tempPhotoPath } = await uploadTempPhoto(compressedBuffer);
    console.log("[视频生成] 临时图片URL:", photoUrl);

    let result;
    try {
      result = await createVideoTask(photoUrl, prompt, negPrompt);
    } catch (err) {
      await deleteTempPhoto(tempPhotoPath);
      throw err;
    }

    console.log("[Agnes] 任务创建成功:", result);

    // 保存任务信息到数据库（可选，用于后续查询）
    if (member_id) {
      try {
        await supabase.from("video_tasks").insert({
          video_id: result.video_id,
          task_id: result.task_id,
          member_id,
          prompt,
          photo_data: tempPhotoPath,
          status: result.status,
        });
      } catch (e: any) {
        console.error("[视频生成] 任务记录失败:", e?.message || e);
      }
    }

    return NextResponse.json({
      video_id: result.video_id,
      task_id: result.task_id,
      status: result.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[视频生成] 创建任务错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET: 查询视频生成状态
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("video_id");
    const memberId = searchParams.get("member_id");

    if (!videoId) {
      return NextResponse.json({ error: "缺少 video_id" }, { status: 400 });
    }

    if (!AGNES_API_KEY) {
      return NextResponse.json(
        { error: "Agnes API Key 未配置 (AGNES_API_KEY)" },
        { status: 500 }
      );
    }

    const res = await fetch(
      `https://apihub.agnes-ai.com/agnesapi?video_id=${encodeURIComponent(videoId)}`,
      {
        headers: {
          Authorization: `Bearer ${AGNES_API_KEY}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("[Agnes] 查询错误:", JSON.stringify(data));
      return NextResponse.json(
        { error: data.message || data.error || "查询失败" },
        { status: res.status }
      );
    }

    console.log(`[Agnes] 查询结果: status=${data.status}, progress=${data.progress}`);

    let tempPhotoPath = "";
    try {
      const { data: taskData } = await supabase
        .from("video_tasks")
        .select("photo_data")
        .eq("video_id", videoId)
        .maybeSingle();
      if (taskData?.photo_data && taskData.photo_data.startsWith(TEMP_FOLDER + "/")) {
        tempPhotoPath = taskData.photo_data;
      }
    } catch (e: any) {
      console.warn("[视频生成] 查询临时图片路径失败:", e?.message || e);
    }

    let videoUrl = null;
    if (data.status === "completed") {
      videoUrl = data.remixed_from_video_id;

      if (tempPhotoPath) {
        await deleteTempPhoto(tempPhotoPath);
      }

      // 发送企业微信通知
      if (videoUrl && WECHAT_WEBHOOK_URL) {
        const wechatSent = await sendVideoToWechat(videoUrl);
        console.log("[视频生成] 企业微信通知:", wechatSent ? "成功" : "失败");
      }

      // 记录用量
      if (memberId) {
        try {
          await supabase.from("model_usage").insert({
            member_id: memberId,
            model_name: "agnes-video",
          });
        } catch (e: any) {
          console.error("[视频生成] 用量记录失败:", e?.message || e);
        }
      }

      // 更新任务状态
      try {
        await supabase
          .from("video_tasks")
          .update({ status: "completed", video_url: videoUrl })
          .eq("video_id", videoId);
      } catch (e: any) {
        console.error("[视频生成] 任务状态更新失败:", e?.message || e);
      }
    }

    if (data.status === "failed") {
      const errorMsg = data.error?.message || data.error || "视频生成失败";
      console.error("[Agnes] 视频生成失败:", errorMsg);

      if (tempPhotoPath) {
        await deleteTempPhoto(tempPhotoPath);
      }

      try {
        await supabase
          .from("video_tasks")
          .update({ status: "failed", error: errorMsg })
          .eq("video_id", videoId);
      } catch (e: any) {
        // 忽略
      }

      return NextResponse.json({
        status: "failed",
        error: errorMsg,
        progress: data.progress || 0,
      });
    }

    return NextResponse.json({
      status: data.status,
      progress: data.progress || 0,
      video_url: videoUrl,
      seconds: data.seconds,
      size: data.size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[视频生成] 查询错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
