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
  const now = new Date();
  const shanghai = new Date(now.getTime() + 8 * 3600 * 1000);
  return shanghai.toISOString().slice(0, 10);
}

// 调用 Agnes 生成 Markdown 报告
async function generateReport(rawResults: TavilyResult[], today: string): Promise<string> {
  const truncated = JSON.stringify(rawResults).slice(0, 8000);
  const prompt = `你是抖音直播运营分析师。基于以下搜索结果，输出一份完整的当日（${today}）直播运营资讯报告。

要求结构化输出（Markdown）：
## 一、直播带货热门技巧（前 5 条，含留人/转化/话术）
## 二、热门直播间案例（前 5 个，含主播/品类/亮点）
## 三、直播留人方法（3-5 条可执行建议）
## 四、直播话术参考（开场/留人/促单/收尾 各 1 段）

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
  hot_techniques: Array<{ title: string; desc: string }>;
  hot_rooms: Array<{ anchor: string; category: string; highlight: string }>;
  retention_tips: Array<{ tip: string; desc: string }>;
  scripts: Array<{ scene: string; content: string }>;
}> {
  const prompt = `将下列 Markdown 报告转换为 JSON，仅输出 JSON 无其他文字。
格式：
{
  "hot_techniques": [{"title":"技巧","desc":"描述"}],
  "hot_rooms": [{"anchor":"主播","category":"品类","highlight":"亮点"}],
  "retention_tips": [{"tip":"方法","desc":"描述"}],
  "scripts": [{"scene":"场景","content":"话术内容"}]
}

报告：
${report.slice(0, 6000)}`;

  const res = await agnesFetch(`${AGNES_BASE}/chat/completions`, {
    model: "agnes-2.0-flash",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1500,
    temperature: 0.1,
  });
  if (!res.ok) return { hot_techniques: [], hot_rooms: [], retention_tips: [], scripts: [] };
  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content || "").trim();

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
    console.error("[live-news] JSON 解析失败:", err, "原文:", content.slice(0, 500));
    return { hot_techniques: [], hot_rooms: [], retention_tips: [], scripts: [] };
  }
}

// 主生成函数
export async function generateLiveNews(today: string): Promise<{
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

  // 1. 并行 Tavily 搜索（直播运营相关）
  const queries = [
    `抖音 直播带货 技巧 留人 ${today}`,
    `抖音 童装直播 热门直播间 案例 ${today}`,
    `抖音 直播 留人方法 转化率 ${today}`,
    `抖音 直播 话术 开场 促单 收尾 ${today}`,
    `童装直播 带货 话术 技巧 ${today}`,
    `抖音 直播 互动 引导 关注 ${today}`,
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
  const structured = await generateStructuredJSON(report).catch(() => ({
    hot_techniques: [], hot_rooms: [], retention_tips: [], scripts: [],
  }));
  diagnostics.push(`结构化: ${structured.hot_techniques.length} 技巧, ${structured.hot_rooms.length} 直播间, ${structured.retention_tips.length} 留人方法, ${structured.scripts.length} 话术`);

  // 4. upsert 到 live_sessions_news 表（onConflict: date）
  const row = {
    date: today,
    hot_techniques: structured.hot_techniques,
    hot_rooms: structured.hot_rooms,
    retention_tips: structured.retention_tips,
    scripts: structured.scripts,
    category_insights: report,
    raw_search_results: rawResults,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from("live_sessions_news")
    .upsert(row, { onConflict: "date" })
    .select()
    .single();

  if (error) {
    diagnostics.push(`upsert 失败: ${error.message}`);
    return { data: null, diagnostics };
  }

  diagnostics.push("已写入 live_sessions_news 表");
  return { data: saved, diagnostics };
}

// GET: 读取当日数据
export async function GET() {
  try {
    const today = todayStr();
    const { data, error } = await supabase
      .from("live_sessions_news")
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
    console.error("[live-news GET] 异常:", err);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}

// POST: 手动触发生成
export async function POST() {
  try {
    const today = todayStr();
    const { data, diagnostics } = await generateLiveNews(today);
    return NextResponse.json({ data, today, diagnostics });
  } catch (err) {
    console.error("[live-news POST] 异常:", err);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}

// 注意：修复上方 row 对象中 scripts 字段引用错误（应为 structured.scripts）
// 此处导出供 cron 路由复用
export { generateLiveNews as generateLiveSessionsNews };
