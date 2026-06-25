"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Video, Upload, Loader2, Eye, Edit3, Sparkles, Check, AlertCircle, Send } from "lucide-react";
import { PageWrapper } from "@/components/page-wrapper";

export default function VideoGenPage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState(
    "让照片中的小孩动起来，做一些可爱的动作，比如轻轻跳跃、挥手、微笑、转头，保持自然、随性，充满童真，温暖的光线，高质量视频"
  );
  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "video-photos");

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      setPhoto(data.url);
    } catch (err) {
      alert("上传失败: " + (err instanceof Error ? err.message : "未知错误"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startPolling = (vid: string, mid: string) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/photo-gen/video?video_id=${encodeURIComponent(vid)}&member_id=${encodeURIComponent(mid)}`
        );
        const data = await res.json();

        if (data.error) {
          console.error("轮询错误:", data.error);
          return;
        }

        if (data.progress !== undefined) {
          setProgress(data.progress);
        }

        if (data.status === "completed") {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
          }
          if (data.video_url) {
            setVideoUrl(data.video_url);
            setStatus("success");
          } else {
            setErrorMsg("视频生成完成但未获取到视频链接");
            setStatus("error");
          }
          setGenerating(false);
        }

        if (data.status === "failed") {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
          }
          setErrorMsg(data.error || "视频生成失败");
          setStatus("error");
          setGenerating(false);
        }
      } catch (err) {
        console.error("轮询异常:", err);
      }
    }, 5000);
  };

  const handleGenerate = async () => {
    if (!photo) {
      alert("请先上传照片");
      return;
    }

    setGenerating(true);
    setStatus("generating");
    setErrorMsg("");
    setVideoUrl(null);
    setProgress(0);
    setVideoId(null);

    const mid = localStorage.getItem("member_id") || localStorage.getItem("member_phone") || "";

    try {
      const res = await fetch("/api/photo-gen/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_url: photo,
          prompt,
          member_id: mid,
        }),
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.video_id) {
        throw new Error("未返回视频任务ID");
      }

      setVideoId(data.video_id);
      console.log("视频任务创建成功:", data.video_id);

      startPolling(data.video_id, mid);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(message);
      setStatus("error");
      setGenerating(false);
    }
  };

  return (
    <PageWrapper>
      {/* 顶部导航 */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/operations/photo-gen" className="flex items-center justify-center h-9 w-9 rounded-xl border-[3px] border-gray-900 hover:bg-gray-100 transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold text-gray-900 truncate">
            <span className="text-[#FF6B7A]">视频生成</span>
          </h1>
        </div>
      </div>

      {/* 使用说明 */}
      <div className="mb-4 p-3 rounded-xl border-[3px] border-[#4A90E2] bg-[#4A90E2]/10">
        <p className="text-xs font-medium text-gray-700">
          <span className="text-[#4A90E2] font-extrabold">✨</span> 上传照片，让照片中的人物动起来！生成视频后将通过企业微信群返回。
        </p>
      </div>

      {/* 照片上传区域 */}
      <div className="mb-4">
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`relative rounded-xl border-[3px] ${photo ? "border-green-500" : "border-dashed border-gray-400"} bg-gray-50 overflow-hidden cursor-pointer hover:bg-gray-100 transition-colors`}
          style={{ minHeight: "280px" }}
        >
          {uploading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-[#FF6B7A]" />
              <span className="text-sm font-bold text-gray-500">上传中...</span>
            </div>
          ) : photo ? (
            <div className="relative w-full h-full">
              <img src={photo} alt="上传的照片" className="w-full h-full object-contain" />
              <div className="absolute top-2 left-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                <Check className="h-3 w-3" /> 已上传
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Upload className="h-10 w-10 text-gray-400" />
              <div className="text-center">
                <p className="text-sm font-bold text-gray-600">点击上传照片</p>
                <p className="text-xs text-gray-400 mt-1">支持 JPG、PNG 格式</p>
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className="hidden"
        />
        {photo && !generating && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 w-full py-2 rounded-xl border-[3px] border-gray-900 bg-white text-xs font-extrabold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
          >
            <Upload className="h-3 w-3" />
            重新上传
          </button>
        )}
      </div>

      {/* 提示词区域 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-extrabold text-gray-700 flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-[#FF6B7A]" />
            动作提示词
          </label>
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border-[2px] text-[10px] font-bold transition-all ${
              showPrompt ? "border-[#FF6B7A] bg-[#FF6B7A] text-white" : "border-gray-300 text-gray-500 hover:border-[#FF6B7A] hover:text-[#FF6B7A]"
            }`}
          >
            {showPrompt ? <Eye className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
            {showPrompt ? "预览" : "编辑"}
          </button>
        </div>

        {showPrompt ? (
          <div className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-xl border-[3px] border-gray-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FF6B7A] resize-none"
              placeholder="输入动作描述..."
              disabled={generating}
            />
            <p className="text-[10px] text-gray-400">
              提示：描述自然、随性、有童真的动作，如：奔跑、跳跃、挥手、旋转等
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-xl border-[3px] border-gray-200 bg-gray-50">
            <p className="text-xs font-medium text-gray-700 whitespace-pre-wrap">{prompt}</p>
          </div>
        )}
      </div>

      {/* 生成按钮 */}
      <button
        onClick={handleGenerate}
        disabled={!photo || generating}
        className={`w-full py-3 rounded-xl border-[3px] font-extrabold text-sm transition-all flex items-center justify-center gap-2 ${
          !photo || generating
            ? "border-gray-300 bg-gray-100 text-gray-400 cursor-not-allowed"
            : "border-gray-900 bg-[#FF6B7A] text-white hover:bg-[#FF5B6A] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
        }`}
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            生成中 {progress > 0 && `${progress}%`}...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            生成视频
          </>
        )}
      </button>

      {/* 状态提示 */}
      {status === "generating" && (
        <div className="mt-3 p-3 rounded-xl border-[3px] border-[#4A90E2] bg-[#4A90E2]/10">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#4A90E2]" />
            <div>
              <p className="text-xs font-bold text-gray-700">正在生成视频...</p>
              <p className="text-[10px] text-gray-500 mt-0.5">使用 Agnes-Video-V2.0 生成 · 预计需要 1-3 分钟</p>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#4A90E2] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === "success" && videoUrl && (
        <div className="mt-3 space-y-3">
          <div className="p-3 rounded-xl border-[3px] border-green-500 bg-green-50">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-green-500" />
              <p className="text-xs font-bold text-green-700">视频生成成功！</p>
            </div>
            <p className="text-[10px] text-gray-500">视频已发送到企业微信群</p>
          </div>
          
          <div className="rounded-xl border-[3px] border-gray-900 overflow-hidden bg-gray-900">
            <video
              src={videoUrl}
              controls
              className="w-full"
            />
          </div>

          <button
            onClick={() => {
              setPhoto(null);
              setVideoUrl(null);
              setStatus("idle");
              setProgress(0);
              setVideoId(null);
            }}
            className="w-full py-2 rounded-xl border-[3px] border-gray-900 bg-white text-xs font-extrabold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
          >
            <Upload className="h-3 w-3" />
            生成下一个视频
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="mt-3 p-3 rounded-xl border-[3px] border-red-500 bg-red-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-700">生成失败</p>
              <p className="text-[10px] text-red-600 mt-1">{errorMsg || "未知错误"}</p>
            </div>
          </div>
        </div>
      )}

      {/* 模型信息 */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span className="font-bold">调用模型:</span>
          <span className="px-2 py-0.5 rounded-full border-[2px] border-pink-500 bg-pink-100 text-pink-700 font-extrabold">
            ✨ Agnes-Video-V2.0
          </span>
          <span className="text-gray-400">| 免费额度最高质量</span>
        </div>
      </div>
    </PageWrapper>
  );
}
