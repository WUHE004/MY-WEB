"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";

export interface NeoModalProps {
  open: boolean;
  onClose: () => void;
  /** 弹窗标题(含右上角关闭按钮区域) */
  title?: ReactNode;
  children: ReactNode;
  /** 底部操作区(可选) */
  footer?: ReactNode;
  /** 内容最大宽度 tailwind 类, 默认 max-w-md */
  maxWidthClass?: string;
  /**
   * 点击遮罩是否允许关闭。
   * 默认 false——弹窗内有表单/未保存输入时保持 false 防止误触丢数据;
   * 纯展示类弹窗(如二维码预览)可传 true。
   */
  closeOnOverlay?: boolean;
  /** 按 Esc 是否关闭, 默认 true */
  closeOnEsc?: boolean;
  /** 隐藏右上角关闭按钮 */
  hideClose?: boolean;
  /** 覆盖默认层级(默认 z-[110]) */
  zIndexClass?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 全站统一的通用弹窗(Neubrutalism 风格)。
 * - 遮罩淡入 + 内容上滑入场(手机端为底部抽屉 y:"100%"→0, 桌面端 y:24→0)
 * - AnimatePresence 退场动画
 * - Esc 关闭 / 焦点陷阱 / 背景滚动锁
 * - 遮罩点击默认不关闭(防误触), 需要时传 closeOnOverlay
 */
export function NeoModal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidthClass = "max-w-md",
  closeOnOverlay = false,
  closeOnEsc = true,
  hideClose = false,
  zIndexClass = "z-[110]",
}: NeoModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // 断点检测: <640px 视为手机, 用底部抽屉形态
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 背景滚动锁
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc 关闭 + 焦点陷阱
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEsc) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    // 打开后把焦点移入弹窗
    const t = window.setTimeout(() => panelRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
    };
  }, [open, closeOnEsc, onClose]);

  const sheet = isMobile;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="neo-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => {
            if (closeOnOverlay) onClose();
          }}
          role="dialog"
          aria-modal="true"
          className={`fixed inset-0 ${zIndexClass} flex ${sheet ? "items-end" : "items-center"} justify-center bg-black/50 p-0 ${sheet ? "" : "p-4"}`}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={sheet ? { y: "100%" } : { opacity: 0, y: 24, scale: 0.97 }}
            animate={sheet ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={sheet ? { y: "100%" } : { opacity: 0, y: 24, scale: 0.97 }}
            transition={sheet ? { type: "spring", stiffness: 380, damping: 36 } : { type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => {
              // 容器获得焦点时把焦点交给第一个可交互元素, 保证 Tab 循环从头开始
              if (e.target === panelRef.current) {
                const el = panelRef.current.querySelector<HTMLElement>(FOCUSABLE);
                el?.focus();
              }
            }}
            className={`w-full ${maxWidthClass} max-h-[85vh] overflow-y-auto outline-none ${
              sheet
                ? "rounded-t-3xl"
                : "rounded-2xl"
            } border-[3px] border-gray-900 bg-white p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]`}
          >
            {/* 手机端顶部拖拽指示条 */}
            {sheet && <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden />}

            {title && (
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="min-w-0 text-lg font-extrabold text-gray-900">{title}</h3>
                {!hideClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="关闭"
                    className="shrink-0 rounded-lg p-1 text-gray-500 hover:bg-gray-100 active:bg-gray-200"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
            )}

            {children}

            {footer && <div className="mt-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
