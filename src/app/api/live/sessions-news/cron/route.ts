import { NextRequest, NextResponse } from "next/server";
import { generateLiveNews } from "../route";

const CRON_SECRET = process.env.CRON_SECRET || "";

// Vercel Cron 自动触发入口
// vercel.json: { "path": "/api/live/sessions-news/cron", "schedule": "30 19 * * *" }
// UTC 19:30 = 北京时间 03:30（避开赛道资讯的 03:00）
export async function GET(request: NextRequest) {
  try {
    if (CRON_SECRET) {
      const authHeader = request.headers.get("authorization") || "";
      const expected = `Bearer ${CRON_SECRET}`;
      if (authHeader !== expected) {
        return NextResponse.json({ error: "未授权" }, { status: 401 });
      }
    }

    const now = new Date();
    const shanghai = new Date(now.getTime() + 8 * 3600 * 1000);
    const today = shanghai.toISOString().slice(0, 10);

    console.log(`[live-news cron] 开始生成 ${today} 直播资讯...`);
    const { data, diagnostics } = await generateLiveNews(today);
    console.log(`[live-news cron] 完成: diagnostics=${JSON.stringify(diagnostics)}`);

    return NextResponse.json({
      success: data != null,
      date: today,
      diagnostics,
    });
  } catch (err) {
    console.error("[live-news cron] 异常:", err);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
