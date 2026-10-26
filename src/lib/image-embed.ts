// 阿里云 DashScope 多模态向量封装 (tongyi-embedding-vision-flash, 768 维)
// 服务端使用: 传入图片 URL 或 dataURL, 统一先下载/取 base64 后调 API, 返回向量数组
import { Agent } from "undici";
import "@/lib/env";

const MODEL = "tongyi-embedding-vision-flash";
const ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding";

// 跨境直连 DashScope(上海) TLS 握手实测 0.4~1.2s, 而 Node fetch 连接池默认 4s 空闲即断,
// 两次搜索间隔稍长每次都要重新握手。用专用长寿命连接池 + 30s 心跳保活, 搜索时直接复用热连接
const dashAgent = new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000, connections: 4 });
let heartTimer: ReturnType<typeof setInterval> | null = null;
function ensureDashHeartbeat() {
  if (heartTimer) return;
  heartTimer = setInterval(() => {
    // HEAD 根路径仅用于保持 TLS 长连接, 状态码无关紧要
    void fetch("https://dashscope.aliyuncs.com/", { method: "HEAD", dispatcher: dashAgent } as unknown as RequestInit).catch(() => {});
  }, 30_000);
  (heartTimer as unknown as { unref?: () => void }).unref?.();
}
const dashFetch = (url: string, init: RequestInit) =>
  fetch(url, { ...init, dispatcher: dashAgent } as unknown as RequestInit);

// 单请求 contents 条数上限(flash 版多图限 8, 取 4 保守值)
export const EMBED_BATCH_SIZE = 4;

async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:image/")) return src;
  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new Error(`图片下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") || "image/jpeg";
  return `data:${type};base64,${buf.toString("base64")}`;
}

/**
 * 批量向量化图片(≤4 张/请求)。
 * @param sources 图片 URL / dataURL 数组
 * @returns 与输入顺序一致的 768 维向量数组; 单张失败时对应位置为 null
 */
export async function embedImages(sources: string[]): Promise<(number[] | null)[]> {
  const key = process.env.DASHSCOPE_API_KEY || "";
  if (!key) throw new Error("DASHSCOPE_API_KEY 未配置");
  ensureDashHeartbeat();

  // 先统一转 dataURL(阿里云境内服务器拉 Supabase 新加坡 URL 不稳, base64 最可靠)
  const dataUrls = await Promise.all(
    sources.map((s) => toDataUrl(s).catch(() => null))
  );

  // 按 4 张分组请求(该 API 每条 content 独立成向量, 顺序与输入一致)
  const out: (number[] | null)[] = new Array(sources.length).fill(null);
  for (let i = 0; i < sources.length; i += EMBED_BATCH_SIZE) {
    const groupIdx: number[] = [];
    const contents: Array<Record<string, string>> = [];
    for (let j = i; j < Math.min(i + EMBED_BATCH_SIZE, sources.length); j++) {
      if (dataUrls[j]) {
        contents.push({ image: dataUrls[j] as string });
        groupIdx.push(j);
      }
    }
    if (contents.length === 0) continue;

    // 503 偶发, 沿用全局重试策略: 最多 3 次, 间隔 2s
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await dashFetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: MODEL, input: { contents } }),
        });
        const json = await res.json();
        if (!res.ok || !json.output?.embeddings) {
          throw new Error(`DashScope HTTP ${res.status}: ${json.message || JSON.stringify(json).slice(0, 200)}`);
        }
        for (const emb of json.output.embeddings) {
          const pos = groupIdx[emb.index];
          if (pos !== undefined && Array.isArray(emb.embedding)) out[pos] = emb.embedding;
        }
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (lastErr) throw lastErr;
  }
  return out;
}
