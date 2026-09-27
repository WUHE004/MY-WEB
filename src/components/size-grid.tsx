"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { PulseOnChange } from "@/components/motion-primitives";

export interface SizeGridProps {
  /** 尺码列表(按展示顺序) */
  sizeList: number[];
  /** 各尺码当前数量, key 为尺码 */
  sizes: Record<number, number>;
  /** 点击 +/- 回调(页面侧负责钳制上限) */
  onDelta: (size: number, delta: number) => void;
  /** 直接输入数值回调(页面侧负责钳制上限) */
  onSetValue: (size: number, value: string) => void;
  /** 数量上限, 用于禁用 + 按钮; 不传视为无上限 */
  limitOf?: (size: number) => number;
  /** 禁用整格(如无库存); 不传视为全部可用 */
  disabledOf?: (size: number) => boolean;
  /**
   * 右上角角标文案(如 "库存:3" / "已售:2")。
   * 传入后格子顶部为"尺码+角标"两端布局; 不传为居中尺码布局(入库登记样式)。
   */
  badgeOf?: (size: number) => string;
  /** 居中布局下尺码下方的副标签(如 "剩余 5 件"), 需配合 accent="purple" 使用 */
  subLabelOf?: (size: number) => string;
  /** 强调色: purple 用于补录弹窗(数量>0 时紫框紫字) */
  accent?: "purple";
  /** 网格列数类名, 默认 3/7/7 */
  gridClassName?: string;
  /** 是否包裹数量变化脉冲动画, 默认 true */
  pulse?: boolean;
}

/**
 * 全站统一的尺码录入网格(sales / returns / inbound 复用)。
 * 手机 3 列 / 平板以上 7 列(可覆盖), -/数值/+ 三段布局, 数量变化脉冲反馈。
 */
export function SizeGrid({
  sizeList,
  sizes,
  onDelta,
  onSetValue,
  limitOf,
  disabledOf,
  badgeOf,
  subLabelOf,
  accent,
  gridClassName = "grid grid-cols-3 sm:grid-cols-7 lg:grid-cols-7 gap-2 lg:gap-3",
  pulse = true,
}: SizeGridProps) {
  const [focusedSize, setFocusedSize] = useState<number | null>(null);
  const isPurple = accent === "purple";

  return (
    <div className={gridClassName}>
      {sizeList.map((size) => {
        const qty = sizes[size] || 0;
        const disabled = disabledOf?.(size) ?? false;
        const limit = limitOf ? limitOf(size) : Infinity;
        const badge = badgeOf?.(size);
        const subLabel = subLabelOf?.(size);

        const cellCls = isPurple
          ? `rounded-xl border-[3px] p-1.5 lg:p-2 transition-colors ${qty > 0 ? "border-[#7B61FF] bg-purple-50" : "border-gray-900 bg-white"}`
          : `rounded-xl border-[3px] bg-white p-1.5 lg:p-2 transition-all ${
              disabled ? "border-gray-200 bg-gray-100 opacity-50" : "border-gray-900"
            }`;

        const body = (
          <>
            {badge !== undefined ? (
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] lg:text-xs font-extrabold ${disabled ? "text-gray-300" : "text-gray-500"}`}>
                  {size}
                </span>
                <span className={`text-[8px] lg:text-[10px] font-bold ${disabled ? "text-gray-300" : "text-gray-400"}`}>
                  {badge}
                </span>
              </div>
            ) : isPurple ? (
              <div className="text-center mb-1">
                <span className="text-[10px] lg:text-xs font-extrabold text-gray-900">{size}码</span>
                {subLabel && <p className="text-[9px] lg:text-[10px] text-gray-500">{subLabel}</p>}
              </div>
            ) : (
              <div className={`text-center text-[10px] lg:text-xs font-extrabold mb-1 ${qty > 0 ? "text-gray-900" : "text-gray-300"}`}>
                {size}
              </div>
            )}
            <div className="flex items-center gap-1 lg:gap-0.5">
              <button
                type="button"
                aria-label={`减少 ${size} 码数量`}
                disabled={disabled || qty <= 0}
                onClick={() => onDelta(size, -1)}
                className={`flex h-8 w-8 lg:h-6 lg:w-6 items-center justify-center rounded-md border-[2px] transition-all shrink-0 ${
                  !disabled && qty > 0
                    ? "border-gray-900 bg-[#FF6B7A] text-white active:scale-90"
                    : "border-gray-200 bg-gray-200 text-gray-300 cursor-not-allowed"
                }`}
              >
                <Minus className="h-4 w-4 lg:h-3 lg:w-3" />
              </button>
              <input
                type="text"
                inputMode="numeric"
                aria-label={`${size} 码数量`}
                disabled={disabled}
                value={disabled ? "" : focusedSize === size && qty === 0 ? "" : qty}
                onFocus={() => setFocusedSize(size)}
                onBlur={() => setFocusedSize(null)}
                onChange={(e) => onSetValue(size, e.target.value)}
                className={`w-full min-w-0 text-center text-xs lg:text-sm font-extrabold border-none outline-none bg-transparent ${
                  disabled
                    ? "text-gray-300"
                    : isPurple
                      ? qty > 0
                        ? "text-[#7B61FF]"
                        : "text-gray-300"
                      : "text-gray-900"
                }`}
              />
              <button
                type="button"
                aria-label={`增加 ${size} 码数量`}
                disabled={disabled || qty >= limit}
                onClick={() => onDelta(size, 1)}
                className={`flex h-8 w-8 lg:h-6 lg:w-6 items-center justify-center rounded-md border-[2px] transition-all shrink-0 ${
                  !disabled && qty < limit
                    ? "border-gray-900 bg-[#4CD964] text-white active:scale-90"
                    : "border-gray-200 bg-gray-200 text-gray-300 cursor-not-allowed"
                }`}
              >
                <Plus className="h-4 w-4 lg:h-3 lg:w-3" />
              </button>
            </div>
          </>
        );

        if (pulse && !isPurple) {
          return (
            <PulseOnChange key={size} value={qty} className={cellCls}>
              {body}
            </PulseOnChange>
          );
        }
        return (
          <div key={size} className={cellCls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
