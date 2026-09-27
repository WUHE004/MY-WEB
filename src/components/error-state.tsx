"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  /** 错误标题, 默认 "加载失败" */
  title?: string;
  /** 补充说明 */
  message?: string;
  /** 重试回调; 提供时显示重试按钮 */
  onRetry?: () => void;
  /** 紧凑模式(用于卡片内部的小块区域) */
  compact?: boolean;
  className?: string;
}

/**
 * 统一错误态组件: 数据加载失败时显示明确的错误卡片 + 重试入口,
 * 替代"失败被伪装成没有数据"的假空态。
 */
export function ErrorState({ title = "加载失败", message, onRetry, compact = false, className = "" }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`${compact ? "p-3" : "p-4 sm:p-6"} flex flex-col items-center justify-center gap-2 rounded-xl border-[3px] border-dashed border-red-300 bg-red-50 text-center ${className}`}
    >
      <div className="flex items-center gap-1.5 text-red-600">
        <AlertTriangle className={compact ? "h-4 w-4" : "h-5 w-5"} />
        <span className={`${compact ? "text-xs" : "text-sm"} font-extrabold`}>{title}</span>
      </div>
      {message && <p className={`${compact ? "text-[11px]" : "text-xs"} text-red-500/80 font-bold`}>{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg border-[2px] border-gray-900 bg-white px-3 text-xs font-extrabold text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-gray-50 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重试
        </button>
      )}
    </div>
  );
}
