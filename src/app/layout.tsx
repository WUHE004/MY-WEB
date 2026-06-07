import type { Metadata } from "next";
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="点冰童装" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#FF6B7A" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              }
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
