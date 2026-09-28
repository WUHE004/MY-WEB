"use client";

import { useEffect, useState } from "react";
import { ImageOff, X } from "lucide-react";

export interface NeoImageProps {
  src: string;
  alt: string;
  /** 图片本体样式(容器内的 img 元素) */
  className?: string;
  /** 外层容器样式 */
  wrapperClassName?: string;
  /** 点击是否放大预览, 默认 true */
  preview?: boolean;
  /** 点击图片本身的业务回调(如跳转)。传入后自动禁用预览 */
  onClick?: () => void;
  altClass?: string;
}

// 加载失败自动重试间隔(ms): 1s / 4s / 10s
// 场景: 刚上传的图片存在"首次访问窗口期"(CDN 回源慢/网络抖动), 首次失败后
// 网络通常很快自愈; 自动重试让商品图在网络恢复后自动出现, 不用用户刷新页面
const RETRY_DELAYS = [1000, 4000, 10000];

/**
 * 全站统一的图片组件:
 * - 懒加载(lazy) + 加载中灰底 shimmer 占位
 * - 加载失败自动重试(最多 3 次, cache-bust 绕过可能的坏缓存), 耗尽才显示兜底图标
 * - 点击放大预览(业务方传了 onClick 则以业务回调优先)
 */
export function NeoImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  preview = true,
  onClick,
}: NeoImageProps) {
  const [imgState, setImgState] = useState<{ src: string; attempt: number; failed: boolean; loaded: boolean }>({
    src,
    attempt: 0,
    failed: false,
    loaded: false,
  });
  const [previewOpen, setPreviewOpen] = useState(false);

  // src 变化(如列表复用组件切换商品图)时重置加载状态(渲染期受控重置, React 官方推荐模式)
  if (imgState.src !== src) {
    setImgState({ src, attempt: 0, failed: false, loaded: false });
  }

  const gaveUp = imgState.failed && imgState.attempt >= RETRY_DELAYS.length;

  // 失败后按间隔自动重试
  useEffect(() => {
    if (!imgState.failed) return;
    if (imgState.attempt >= RETRY_DELAYS.length) return; // 重试耗尽, 维持失败兜底 UI
    const timer = setTimeout(() => {
      setImgState((s) => ({ ...s, attempt: s.attempt + 1, failed: false, loaded: false }));
    }, RETRY_DELAYS[imgState.attempt]);
    return () => clearTimeout(timer);
  }, [imgState]);

  // 重试时追加 cache-bust 参数(失败响应不会被 SW/HTTP 缓存, 序号足以绕开坏缓存)
  const renderSrc =
    imgState.attempt === 0
      ? src
      : `${src}${src.includes("?") ? "&" : "?"}r=${imgState.attempt}`;

  const canPreview = preview && !onClick && !gaveUp;

  return (
    <>
      <span
        className={`relative block overflow-hidden bg-gray-100 ${wrapperClassName}`}
        onClick={onClick}
      >
        {!imgState.loaded && !gaveUp && (
          <span className="absolute inset-0 animate-pulse bg-gray-200" aria-hidden />
        )}
        {gaveUp ? (
          <span
            className="flex h-full min-h-[48px] w-full flex-col items-center justify-center gap-1 bg-gray-100 text-gray-400"
            aria-label={`${alt} 图片加载失败`}
          >
            <ImageOff className="h-5 w-5" />
            <span className="px-1 text-[10px] font-bold leading-tight">图片加载失败</span>
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={renderSrc}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setImgState((s) => ({ ...s, loaded: true }))}
            onError={() => setImgState((s) => ({ ...s, failed: true, loaded: false }))}
            onClick={canPreview ? () => setPreviewOpen(true) : undefined}
            className={`${imgState.loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-200 ${canPreview ? "cursor-zoom-in" : ""} ${className}`}
          />
        )}
      </span>

      {/* 点击放大预览 */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} 预览`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={renderSrc}
            alt={alt}
            className="max-h-[85vh] max-w-full rounded-xl border-[3px] border-white/80 object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="关闭预览"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-lg active:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
