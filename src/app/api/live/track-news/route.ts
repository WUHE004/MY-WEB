import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { tavilyMultiSearch, type TavilyResult } from "@/lib/tavily";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

// 503 重试包装
async function agnesFetch(url: string, body: unknown, retries = 3): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (res.status === 503 && retries > 0) {
    await new Promise((r) => setTimeout(r, 3000));
    return agnesFetch(url, body, retries - 1);
  }
  return res;
}

function todayStr(): string {
  // 用上海时区取当日日期
  const now = new Date();
  const shanghai = new Date(now.getTime() + 8 * 3600 * 1000);
  return shanghai.toISOString().slice(0, 10);
}

// 调用 Agnes 生成 Markdown 报告
async function generateReport(rawResults: TavilyResult[], today: string): Promise<string> {
  const truncated = JSON.stringify(rawResults).slice(0, 8000);
  const prompt = `你是童装母婴赛道抖音运营分析师。基于以下搜索结果，输出一份完整的当日（${today}）赛道资讯报告。

要求结构化输出（Markdown）：
## 一、热门话题（前 10，含热度指数与简述）
## 二、前十抖音主播（昵称/粉丝数/直播时间/主打品类）
## 三、抖音热门话题标签（含使用量趋势）
## 四、童装类目运营参考（3-5 条可执行建议，对标分析）

搜索结果：
${truncated}

请基于搜索结果输出，搜索结果未覆盖的内容请合理标注"暂无数据"。中文输出。`;

  const res = await agnesFetch(`${AGNES_BASE}/chat/completions`, {
    model: "agnes-2.0-flash",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2000,
    temperature: 0.3,
  });
  if (!res.ok) throw new Error(`Agnes 报告生成失败 (${res.status})`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// 调用 Agnes 生成结构化 JSON
async function generateStructuredJSON(report: string): Promise<{
  hot_topics: Array<{ topic: string; heat: string; desc?: string }>;
  top_anchors: Array<{ nickname: string; followers: string; live_time: string; category: string }>;
  douyin_hashtags: Array<{ tag: string; usage_count: string; trend: string }>;
}> {
  const prompt = `将下列 Markdown 报告转换为 JSON，仅输出 JSON 无其他文字。
格式：
{
  "hot_topics": [{"topic":"话题","heat":"热度指数","desc":"简述"}],
  "top_anchors": [{"nickname":"昵称","followers":"粉丝数","live_time":"直播时间","category":"主打品类"}],
  "douyin_hashtags": [{"tag":"#标签","usage_count":"使用量","trend":"趋势"}]
}

报告：
${report.slice(0, 6000)}`;

  const res = await agnesFetch(`${AGNES_BASE}/chat/completions`, {
    model: "agnes-2.0-flash",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1500,
    temperature: 0.1,
  });
  if (!res.ok) return { hot_topics: [], top_anchors: [], douyin_hashtags: [] };
  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content || "").trim();

  // 提取 JSON（兼容 ```json ``` 包裹）
  let jsonStr = content;
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("[track-news] JSON 解析失败:", err, "原文:", content.slice(0, 500));
    return { hot_topics: [], top_anchors: [], douyin_hashtags: [] };
  }
}

// 主生成函数（GET/POST 共用）
export async function generateTrackNews(today: string): Promise<{
  data: Record<string, unknown> | null;
  diagnostics: string[];
}> {
  const diagnostics: string[] = [];

  if (!TAVILY_API_KEY) {
    diagnostics.push("TAVILY_API_KEY 未配置");
    return { data: null, diagnostics };
  }
  if (!AGNES_API_KEY) {
    diagnostics.push("AGNES_API_KEY 未配置");
    return { data: null, diagnostics };
  }

  // 1. 并行 Tavily 搜索
  const queries = [
    `抖音 童装 母婴 热门话题 ${today}`,
    `抖音 童装直播 带货榜 头部主播 ${today}`,
    `童装 抖音 直播时间 黄金时段 ${today}`,
    `抖音 童装 热门话题标签 hashtag ${today}`,
    `童装母婴 抖音 选品 趋势 ${today}`,
    `童装直播 话术 留人技巧 ${today}`,
  ];
  diagnostics.push(`开始执行 ${queries.length} 个 Tavily 搜索...`);
  const rawResults = await tavilyMultiSearch(queries, 5);
  diagnostics.push(`Tavily 返回 ${rawResults.length} 条原始结果`);

  if (rawResults.length === 0) {
    diagnostics.push("Tavily 无结果，可能配额耗尽或网络异常");
    return { data: null, diagnostics };
  }

  // 2. Agnes 生成 Markdown 报告
  diagnostics.push("调用 Agnes 生成 Markdown 报告...");
  const report = await generateReport(rawResults, today).catch((err) => {
    diagnostics.push(`Agnes 报告生成失败: ${err.message}`);
    return "";
  });
  if (!report) {
    return { data: null, diagnostics };
  }
  diagnostics.push(`报告生成完成，长度 ${report.length}`);

  // 3. Agnes 生成结构化 JSON
  diagnostics.push("调用 Agnes 生成结构化 JSON...");
  const structured = await generateStructuredJSON(report).catch((err) => {
    diagnostics.push(`JSON 生成失败: ${err.message}`);
    return { hot_topics: [], top_anchors: [], douyin_hashtags: [] };
  });
  diagnostics.push(`结构化: ${structured.hot_topics.length} 话题, ${structured.top_anchors.length} 主播, ${structured.douyin_hashtags.length} 标签`);

  // 4. upsert 到 live_track_news 表（onConflict: date）
  const row = {
    date: today,
    hot_topics: structured.hot_topics,
    top_anchors: structured.top_anchors,
    douyin_hashtags: structured.douyin_hashtags,
    category_insights: report,
    raw_search_results: rawResults,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from("live_track_news")
    .upsert(row, { onConflict: "date" })
    .select()
    .single();

  if (error) {
    diagnostics.push(`upsert 失败: ${error.message}`);
    return { data: null, diagnostics };
  }

  diagnostics.push("已写入 live_track_news 表");
  return { data: saved, diagnostics };
}

// GET: 读取当日数据
export async function GET() {
  try {
    const today = todayStr();
    const { data, error } = await supabase
      .from("live_track_news")
      .select("*")
      .eq("date", today)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data,
      today,
      message: data ? null : "今日资讯尚未生成，点击刷新按钮生成",
    });
  } catch (err) {
    console.error("[track-news GET] 异常:", err);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}

// POST: 手动触发生成
export async function POST() {
  try {
    const today = todayStr();
    const { data, diagnostics } = await generateTrackNews(today);
    return NextResponse.json({ data, today, diagnostics });
  } catch (err) {
    console.error("[track-news POST] 异常:", err);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
