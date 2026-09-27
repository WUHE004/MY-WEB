"use client";

import { useState } from "react";
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

/**
 * 全站统一的图片组件:
 * - 懒加载(lazy) + 加载中灰底 shimmer 占位
 * - 加载失败显示兜底图标, 不再直接露出破图
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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const canPreview = preview && !onClick && !error;

  return (
    <>
      <span
        className={`relative block overflow-hidden bg-gray-100 ${wrapperClassName}`}
        onClick={onClick}
      >
        {!loaded && !error && (
          <span className="absolute inset-0 animate-pulse bg-gray-200" aria-hidden />
        )}
        {error ? (
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
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            onClick={canPreview ? () => setPreviewOpen(true) : undefined}
            className={`${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-200 ${canPreview ? "cursor-zoom-in" : ""} ${className}`}
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
            src={src}
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
