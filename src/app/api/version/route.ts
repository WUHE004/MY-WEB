import { NextResponse } from "next/server";

// 返回当前部署的构建时间戳
// 前端页面每 60 秒拉取一次，与页面内嵌的构建时间戳对比，
// 不一致则清空缓存并强刷页面（强制已打开的旧页面更新到最新部署版本）
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { v: process.env.NEXT_PUBLIC_BUILD_TS || "" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
