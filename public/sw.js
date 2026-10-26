// Service Worker - 版本化缓存策略
// 版本号变更后浏览器会自动更新 SW 并清除旧缓存
// v2.1.0: 弱网自愈升级(国内移动/电信宽带到新加坡服务器国际链路易断流):
//   1) /api/ GET 请求网络断流(fetch reject)或网关抖动(502/503/504)时自动重试 2 次,
//      每次重试都是全新 TCP 连接 —— 单次断流不再导致整页数据加载失败
//   2) 图片请求加 20 秒超时 + 失败换新连接重试一次, 防止弱网下单张图片无限挂起
// v2.0.2: 图片请求彻底失败时不再返回 1x1 透明 PNG 占位图 —— 200 响应会让 <img> onLoad
//   "假成功"(NeoImage 以为加载完, 永久空白且不重试); 改为 Response.error() 走 onError
// v2.0.1: 修复部署后 SPA 内导航仍渲染旧页面 —— RSC 数据请求改 Network First
// v2.0.0: 强制更新版本, 激活后清空全部历史缓存
const SW_VERSION = "v2.1.0";
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 超时信号(旧浏览器无 AbortSignal.timeout 时返回 undefined 即不限时)
const timeoutSignal = (ms) =>
  typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;

// 弱网重试: 网络断流(fetch reject)或 502/503/504 时重试, 每次重试建立全新连接
async function fetchWithRetry(request, { retries = 2, delays = [400, 1200], timeoutMs = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) await sleep(delays[Math.min(attempt - 1, delays.length - 1)]);
    const signal = timeoutMs > 0 ? timeoutSignal(timeoutMs) : undefined;
    try {
      const response = signal ? await fetch(request, { signal }) : await fetch(request);
      if (
        (response.status === 502 || response.status === 503 || response.status === 504) &&
        attempt < retries
      ) {
        continue; // 网关/上游抖动, 换连接重试
      }
      return response;
    } catch (err) {
      if (attempt >= retries) throw err; // 重试耗尽, 把网络错误抛回页面走应用层处理
    }
  }
}

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

  // API 请求：Network Only + 弱网自动重试（不缓存，保证数据实时性）
  // 移动宽带国际链路断流时浏览器 fetch 直接 reject, 原本表现为整页数据加载失败;
  // SW 层换新连接自动重试, 大部分瞬时断流可立即自愈
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetchWithRetry(request));
    return;
  }

  // 图片请求（含 Storage 商品图）：Cache First + 20 秒超时 + 断流重试一次
  // 文件名唯一(timestamp_random.ext)永不复用, 可安全长缓存。
  // 注意：若同名覆盖重传图片（upsert），需提升 SW_VERSION 清空缓存。
  if (isImageRequest(url, request)) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached) return cached;
        try {
          // 第一次: cors 模式(可校验真实状态码, 避免 opaque 响应), 20 秒超时防弱网挂死
          const signal = timeoutSignal(20000);
          const response = signal
            ? await fetch(request.url, { mode: "cors", credentials: "omit", signal })
            : await fetch(request.url, { mode: "cors", credentials: "omit" });
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          try {
            // 断流/超时: 按原请求换新连接重试一次
            const signal2 = timeoutSignal(20000);
            const retry = signal2 ? await fetch(request, { signal: signal2 }) : await fetch(request);
            if (retry.ok) {
              cache.put(request, retry.clone());
            }
            return retry;
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
