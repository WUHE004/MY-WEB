"use client";

import { useEffect, useRef } from "react";

export function HeartbeatProvider({ children }: { children: React.ReactNode }) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sendHeartbeat = async () => {
    const memberId = localStorage.getItem("member_phone");
    if (!memberId) return;

    try {
      await fetch("/api/members/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId }),
      });
    } catch {
      // 静默失败
    }
  };

  useEffect(() => {
    // 首次发送
    sendHeartbeat();
    // 每30秒发送一次心跳
    intervalRef.current = setInterval(sendHeartbeat, 30000);
    // 页面关闭时标记离线
    const handleBeforeUnload = () => {
      const memberId = localStorage.getItem("member_phone");
      if (memberId) {
        navigator.sendBeacon(
          "/api/members/heartbeat",
          JSON.stringify({ member_id: memberId, offline: true })
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return <>{children}</>;
}