"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Trash2, Check, Loader2, Settings2, Plus } from "lucide-react";
import { showToast } from "@/components/page-wrapper";

interface Label {
  id: number;
  xRatio: number; // 0-1 相对图片显示区
  yRatio: number;
  text: string;
  size: "lg" | "sm"; // 标注字号: 大(默认, 加大一号)/小(原字号)
}

// 预选词: 点击备注输入框弹出气泡快捷填入; 设置面板可增删, localStorage 持久化
const PRESETS_STORAGE_KEY = "photo-editor-presets";
const DEFAULT_PRESETS = ["默认微瑕", "无吊牌", "均码"];

function loadPresets(): string[] {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x: unknown) => typeof x === "string" && (x as string).trim());
    }
  } catch {}
  return DEFAULT_PRESETS;
}

interface ImageTextEditorProps {
  open: boolean;
  src: string | null; // dataURL 或远程 URL
  onCancel: () => void;
  onSave: (file: File, previewDataUrl: string) => void;
}

const clamp01 = (v: number) => Math.max(0.03, Math.min(0.97, v));

// 手绘圆角矩形(roundRect 在旧 iOS Safari 不可用)
function pathRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

// 图片文字标注编辑器: 点图片空白处添加白底红字标签, 可拖动/改字/删除, 保存时栅格化导出
// 兼容性: Android Chrome / iOS Safari — EXIF 方向用 createImageBitmap(from-image) 优先, Image 回退
export function ImageTextEditor({ open, src, onCancel, onSave }: ImageTextEditorProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [imgSource, setImgSource] = useState<{ source: CanvasImageSource; width: number; height: number; url: string } | null>(null);
  // 预选词(气泡 + 设置面板)
  const [presets, setPresets] = useState<string[]>(loadPresets);
  const [showPresetBubble, setShowPresetBubble] = useState(false);
  const [showPresetManage, setShowPresetManage] = useState(false);
  const [newPreset, setNewPreset] = useState("");

  // 预选词变更持久化
  useEffect(() => {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch {}
  }, [presets]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(1);
  const lastTextRef = useRef("");
  const dragRef = useRef<{ id: number; startX: number; startY: number; origX: number; origY: number; rect: DOMRect } | null>(null);

  // 打开时加载图片
  useEffect(() => {
    if (!open || !src) {
      setImgSource(null);
      setLabels([]);
      setSelectedId(null);
      setLoadError(false);
      return;
    }
    let cancelled = false;
    let objUrl: string | null = null;
    setLoading(true);
    setLoadError(false);
    setLabels([]);
    setSelectedId(null);
    (async () => {
      try {
        let source: CanvasImageSource;
        let width = 0;
        let height = 0;
        let displayUrl = src;
        try {
          const res = await fetch(src);
          const blob = await res.blob();
          try {
            const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
            source = bmp;
            width = bmp.width;
            height = bmp.height;
          } catch {
            const bmp = await createImageBitmap(blob);
            source = bmp;
            width = bmp.width;
            height = bmp.height;
          }
          objUrl = URL.createObjectURL(blob);
          displayUrl = objUrl;
        } catch {
          // fetch/createImageBitmap 不可用时回退 <img> 解码(现代浏览器 drawImage 已自动应用 EXIF)
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new Image();
            im.crossOrigin = "anonymous";
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error("load failed"));
            im.src = src;
          });
          source = img;
          width = img.naturalWidth;
          height = img.naturalHeight;
        }
        if (cancelled) return;
        setImgSource({ source, width, height, url: displayUrl });
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [open, src]);

  const selectedLabel = labels.find((l) => l.id === selectedId) || null;

  // 选中标签后聚焦输入框
  useEffect(() => {
    if (selectedId != null) inputRef.current?.focus();
  }, [selectedId]);

  const addLabel = useCallback((x: number, y: number) => {
    const id = idRef.current++;
    const text = lastTextRef.current || "备注";
    setLabels((prev) => [...prev, { id, xRatio: clamp01(x), yRatio: clamp01(y), text, size: "lg" }]);
    setSelectedId(id);
  }, []);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (!wrapRef.current || dragRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    addLabel((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  };

  const handleLabelPointerDown = (e: React.PointerEvent, label: Label) => {
    if (!wrapRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(label.id);
    dragRef.current = {
      id: label.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: label.xRatio,
      origY: label.yRatio,
      rect: wrapRef.current.getBoundingClientRect(),
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleLabelPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    e.preventDefault();
    const nx = clamp01(d.origX + (e.clientX - d.startX) / d.rect.width);
    const ny = clamp01(d.origY + (e.clientY - d.startY) / d.rect.height);
    setLabels((prev) => prev.map((l) => (l.id === d.id ? { ...l, xRatio: nx, yRatio: ny } : l)));
  };

  const handleLabelPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
  };

  const updateSelectedText = (text: string) => {
    if (selectedId == null) return;
    setLabels((prev) => prev.map((l) => (l.id === selectedId ? { ...l, text } : l)));
  };

  // 切换选中标签的字号
  const setLabelSize = (size: "lg" | "sm") => {
    if (selectedId == null) return;
    setLabels((prev) => prev.map((l) => (l.id === selectedId ? { ...l, size } : l)));
  };

  // 点预选词: 填入选中标签并记住为新标签默认文字
  const pickPreset = (p: string) => {
    if (selectedId != null) {
      setLabels((prev) => prev.map((l) => (l.id === selectedId ? { ...l, text: p } : l)));
      lastTextRef.current = p;
    }
    setShowPresetBubble(false);
  };

  // 新增预选词(去重)
  const addPreset = () => {
    const v = newPreset.trim();
    if (!v) return;
    if (presets.includes(v)) {
      showToast("该预选词已存在", "error");
      return;
    }
    setPresets((prev) => [...prev, v]);
    setNewPreset("");
  };

  const deleteSelected = () => {
    if (selectedId == null) return;
    setLabels((prev) => prev.filter((l) => l.id !== selectedId));
    setSelectedId(null);
  };

  const handleSave = async () => {
    if (!imgSource || saving) return;
    setSaving(true);
    try {
      const scale = Math.min(1, 800 / imgSource.width);
      const w = Math.round(imgSource.width * scale);
      const h = Math.round(imgSource.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas 不可用");
      ctx.drawImage(imgSource.source, 0, 0, w, h);

      // 画标签: 白底圆角矩形 + 黑描边 + 红字(与管理栏备注红一致)
      // 字号: 大(默认, 加大一号) / 小(原字号)
      for (const label of labels) {
        const text = (label.text || "").trim();
        if (!text) continue;
        const fontPx = label.size === "sm"
          ? Math.max(14, Math.round(w * 0.045))
          : Math.max(18, Math.round(w * 0.062));
        ctx.font = `800 ${fontPx}px ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
        const textW = ctx.measureText(text).width;
        const padX = fontPx * 0.45;
        const padY = fontPx * 0.3;
        const pillW = textW + padX * 2;
        const pillH = fontPx + padY * 2;
        const px = Math.max(2, Math.min(w - pillW - 2, label.xRatio * w - pillW / 2));
        const py = Math.max(2, Math.min(h - pillH - 2, label.yRatio * h - pillH / 2));
        pathRoundRect(ctx, px, py, pillW, pillH, Math.round(fontPx * 0.35));
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.09));
        ctx.strokeStyle = "#111827";
        ctx.stroke();
        ctx.fillStyle = "#EF4444";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, px + pillW / 2, py + pillH / 2 + fontPx * 0.04);
        lastTextRef.current = text;
      }

      // 导出: WebP 能力检测, iOS 回退 JPEG
      const useWebp = (() => {
        try {
          const c = document.createElement("canvas");
          c.width = 1;
          c.height = 1;
          return c.toDataURL("image/webp").startsWith("data:image/webp");
        } catch {
          return false;
        }
      })();
      const mime = useWebp ? "image/webp" : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.85));
      if (!blob) throw new Error("导出失败");
      const file = new File([blob], `photo-edited-${Date.now()}.${useWebp ? "webp" : "jpg"}`, { type: mime });
      const previewUrl = canvas.toDataURL("image/jpeg", 0.85);
      onSave(file, previewUrl);
    } catch (err) {
      showToast("照片保存失败，请重试", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/70">
      {/* 顶栏 */}
      <div className="flex shrink-0 items-center justify-between border-b-[3px] border-gray-900 bg-white px-4 py-3">
        <span className="text-sm font-extrabold text-gray-900">照片文字标注</span>
        <button
          onClick={onCancel}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-gray-900 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
          title="关闭"
        >
          <X className="h-4 w-4 text-gray-900" />
        </button>
      </div>

      {/* 图片编辑区 */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <span className="text-xs font-bold text-white">正在加载照片...</span>
          </div>
        ) : loadError || !imgSource ? (
          <span className="text-sm font-bold text-white">照片加载失败，请重试</span>
        ) : (
          <div ref={wrapRef} className="relative select-none" style={{ touchAction: "none" }}>
            <img
              src={imgSource.url}
              alt=""
              draggable={false}
              className="block h-auto max-h-[52vh] w-auto max-w-full rounded-lg"
            />
            <div className="absolute inset-0" onClick={handleOverlayClick}>
              {labels.map((label) => (
                <div
                  key={label.id}
                  onPointerDown={(e) => handleLabelPointerDown(e, label)}
                  onPointerMove={handleLabelPointerMove}
                  onPointerUp={handleLabelPointerUp}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute cursor-move"
                  style={{ left: `${label.xRatio * 100}%`, top: `${label.yRatio * 100}%`, transform: "translate(-50%, -50%)" }}
                >
                  <span
                    className={`inline-block whitespace-nowrap rounded-lg font-extrabold leading-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                      selectedId === label.id ? "border-[#4A90E2] border-[3px]" : "border-2 border-gray-900"
                    } bg-white text-[#EF4444] ${
                      label.size === "sm" ? "px-2 py-1 text-[13px]" : "px-2.5 py-1.5 text-[17px]"
                    }`}
                  >
                    {label.text || "备注"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部控制区 */}
      <div className="shrink-0 space-y-2 border-t-[3px] border-gray-900 bg-white p-3">
        {selectedLabel ? (
          <>
            {/* 预选词气泡: 挂在文档流里从输入框上方展开, 不会遮住上方图片 */}
            {showPresetBubble && !showPresetManage && presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-xl border-[3px] border-dashed border-gray-300 bg-gray-50 p-2">
                {presets.map((p) => (
                  <button
                    key={p}
                    onMouseDown={(e) => {
                      e.preventDefault(); // 保持输入框焦点, 避免 blur 先行
                      pickPreset(p);
                    }}
                    className="rounded-lg border-2 border-gray-900 bg-white px-2.5 py-1 text-xs font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* 预选词设置面板: 增删预选词 */}
            {showPresetManage && (
              <div className="space-y-2 rounded-xl border-[3px] border-gray-900 bg-white p-2.5">
                <div className="text-xs font-extrabold text-gray-900">预选词设置</div>
                {presets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 rounded-lg border-2 border-gray-900 bg-white py-1 pl-2.5 pr-1 text-xs font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                      >
                        <button
                          onClick={() => {
                            updateSelectedText(p);
                            lastTextRef.current = p;
                          }}
                        >
                          {p}
                        </button>
                        <button
                          onClick={() => setPresets((prev) => prev.filter((x) => x !== p))}
                          className="flex h-4 w-4 items-center justify-center rounded bg-[#FF6B7A] text-white"
                          title="删除该预选词"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input
                    value={newPreset}
                    onChange={(e) => setNewPreset(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPreset()}
                    maxLength={12}
                    placeholder="新增预选词"
                    className="min-w-0 flex-1 rounded-lg border-2 border-gray-900 px-2 py-1.5 text-xs font-bold text-gray-900 outline-none focus:bg-blue-50"
                  />
                  <button
                    onClick={addPreset}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-lg border-2 border-gray-900 bg-[#4CD964] px-2.5 text-xs font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加
                  </button>
                </div>
              </div>
            )}

            {/* 标注字号选项: 大(默认)/小(原字号) */}
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-extrabold text-gray-500">标注大小</span>
              <div className="flex overflow-hidden rounded-lg border-2 border-gray-900">
                <button
                  onClick={() => setLabelSize("lg")}
                  className={`px-3 py-1 text-xs font-extrabold ${
                    (selectedLabel.size || "lg") === "lg" ? "bg-[#4A90E2] text-white" : "bg-white text-gray-900"
                  }`}
                >
                  大
                </button>
                <button
                  onClick={() => setLabelSize("sm")}
                  className={`border-l-2 border-gray-900 px-3 py-1 text-xs font-extrabold ${
                    selectedLabel.size === "sm" ? "bg-[#4A90E2] text-white" : "bg-white text-gray-900"
                  }`}
                >
                  小
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={selectedLabel.text}
                onChange={(e) => updateSelectedText(e.target.value)}
                onFocus={() => {
                  setShowPresetBubble(true);
                  setShowPresetManage(false);
                }}
                onBlur={() => setShowPresetBubble(false)}
                maxLength={30}
                placeholder="输入标注文字"
                className="min-w-0 flex-1 rounded-xl border-[3px] border-gray-900 bg-white px-3 py-2 text-base font-bold text-gray-900 outline-none focus:bg-blue-50"
              />
              {/* 预选词设置按钮(与右侧按钮同款) */}
              <button
                onClick={() => {
                  setShowPresetManage((s) => !s);
                  setShowPresetBubble(false);
                }}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] ${
                  showPresetManage ? "bg-[#FFC93C]" : "bg-white"
                }`}
                title="预选词设置"
              >
                <Settings2 className="h-4 w-4 text-gray-900" />
              </button>
              <button
                onClick={deleteSelected}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#FF6B7A] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                title="删除标签"
              >
                <Trash2 className="h-4 w-4 text-white" />
              </button>
              <button
                onClick={() => {
                  setSelectedId(null);
                  setShowPresetBubble(false);
                  setShowPresetManage(false);
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-[#4CD964] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
                title="完成"
              >
                <Check className="h-4 w-4 text-gray-900" />
              </button>
            </div>
          </>
        ) : (
          <div className="text-center text-xs font-bold text-gray-400">
            点击照片添加文字标注 · 点击标签可编辑或拖动
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border-[3px] border-gray-900 bg-white py-2.5 text-sm font-extrabold text-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px]"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!imgSource || saving}
            className="flex-1 rounded-xl border-[3px] border-gray-900 bg-[#4A90E2] py-2.5 text-sm font-extrabold text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
