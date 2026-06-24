"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode, useState, useEffect } from "react";

interface PageWrapperProps {
  children: ReactNode;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let toastId = 0;

// Toast 显示函数
export function showToast(message: string, type: "success" | "error" | "info" = "info") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("show-toast", { detail: { message, type } }));
  }
}

export function PageWrapper({ children }: PageWrapperProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: CustomEvent<{ message: string; type: "success" | "error" | "info" }>) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, message: e.detail.message, type: e.detail.type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    };

    window.addEventListener("show-toast", handler as EventListener);
    return () => window.removeEventListener("show-toast", handler as EventListener);
  }, []);

  const toastColors = {
    success: "bg-green-500 text-white",
    error: "bg-red-500 text-white",
    info: "bg-blue-500 text-white",
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="px-4 sm:px-6 lg:px-8 xl:px-10 py-4 sm:py-6 lg:py-8 max-w-[1600px] mx-auto"
      >
        {children}
      </motion.div>

      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={`${toastColors[toast.type]} px-6 py-3 rounded-xl border-[3px] border-gray-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold text-sm min-w-[200px] max-w-[400px]`}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
