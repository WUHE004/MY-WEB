"use client";

import { useEffect, useRef } from "react";

// 商品图片后台预载器(弱网自愈配套):
// 页面数据就绪后延迟数秒, 以低并发(2张)把所有商品图逐张 fetch 一遍 ——
// - 已在 Service Worker 缓存: SW 直接返回缓存, 不产生网络请求(纯本地, 开销可忽略)
// - 未缓存: SW 下载并写入缓存(自带 20s 超时 + 断流自动重试)
// - 失败跳过, 下次进页面自动补载(已缓存的会被跳过)
// 效果: 移动宽带弱网客户进页面攒几次后, 所有商品图本地秒开。
// 图片数增多(新上架)会自动重新补载; 数量不变则不重复跑。
export function PhotoPreloader({
  photos,
  delayMs = 6000,
}: {
  photos: Array<string | null | undefined>;
  delayMs?: number;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const urls = Array.from(
      new Set(
        (photos || [])
          .filter((p): p is string => typeof p === "string" && p.length > 0)
          .map((p) => (p.startsWith("http") ? p : `${origin}${p.startsWith("/") ? "" : "/"}${p}`))
      )
    ).filter((u) => u.startsWith(origin)); // 只预载本站图片(才能吃到自家 SW 缓存)
    if (urls.length === 0 || urls.length === lastCountRef.current) return;
    lastCountRef.current = urls.length;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void preloadAll(urls);
    }, delayMs);
  }, [photos, delayMs]);

  // 卸载时才取消定时器; 平时 re-render 不打断已排定的预载
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return null;
}

async function preloadAll(urls: string[]) {
  const CONCURRENCY = 2; // 低并发: 不挤占用户正在浏览的图片/数据请求
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        await fetch(url); // 不读响应体; 命中 SW/HTTP 缓存时无网络开销
      } catch {
        // 网络彻底失败: 跳过, 下次进页面时自动补载
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
}
