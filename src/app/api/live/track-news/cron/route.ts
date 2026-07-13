import { NextRequest, NextResponse } from "next/server";
import { generateTrackNews } from "../route";

const CRON_SECRET = process.env.CRON_SECRET || "";

// Vercel Cron 自动触发入口
// vercel.json: { "crons": [{ "path": "/api/live/track-news/cron", "schedule": "0 19 * * *" }] }
// UTC 19:00 = 北京时间 03:00
export async function GET(request: NextRequest) {
  try {
    // 鉴权：CRON_SECRET 已配置时校验 Authorization header
    if (CRON_SECRET) {
      const authHeader = request.headers.get("authorization") || "";
      const expected = `Bearer ${CRON_SECRET}`;
      if (authHeader !== expected) {
        return NextResponse.json({ error: "未授权" }, { status: 401 });
      }
    }

    // 上海时区当日日期
    const now = new Date();
    const shanghai = new Date(now.getTime() + 8 * 3600 * 1000);
    const today = shanghai.toISOString().slice(0, 10);

    console.log(`[track-news cron] 开始生成 ${today} 资讯...`);
    const { data, diagnostics } = await generateTrackNews(today);
    console.log(`[track-news cron] 完成: diagnostics=${JSON.stringify(diagnostics)}`);

    return NextResponse.json({
      success: data != null,
      date: today,
      diagnostics,
    });
  } catch (err) {
    console.error("[track-news cron] 异常:", err);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
