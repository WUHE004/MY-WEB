"use client";

import { useEffect, useRef } from "react";

export function HeartbeatProvider({ children }: { children: React.ReactNode }) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = async () => {
    // 页面不可见时跳过心跳（节省资源）
    if (typeof document !== "undefined" && document.hidden) return;

    const token = localStorage.getItem("member_token");
    const memberId = localStorage.getItem("member_phone");
    if (!token || !memberId) return;

    try {
      await fetch("/api/members/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ member_id: memberId }),
      });
    } catch {
      // 静默失败
    }
  };

  useEffect(() => {
    // 首次发送
    sendHeartbeat();
    // 每60秒发送一次心跳（从30秒延长到60秒减少资源消耗）
    intervalRef.current = setInterval(sendHeartbeat, 60000);

    // 页面从隐藏恢复到可见时立即发送一次心跳
    const handleVisibilityChange = () => {
      if (!document.hidden) sendHeartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 页面关闭时标记离线
    const handleBeforeUnload = () => {
      const token = localStorage.getItem("member_token");
      const memberId = localStorage.getItem("member_phone");
      if (token && memberId) {
        // sendBeacon 无法设置 Authorization header，改用 cookie
        // 用 Blob + type 使其成为 POST 请求
        const blob = new Blob(
          [JSON.stringify({ member_id: memberId, offline: true })],
          { type: "application/json" }
        );
        navigator.sendBeacon("/api/members/heartbeat", blob);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return <>{children}</>;
}
