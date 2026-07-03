"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[全局错误边界]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="max-w-md w-full">
        <div className="rounded-2xl border-[3px] border-gray-900 bg-white p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-red-100 border-2 border-red-300">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <h1 className="text-xl font-extrabold text-gray-900">页面出错了</h1>
          </div>
          <p className="text-sm text-gray-500 font-medium mb-6">
            页面遇到了意外错误，请尝试重新加载。如果问题持续存在，请联系管理员。
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 font-mono mb-4 break-all">
              错误代码: {error.digest}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border-[3px] border-gray-900 bg-gray-900 px-4 py-3 text-white font-bold hover:bg-gray-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              重试
            </button>
            <a
              href="/"
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border-[3px] border-gray-900 bg-white px-4 py-3 text-gray-900 font-bold hover:bg-gray-100 transition-colors"
            >
              <Home className="h-4 w-4" />
              首页
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
