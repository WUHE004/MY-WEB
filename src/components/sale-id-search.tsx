"use client";

import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

export interface SaleIdOption {
  /** 唯一标识(售卖编号) */
  key: string;
  /** 下拉主标题 */
  title: string;
  /** 下拉副标题 */
  subtitle: string;
  photoUrl?: string;
}

export interface SaleIdSearchProps {
  value: string;
  onValueChange: (v: string) => void;
  options: SaleIdOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (option: SaleIdOption) => void;
  /** 输入框获得焦点(父级决定是否重新展开下拉) */
  onInputFocus?: () => void;
  /** 失焦精确匹配解析(售卖/退货各自的业务逻辑) */
  onInputBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
}

/**
 * 售卖编号搜索下拉(sales / returns 复用)。
 * 封装输入框 + 下拉面板 + 点击外部关闭; 过滤与选中后的业务逻辑由页面注入。
 */
export function SaleIdSearch({
  value,
  onValueChange,
  options,
  open,
  onOpenChange,
  onSelect,
  onInputFocus,
  onInputBlur,
  onKeyDown,
  placeholder = "输入售卖编号搜索...",
}: SaleIdSearchProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击组件外部关闭下拉
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onBlur={onInputBlur}
          onKeyDown={onKeyDown}
          onFocus={onInputFocus}
          placeholder={placeholder}
          className="neo-input w-full text-sm pl-10"
        />
      </div>

      {open && options.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onMouseDown={(e) => {
                // 在输入框 blur(触发页面精确匹配)之前完成选中
                e.preventDefault();
                onSelect(opt);
              }}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b-2 border-gray-100 last:border-b-0 transition-colors"
            >
              <div className="flex items-center gap-3">
                {opt.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={opt.photoUrl}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover border-2 border-gray-200"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-extrabold text-gray-900 truncate">{opt.title}</div>
                  <div className="text-xs text-gray-500 truncate">{opt.subtitle}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
