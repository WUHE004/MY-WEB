// Service Worker - 版本化缓存策略
// 版本号变更后浏览器会自动更新 SW 并清除旧缓存
const SW_VERSION = "v1.0.0";
const STATIC_CACHE = `static-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;

// 静态资源路径（Cache First 策略）
const STATIC_PATHS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

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
          .filter((name) => name !== STATIC_CACHE && name !== RUNTIME_CACHE)
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
  if (url.pathname.startsWith("/api/")) {
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
