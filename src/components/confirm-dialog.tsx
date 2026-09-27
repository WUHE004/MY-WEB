"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作显示红色确认按钮(默认 true) */
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 全站统一的二次确认弹窗(Neubrutalism 风格)。
 * 用于替换原生 confirm(): 危险操作(删除/清空/覆盖/重算)在执行前必须经过本弹窗确认。
 * 遮罩点击不关闭——防止误触导致确认/取消, 必须显式点按钮。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确定执行",
  cancelText = "取消",
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc 取消
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="w-full max-w-sm rounded-2xl border-[3px] border-gray-900 bg-white p-4 sm:p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-[3px] border-gray-900 ${
                  danger ? "bg-[#FF6B7A]" : "bg-[#4A90E2]"
                }`}
              >
                <AlertTriangle className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-gray-900">{title}</h3>
                {description && (
                  <p className="mt-1 text-xs font-medium leading-relaxed text-gray-500 whitespace-pre-line">
                    {description}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={onCancel}
                disabled={loading}
                className="flex-1 h-11 rounded-xl border-[3px] border-gray-900 bg-white text-sm font-extrabold text-gray-700 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 h-11 rounded-xl border-[3px] border-gray-900 text-sm font-extrabold text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50 ${
                  danger ? "bg-[#FF6B7A]" : "bg-[#4A90E2]"
                }`}
              >
                {loading ? "处理中..." : confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
