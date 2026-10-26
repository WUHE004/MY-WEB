import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/navigation";
import { HeartbeatProvider } from "@/components/heartbeat-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// viewport 必须用官方导出(不能在 <head> 手写 meta, 否则与 Next 自动注入的默认 meta 冲突,
// 微信 XWeb 内核遇到冲突 meta 可能回退 980px 布局视口导致整体 UI 缩小)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // minimumScale=1 关键: 微信 XWeb 内核在页面内容横向溢出时会自动把整页缩小到 1 以下,
  // 表现为"整体 UI 偏小"。显式禁止缩小到 1 以下即可保持 UI 原始尺寸
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "点冰童装",
  description: "点冰童装 - 精选优质童装，用心呵护每一个孩子",
  icons: {
    icon: "/images/girl.png",
    apple: "/images/girl.png",
  },
  openGraph: {
    title: "点冰童装",
    description: "点冰童装 - 精选优质童装，用心呵护每一个孩子",
    images: [
      {
        url: "/images/girl.png",
        width: 512,
        height: 512,
      },
    ],
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary",
    title: "点冰童装",
    description: "点冰童装 - 精选优质童装，用心呵护每一个孩子",
    images: ["/images/girl.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="点冰童装" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#FF6B7A" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // SW 仅生产环境注册: dev 下 Turbopack 的 chunk 文件名不随内容变化,
              // sw.js 对 JS 的 Cache First 会让页面永远命中旧缓存 JS(界面回退旧版 + hydration mismatch)
              var IS_DEV = "${process.env.NODE_ENV}" === "development";
              if (IS_DEV && 'serviceWorker' in navigator) {
                // dev 自愈: 注销已注册的旧 SW 并清空缓存, 完成后刷新一次拿最新代码
                navigator.serviceWorker.getRegistrations().then(function (rs) {
                  return Promise.all(rs.map(function (r) { return r.unregister(); }));
                }).then(function (removed) {
                  if (!removed.some(Boolean)) return;
                  return caches.keys().then(function (keys) {
                    return Promise.all(keys.map(function (k) { return caches.delete(k); }));
                  }).then(function () { window.location.reload(); });
                }).catch(function () {});
              }
              if (!IS_DEV && 'serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js?v=2.1.0').then((reg) => {
                    // 每次打开页面立即检查一次 SW 更新
                    reg.update().catch(() => {});
                    // 检测新版本 SW，自动激活
                    reg.addEventListener('updatefound', () => {
                      const newWorker = reg.installing;
                      if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            newWorker.postMessage('SKIP_WAITING');
                          }
                        });
                      }
                    });
                  }).catch(() => {});
                  // 新 SW 激活后自动刷新页面（加锁防止连续刷新）
                  let refreshing = false;
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (refreshing) return;
                    refreshing = true;
                    window.location.reload();
                  });
                });
              }
              // 版本心跳：服务端部署新版本后，已打开的旧页面在 60 秒内自动强刷到最新版
              (function () {
                var BV = "${process.env.NEXT_PUBLIC_BUILD_TS || ""}";
                if (!BV) return;
                var lastTry = 0;
                function hardRefresh() {
                  var now = Date.now();
                  if (now - lastTry < 60000) return; // 防刷新风暴：60 秒内只触发一次
                  lastTry = now;
                  var done = false;
                  var reload = function () { if (!done) { done = true; window.location.reload(); } };
                  setTimeout(reload, 3000); // 兜底：清理卡住时 3 秒后也强制刷新
                  var clearCaches = ('caches' in window)
                    ? caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
                    : Promise.resolve();
                  var unregisterSW = ('serviceWorker' in navigator)
                    ? navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })
                    : Promise.resolve();
                  clearCaches.then(unregisterSW).then(reload).catch(reload);
                }
                function checkVersion() {
                  if (document.hidden) return; // 页面隐藏时跳过, 切回前台由 visibilitychange 立即检查
                  fetch('/api/version', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
                    if (d && d.v && d.v !== BV) hardRefresh();
                  }).catch(function () {});
                }
                // 打开页面立即检查一次: 旧缓存页面 1-2 秒内强刷到新版
                // interval 仅作前台挂机兜底(5分钟), 发版感知主要靠切回前台立即检查
                checkVersion();
                setInterval(checkVersion, 300000);
                document.addEventListener('visibilitychange', function () {
                  if (!document.hidden) setTimeout(checkVersion, 500);
                });
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col md:flex-row bg-white">
        <HeartbeatProvider>
          <Navigation />
          <main className="flex-1 md:ml-[72px] pb-20 md:pb-0 min-h-screen">
            {children}
          </main>
        </HeartbeatProvider>
      </body>
    </html>
  );
}
