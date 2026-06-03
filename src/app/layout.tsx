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
  title: "库存管家 - 电商库存管理",
  description: "高效管理您的电商库存、链接、财务和账号运营",
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
      <body className="min-h-full flex flex-col md:flex-row bg-white">
        <HeartbeatProvider>
          <Navigation />
          <main className="flex-1 md:ml-[72px] pb-16 md:pb-0 min-h-screen">
            {children}
          </main>
        </HeartbeatProvider>
      </body>
    </html>
  );
}
