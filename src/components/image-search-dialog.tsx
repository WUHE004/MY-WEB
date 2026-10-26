"use client";

import { useState, useEffect, useRef } from "react";
import { X, Camera, Check, Image as ImageIcon, Package } from "lucide-react";
import { compressImageFile } from "@/lib/image-compress";
import { showToast } from "@/components/page-wrapper";

export type ImageSearchScope = "all" | "sales" | "returns";

interface ImageSearchResult {
  sale_id: string;
  similarity: number;
  name: string;
  manufacturer: string;
  shelf_no: string;
  photo: string;
  sold_sizes: Record<string, number>;
  sold?: boolean;
}

/**
 * 拍立淘式拍照识图弹窗(退货登记/管理栏共用):
 * 打开 → 全屏相机取景 → 快门拍摄/相册选图 → 向量检索 → 结果卡片(一行两张) → 点卡片交给 onPick
 * scope: 检索范围(all=全部入库 / sales=仅已售 / returns=仅已退)
 * markUnsold: 未售出的结果标红框且不可选中(退货登记用)
 * onFallbackPick: 售出/退货范围无匹配时, 下方展示总表回退结果, 点卡片走此回调(管理栏: 跳总表并填编号)
 */
export function ImageSearchDialog({
  open,
  onClose,
  onPick,
  onFallbackPick,
  scope = "all",
  markUnsold = false,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (saleId: string) => void;
  onFallbackPick?: (saleId: string) => void;
  scope?: ImageSearchScope;
  markUnsold?: boolean;
}) {
  const [view, setView] = useState<"camera" | "results">("camera");
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImageSearchResult[] | null>(null);
  // 售出/退货范围无匹配时的总表回退结果
  const [fallback, setFallback] = useState<ImageSearchResult[]>([]);
  const [backfillRunning, setBackfillRunning] = useState(false);
  // 点选中的卡片编号: 短暂展示选中效果后自动关闭
  const [pickedId, setPickedId] = useState<string | null>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  // ===== 相机流管理 =====
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camError, setCamError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [shooting, setShooting] = useState(false);

  // 打开时重置到相机取景
  useEffect(() => {
    if (open) {
      setView("camera");
      setPreview(null);
      setResults(null);
      setLoading(false);
      setCamError("");
      setPickedId(null);
    }
  }, [open]);

  // 点卡片: 编号立即交父级填入 + 卡片展示选中效果 → 随即自动关闭
  const pick = (saleId: string) => {
    if (pickedId) return; // 防连点
    setPickedId(saleId);
    try { navigator.vibrate?.(40); } catch { /* 忽略 */ }
    onPick(saleId);
    setTimeout(() => onClose(), 300);
  };

  // 总表回退卡片: 交给 onFallbackPick(管理栏跳总表并填编号)
  const pickFallback = (saleId: string) => {
    if (pickedId) return;
    setPickedId(saleId);
    try { navigator.vibrate?.(40); } catch { /* 忽略 */ }
    if (onFallbackPick) onFallbackPick(saleId);
    else onPick(saleId);
    setTimeout(() => onClose(), 300);
  };

  // 结果视图里的范围名称(无匹配提示文案用)
  const scopeName = scope === "sales" ? "售出" : scope === "returns" ? "退货" : "总表";

  // 结果卡片(一行两张: 图片 / 编号放大 / 名称); markUnsold 时未售出标红框不可选
  const renderCard = (r: ImageSearchResult, onCardClick: (sid: string) => void) => {
    const isSold = r.sold ?? Object.values(r.sold_sizes || {}).some((q) => Number(q) > 0);
    const selectable = !markUnsold || isSold;
    const picked = pickedId === r.sale_id;
    return (
      <button
        key={r.sale_id}
        onClick={() => selectable && onCardClick(r.sale_id)}
        disabled={!selectable}
        title={selectable ? undefined : "该商品未售出，无法选择"}
        className={`relative text-left rounded-xl border-[3px] bg-white transition-all overflow-hidden ${
          picked
            ? "border-[#4CD964] bg-green-50 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] translate-y-[1px]"
            : selectable
              ? "border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-y-[1px]"
              : "border-red-500 opacity-70 cursor-not-allowed"
        }`}
      >
        <div className="relative aspect-square bg-gray-100">
          {r.photo ? (
            <img src={r.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Package className="h-10 w-10 text-gray-300" />
            </div>
          )}
          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md border-2 border-gray-900 bg-[#4CD964] text-white text-[10px] font-extrabold">
            {r.similarity}%
          </span>
          {!selectable && (
            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md border-2 border-red-500 bg-white text-red-500 text-[10px] font-extrabold">
              未售出
            </span>
          )}
          {/* 选中效果: 打勾 + 绿色高亮, 随即自动关闭 */}
          {picked && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-gray-900 bg-[#4CD964] text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Check className="h-6 w-6" strokeWidth={3} />
              </span>
            </span>
          )}
        </div>
        <div className={`p-2 border-t-[3px] ${picked ? "border-[#4CD964]" : selectable ? "border-gray-900" : "border-red-500"}`}>
          <p className={`text-base sm:text-lg font-black truncate ${picked ? "text-[#2FA84F]" : selectable ? "text-gray-900" : "text-red-500"}`}>{r.sale_id}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">{r.name || "未命名"}</p>
        </div>
      </button>
    );
  };

  useEffect(() => {
    if (!open || view !== "camera") return;
    let cancelled = false;
    setCamError("");
    setShooting(false);

    const cleanup = () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      try {
        const video = videoRef.current;
        if (!video) throw new Error("video 元素未挂载");
        let stream: MediaStream;
        try {
          // 优先后置摄像头 + 高分辨率(衣物纹理细节利于向量识别)
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment" } });
        }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => {});
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setCamError(/permission|denied|NotAllowed/i.test(msg)
          ? "相机权限被拒绝，请在浏览器设置中允许本站使用相机后重试"
          : `相机启动失败: ${msg}`);
      }
    })();

    return cleanup;
  }, [open, view, retryKey]);

  // 抓拍当前帧 → JPEG File → 搜索
  const shoot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || shooting) return;
    setShooting(true);
    try {
      try { navigator.vibrate?.(60); } catch { /* 忽略 */ }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.92));
      if (blob) handleCapture(new File([blob], "capture.jpg", { type: "image/jpeg" }));
    } finally {
      setShooting(false);
    }
  };

  // 压缩(≤100KB, 复用全局压缩工具) → dataURL → 后端向量检索
  const doSearchFromFile = async (file: File) => {
    setLoading(true);
    setResults(null);
    setFallback([]);
    try {
      const compressed = await compressImageFile(file, { target: 100 * 1024, maxWidth: 800 });
      const dataUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(String(reader.result));
        reader.onerror = () => rej(new Error("读取图片失败"));
        reader.readAsDataURL(compressed);
      });
      setPreview(dataUrl);
      const res = await fetch("/api/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, scope }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "搜索失败");
      setResults(Array.isArray(data.results) ? data.results : []);
      setFallback(Array.isArray(data.fallback) ? data.fallback : []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "以图搜图失败", "error");
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  // 拍摄/选图完成: 切到结果视图(先展示加载态)
  const handleCapture = (file: File) => {
    setView("results");
    doSearchFromFile(file);
  };

  // 补档: 循环调用直到缺档清零(每批 12 张)
  const runBackfill = async () => {
    setBackfillRunning(true);
    try {
      let remaining = -1;
      let total = 0;
      for (let loop = 0; loop < 300; loop++) {
        const res = await fetch("/api/image-search?mode=backfill", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "补档失败");
        total += data.embedded || 0;
        remaining = data.remaining ?? 0;
        if (remaining <= 0) break;
      }
      showToast(`补档完成: 新增 ${total} 张向量档${remaining > 0 ? `（剩余 ${remaining} 张失败，可重试）` : ""}`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "补档失败", "error");
    } finally {
      setBackfillRunning(false);
    }
  };

  if (!open) return null;

  // ===== 相机取景视图 =====
  if (view === "camera") {
    return (
      <>
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          {/* 顶栏 */}
          <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <h3 className="text-white font-extrabold text-base">拍照识图</h3>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] transition-all"
              aria-label="关闭相机"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 取景区 */}
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted autoPlay playsInline />
            {/* 中央取景框 */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-[78%] max-w-sm aspect-[3/4] rounded-2xl border-[3px] border-white/80" />
            </div>
            {camError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 bg-black/80">
                <p className="text-sm font-bold text-red-400 text-center">{camError}</p>
                <button
                  onClick={() => setRetryKey((k) => k + 1)}
                  className="px-5 py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] transition-all"
                >
                  重试
                </button>
              </div>
            )}
          </div>

          {/* 底部: 提示 + 相册/快门 */}
          <div className="flex flex-col items-center gap-4 px-4 py-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="text-xs text-white/70 text-center">对准衣服点击拍摄，自动搜索相似商品</p>
            <div className="flex items-center justify-between w-full px-8">
              <button
                onClick={() => albumInputRef.current?.click()}
                className="h-12 w-12 rounded-xl border-[3px] border-white bg-black/30 text-white flex items-center justify-center active:scale-95 transition-transform"
                aria-label="从相册选图"
              >
                <ImageIcon className="h-5 w-5" />
              </button>
              <button
                onClick={shoot}
                disabled={shooting || !!camError}
                className="h-16 w-16 rounded-full border-4 border-white bg-white/25 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
                aria-label="拍摄"
              >
                <span className="h-12 w-12 rounded-full bg-white" />
              </button>
              <div className="h-12 w-12" aria-hidden />
            </div>
          </div>
        </div>
        <input
          ref={albumInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // 允许重选同一张
            if (f) handleCapture(f);
          }}
          className="hidden"
        />
      </>
    );
  }

  // ===== 结果视图 =====
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/70 flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl border-[3px] border-gray-900 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg sm:text-xl font-extrabold text-gray-900">以图搜图</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all"
            title="关闭"
          >
            <X className="h-4 w-4 text-gray-900" />
          </button>
        </div>

        {/* 搜索图预览 + 重拍/重选入口 */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setView("camera")}
            disabled={loading}
            title="点击重新拍摄"
            className="w-16 h-16 shrink-0 rounded-xl border-[3px] border-gray-900 overflow-hidden bg-gray-50 flex items-center justify-center active:translate-y-[1px] transition-all disabled:cursor-not-allowed"
          >
            {preview ? (
              <img src={preview} alt="" className="w-full h-full object-cover" />
            ) : (
              <Camera className="h-6 w-6 text-gray-400" />
            )}
          </button>
          <button
            onClick={() => albumInputRef.current?.click()}
            disabled={loading}
            title="从相册重新选图"
            className="w-16 h-16 shrink-0 rounded-xl border-[3px] border-dashed border-gray-400 bg-gray-50 text-gray-500 flex flex-col items-center justify-center hover:border-gray-900 hover:text-gray-900 transition-colors disabled:cursor-not-allowed"
          >
            <ImageIcon className="h-5 w-5" />
            <span className="text-[10px] font-bold mt-0.5">相册</span>
          </button>
          <div className="flex-1 min-w-0">
            {loading ? (
              <p className="text-sm font-extrabold text-gray-900 animate-pulse">正在识别图片特征...</p>
            ) : results ? (
              <p className="text-sm font-extrabold text-gray-900">找到 {results.length} 个相似商品</p>
            ) : (
              <p className="text-sm font-extrabold text-gray-500">准备就绪</p>
            )}
            <p className="text-[11px] text-gray-400 mt-0.5">点击卡片选中该商品（照片仅用于搜索，不会上传数据库）</p>
          </div>
        </div>

        {/* 结果卡片: 一行两张(图片 / 编号放大 / 名称) */}
        {results && results.length > 0 && (
          <div className="grid grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-0.5">
            {results.map((r) => renderCard(r, pick))}
          </div>
        )}

        {/* 售出/退货无匹配: 红字提示 + 总表回退结果, 点卡片跳总表并填入编号 */}
        {results && results.length === 0 && fallback.length > 0 && (
          <>
            <p className="mb-2 text-center text-sm font-black text-red-500">在{scopeName}未找到匹配商品，总表中匹配的如下</p>
            <div className="grid grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-0.5">
              {fallback.map((r) => renderCard(r, pickFallback))}
            </div>
          </>
        )}

        {/* 无结果 */}
        {results && results.length === 0 && fallback.length === 0 && !loading && (
          <div className="p-4 rounded-xl border-[3px] border-yellow-400 bg-yellow-50 text-center">
            <p className="text-sm font-extrabold text-yellow-700">没有找到相似商品</p>
            <p className="text-xs text-yellow-600 mt-1">尽量正面对准衣服、光线充足时重拍试试</p>
          </div>
        )}

        {/* 补档入口 */}
        <div className="mt-3 pt-2 border-t-2 border-dashed border-gray-200 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">搜索不到新入库的商品时，点补档同步向量库</p>
          <button
            onClick={runBackfill}
            disabled={backfillRunning}
            className="px-3 py-1.5 rounded-lg border-[2px] border-gray-900 bg-white text-xs font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {backfillRunning ? "补档中..." : "补档"}
          </button>
        </div>
      </div>
    </div>
  );
}
