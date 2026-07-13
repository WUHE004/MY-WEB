import { NextResponse } from "next/server";

const AGNES_API_KEY = process.env.AGNES_API_KEY || "";
const AGNES_BASE = "https://apihub.agnes-ai.com/v1";

// 503 重试包装（最多3次，间隔3秒，复用 photo-gen 模式）
const AGNES_MAX_RETRIES = 3;
const AGNES_RETRY_DELAY_MS = 3000;

async function agnesFetch(url: string, body: unknown, retries = AGNES_MAX_RETRIES): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGNES_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (res.status === 503 && retries > 0) {
    console.log(`[Agnes shoot-script] 503 服务繁忙，剩余 ${retries} 次重试...`);
    await new Promise((r) => setTimeout(r, AGNES_RETRY_DELAY_MS));
    return agnesFetch(url, body, retries - 1);
  }
  return res;
}

export async function POST(request: Request) {
  try {
    if (!AGNES_API_KEY) {
      return NextResponse.json({ error: "Agnes API Key 未配置" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const idea = String(body?.idea || "").trim();

    // prompt 设计：有想法按想法生成完整脚本；无想法提供3个参考方案
    const prompt = idea
      ? `你是童装抖音直播拍摄导演。用户今日拍摄想法：${idea}

请输出完整拍摄脚本，包含以下6个部分：
1. 拍摄主题与目标受众
2. 场景布置（背景/灯光/道具）
3. 模特造型建议（服装搭配/姿势/表情，强调幼态可爱感）
4. 分镜脚本（5-8 个镜头，每个含时长/画面/旁白/字幕）
5. BGM 与音效建议
6. 预期互动钩子（点赞/评论引导点）

输出格式：Markdown，要点清晰可执行，中文输出。`
      : `你是童装抖音直播拍摄导演。用户暂无想法，请提供 3 个不同主题的童装拍摄参考方案供选择。

每个方案包含：
- 主题名称与目标受众
- 场景概述（背景/道具）
- 模特造型（服装搭配/姿势）
- 推荐分镜数量与时长
- BGM 风格
- 预期互动点

输出格式：Markdown，3 个方案用 "## 方案一/二/三" 分隔，中文输出。`;

    const res = await agnesFetch(`${AGNES_BASE}/chat/completions`, {
      model: "agnes-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1800,
      temperature: 0.7,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[shoot-script] Agnes 调用失败:", res.status, errText);
      return NextResponse.json(
        { error: `Agnes 调用失败 (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const script = data?.choices?.[0]?.message?.content || "";

    if (!script) {
      return NextResponse.json({ error: "Agnes 返回内容为空" }, { status: 502 });
    }

    return NextResponse.json({ script, idea });
  } catch (err) {
    console.error("[shoot-script] 异常:", err);
    return NextResponse.json({ error: "服务器异常" }, { status: 500 });
  }
}
