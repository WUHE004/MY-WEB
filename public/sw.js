// Service Worker - 版本化缓存策略
// 版本号变更后浏览器会自动更新 SW 并清除旧缓存
// v2.0.0: 强制更新版本 —— 旧版本用户打开页面时 SW 自动升级,
// 激活后清空全部历史缓存(含所有旧命名的缓存), 配合页面 60 秒版本心跳彻底摆脱旧版本
// v2.0.1: 修复部署后 SPA 内导航仍渲染旧页面 —— RSC 数据请求(?_rsc=/RSC:1 头)
// URL 不带内容 hash, 新旧构建间相同, 原 Cache First 会永久命中旧缓存; 改为 Network First
// v2.0.2: 图片请求彻底失败时不再返回 1x1 透明 PNG 占位图 —— 200 响应会让 <img> onLoad
// "假成功"(NeoImage 以为加载完, 永久空白且不重试, 即 iPhone Safari 入库后看不到图);
// 改为 Response.error() 让 <img> 走 onError, 由 NeoImage 自动重试机制接管恢复
const SW_VERSION = "v2.0.2";
const STATIC_CACHE = `static-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;
const IMG_CACHE = `img-${SW_VERSION}`;

// 静态资源路径（Cache First 策略）
const STATIC_PATHS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

// 图片请求识别：按请求目标类型或 URL 扩展名
const isImageRequest = (url, request) => {
  if (request.destination === "image") return true;
  return /\.(png|jpe?g|webp|gif|avif|svg|ico)(\?|$)/i.test(url.pathname + url.search);
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_PATHS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== RUNTIME_CACHE && name !== IMG_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 只处理 GET 请求
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // API 请求：Network Only（不缓存，保证数据实时性）
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  // 图片请求（含 Supabase Storage 跨域商品图）：Cache First
  // Supabase 强制返回 cache-control: no-cache，浏览器 HTTP 缓存失效，
  // 由 SW 缓存兜底；文件名唯一(timestamp_random.ext)永不复用，可安全长缓存。
  // 注意：若同名覆盖重传图片（upsert），需提升 SW_VERSION 清空缓存。
  if (isImageRequest(url, request)) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached) return cached;
        try {
          // 以 cors 模式重新请求：Supabase 公开对象返回 ACAO:*，
          // 可获得真实状态码的可检视响应；避免 no-cors 的 opaque 响应
          // （状态恒为 0 无法校验，且浏览器按 MB 级填充计费占用配额）
          const response = await fetch(request.url, { mode: "cors", credentials: "omit" });
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          // cors 模式失败时按原请求直通（不缓存）
          try {
            return await fetch(request);
          } catch (e) {
            // 网络彻底失败: 返回网络错误, 让 <img> 触发 onError → NeoImage 自动重试。
            // (不能用 200 透明占位图假成功 —— 那会让上层以为加载完成, 永久空白不重试)
            return Response.error();
          }
        }
      })
    );
    return;
  }

  // 导航请求（HTML 页面）：Network First，确保用户看到最新页面
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 成功响应缓存到 runtime cache
          if (response.ok && response.type === "basic") {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // 网络失败时回退到缓存（离线场景）
          return caches.match(request).then((cached) => {
            return cached || caches.match("/");
          });
        })
    );
    return;
  }

  // Next.js App Router 客户端导航的 RSC 数据请求(?_rsc= 参数 或 RSC:1 请求头):
  // Network First —— 该 URL 不带内容 hash, 新旧构建间完全相同,
  // 若走 Cache First 会永久命中部署前的旧数据, 导致部署后 SPA 内导航仍渲染旧页面
  if (url.origin === self.location.origin && (url.searchParams.has("_rsc") || (request.headers.get("rsc") || "") === "1")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request, { ignoreVary: true }).then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // 同源静态资源：Cache First + Network Fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // 成功的响应缓存到 runtime cache
          if (response.ok && response.type === "basic") {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
          }
          return response;
        });
      })
    );
  }
});

// 接收 SKIP_WAITING 消息，立即激活新 SW
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
