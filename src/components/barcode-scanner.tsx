"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { X, Zap, ZapOff, ZoomIn, ZoomOut } from "lucide-react";

// 浏览器原生 BarcodeDetector(TS 标准库未收录,此处声明用到的最小接口)
interface DetectedBarcode { rawValue: string; }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]>; }
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

// 一维条码格式(快递面单以 CODE_128 为主)
const NATIVE_FORMATS = ["code_128", "code_39", "code_93", "codabar", "ean_13", "ean_8", "upc_a", "upc_e", "itf"];
const ZXING_FORMATS = [
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.CODABAR,
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF,
];

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onResult: (code: string) => void;
  title?: string;
  hint?: string;
}

type ScanMode = "init" | "native" | "zxing" | "error";

/**
 * 条形码扫码组件(全屏)
 * 相机流由本组件统一持有 → 手电筒/变焦/对焦约束在两种引擎下都可用
 * - 引擎1(优先): 浏览器原生 BarcodeDetector(Chrome/Edge/三星等): ML Kit 硬件加速,毫秒级识别
 * - 引擎2(回退): @zxing/browser(纯JS解码): iPhone Safari / OPPO浏览器 / Firefox 等用
 *   原生引擎连续解码异常时也会自动切到 zxing
 */
export function BarcodeScanner({ open, onClose, onResult, title = "扫描条形码", hint }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const rafRef = useRef(0);
  const vfcRef = useRef(0);
  const firedRef = useRef(false);
  // 用 ref 转发回调,避免父组件内联函数导致相机反复重启
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; });

  const [mode, setMode] = useState<ScanMode>("init");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    firedRef.current = false;
    setMode("init"); setError(""); setTorchOn(false); setTorchSupported(false);
    setZoomCaps(null); setZoom(1);

    const fire = (code: string) => {
      if (cancelled || firedRef.current || !code) return;
      firedRef.current = true;
      try { navigator.vibrate?.(80); } catch { /* 忽略 */ }
      onResultRef.current(code);
    };

    const cleanup = () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      const v = videoRef.current as (HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void }) | null;
      try { v?.cancelVideoFrameCallback?.(vfcRef.current); } catch { /* 忽略 */ }
      try { controlsRef.current?.stop(); } catch { /* 忽略 */ }
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    // ===== 引擎2: @zxing/browser 解码(自己持有流,约束可控) =====
    const startZxing = async (stream: MediaStream, video: HTMLVideoElement) => {
      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,   // 尽量密集地扫
        delayBetweenScanSuccess: 3000,
      });
      const controls = await reader.decodeFromStream(stream, video, (result) => {
        if (result) fire(result.getText().trim());
      });
      if (cancelled) { try { controls.stop(); } catch { /* 忽略 */ } return; }
      controlsRef.current = controls;
      setMode("zxing");
    };

    // ===== 引擎1: 原生 BarcodeDetector 逐帧检测,异常时自动降级 =====
    const startNative = async (Detector: BarcodeDetectorCtor, stream: MediaStream, video: HTMLVideoElement) => {
      const detector = new Detector({ formats: NATIVE_FORMATS });
      setMode("native");
      let consecutiveErrors = 0;
      const loop = async () => {
        if (cancelled) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && !firedRef.current) {
          try {
            const codes = await detector.detect(v);
            consecutiveErrors = 0;
            const hit = codes.find((c) => c.rawValue && c.rawValue.trim());
            if (hit) { fire(hit.rawValue.trim()); return; }
          } catch {
            // 原生引擎不可用(部分魔改浏览器暴露了构造器但底层缺失): 连续30次异常则降级 zxing
            if (++consecutiveErrors >= 30) { await startZxing(stream, video).catch(() => {}); return; }
          }
        }
        if (cancelled) return;
        const el = videoRef.current as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }) | null;
        if (el?.requestVideoFrameCallback) vfcRef.current = el.requestVideoFrameCallback(() => { loop(); });
        else rafRef.current = requestAnimationFrame(() => { loop(); });
      };
      loop();
    };

    (async () => {
      try {
        const video = videoRef.current;
        if (!video) throw new Error("video 元素未挂载");
        // 统一打开相机: 高分辨率 + 连续自动对焦(ideal/advanced 非必需,不支持自动降级)
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              advanced: [{ focusMode: "continuous" }],
            } as unknown as MediaTrackConstraints,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "environment" } });
        }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play().catch(() => {});

        // 检测手电筒/变焦能力(两种引擎共用)
        const track = stream.getVideoTracks()[0];
        let torch = false, zc: { min: number; max: number } | null = null;
        try {
          const caps = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean; zoom?: { min?: number; max?: number } }) | undefined;
          if (caps?.torch) torch = true;
          if (caps?.zoom && typeof caps.zoom === "object" && caps.zoom.max && caps.zoom.max > (caps.zoom.min ?? 1)) {
            zc = { min: caps.zoom.min ?? 1, max: caps.zoom.max };
          }
        } catch { /* 忽略 */ }
        // getCapabilities 不完整的浏览器(如OPPO浏览器): 尝试直接应用 zoom 探测支持
        if (!zc) {
          try {
            await track.applyConstraints({ advanced: [{ zoom: 1 }] } as unknown as MediaTrackConstraints);
            zc = { min: 1, max: 4 };
          } catch { /* 不支持变焦 */ }
        }
        if (torch) setTorchSupported(true);
        if (zc) setZoomCaps(zc);

        // 选择解码引擎
        const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (Detector) await startNative(Detector, stream, video);
        else await startZxing(stream, video);
      } catch (err) {
        if (cancelled) return;
        const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "未知错误";
        setError(/permission|denied|NotAllowed/i.test(msg)
          ? "相机权限被拒绝，请在浏览器设置中允许本站使用相机后重试"
          : `相机启动失败: ${msg}`);
        setMode("error");
      }
    })();

    return cleanup;
  }, [open, retryKey]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as unknown as MediaTrackConstraints);
      setTorchOn(!torchOn);
    } catch { /* 忽略 */ }
  };

  const applyZoom = async (z: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: z }] } as unknown as MediaTrackConstraints);
      setZoom(z);
    } catch { /* 忽略 */ }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <style>{`@keyframes bc-scanline { 0%,100% { top: 10%; } 50% { top: 88%; } }`}</style>

      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-extrabold text-base">{title}</h3>
          {mode === "native" && <span className="px-1.5 py-0.5 rounded-md bg-green-500/90 text-white text-[10px] font-bold">高速</span>}
          {mode === "zxing" && <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/90 text-gray-900 text-[10px] font-bold">兼容</span>}
        </div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl border-[3px] border-gray-900 bg-white text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[1px] transition-all"
          aria-label="关闭扫码"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 取景区 */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted autoPlay playsInline />

        {/* 扫描框 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-[85%] max-w-md h-[180px]">
            <div className="absolute inset-0 rounded-xl border-[3px] border-red-500/90" />
            <div className="absolute -top-[3px] -left-[3px] h-6 w-6 border-t-[5px] border-l-[5px] border-red-500 rounded-tl-xl" />
            <div className="absolute -top-[3px] -right-[3px] h-6 w-6 border-t-[5px] border-r-[5px] border-red-500 rounded-tr-xl" />
            <div className="absolute -bottom-[3px] -left-[3px] h-6 w-6 border-b-[5px] border-l-[5px] border-red-500 rounded-bl-xl" />
            <div className="absolute -bottom-[3px] -right-[3px] h-6 w-6 border-b-[5px] border-r-[5px] border-red-500 rounded-br-xl" />
            <div
              className="absolute left-[6%] w-[88%] h-[3px] bg-red-500 rounded-full shadow-[0_0_12px_2px_rgba(239,68,68,0.8)]"
              style={{ animation: "bc-scanline 2s ease-in-out infinite" }}
            />
          </div>
        </div>

        {/* 错误提示 */}
        {mode === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 bg-black/80">
            <p className="text-sm font-bold text-red-400 text-center">{error}</p>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="px-5 py-2.5 rounded-xl border-[3px] border-gray-900 bg-[#FFC93C] text-gray-900 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] transition-all"
            >
              重试
            </button>
          </div>
        )}
      </div>

      {/* 底部控制区 */}
      <div className="flex flex-col items-center gap-3 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {torchSupported && (
          <button
            onClick={toggleTorch}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-[3px] border-gray-900 font-extrabold text-sm shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] transition-all ${
              torchOn ? "bg-[#FFC93C] text-gray-900" : "bg-white text-gray-900"
            }`}
          >
            {torchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
            <span>{torchOn ? "关闭手电筒" : "打开手电筒"}</span>
          </button>
        )}

        {zoomCaps && (
          <div className="flex items-center gap-3 w-full max-w-xs">
            <ZoomOut className="h-4 w-4 text-white shrink-0" />
            <input
              type="range"
              min={zoomCaps.min}
              max={zoomCaps.max}
              step={(zoomCaps.max - zoomCaps.min) / 20 || 0.1}
              value={zoom}
              onChange={(e) => applyZoom(Number(e.target.value))}
              className="flex-1 accent-[#FFC93C]"
              aria-label="变焦"
            />
            <ZoomIn className="h-4 w-4 text-white shrink-0" />
          </div>
        )}

        <p className="text-xs text-white/70 text-center">
          {hint || "将条形码对准扫描框，识别成功自动填入"}
        </p>
        {mode === "zxing" && (
          <p className="text-[11px] text-yellow-200/60 text-center">
            当前为兼容模式，识别较慢。安卓手机建议用 Chrome / Edge 浏览器打开可获得极速扫码
          </p>
        )}
        {mode === "native" && (
          <p className="text-[11px] text-white/40 text-center">离太近模糊时可稍拉远，或用变焦放大条形码</p>
        )}
      </div>
    </div>
  );
}
