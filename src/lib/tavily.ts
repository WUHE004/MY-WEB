/**
 * Tavily AI Search 客户端封装
 * 文档：https://docs.tavily.com/documentation/api-reference/endpoint/search
 * 免费配额 1000 次/月，专为 LLM 设计
 */

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilyResponse {
  answer?: string;
  results: TavilyResult[];
}

/**
 * 执行 Tavily 搜索
 * @param query 搜索查询
 * @param maxResults 最大结果数（默认 5）
 * @returns 搜索结果数组
 */
export async function tavilySearch(query: string, maxResults = 5): Promise<TavilyResult[]> {
  if (!TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY 未配置");
  }

  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      max_results: maxResults,
      search_depth: "advanced",
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Tavily 调用失败 (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as TavilyResponse;
  return data.results || [];
}

/**
 * 并行执行多个 Tavily 搜索
 * @param queries 查询数组
 * @param maxResults 每个查询的最大结果数
 * @returns 所有查询合并的结果数组
 */
export async function tavilyMultiSearch(queries: string[], maxResults = 5): Promise<TavilyResult[]> {
  const results = await Promise.all(
    queries.map((q) =>
      tavilySearch(q, maxResults).catch((err) => {
        console.error(`[Tavily] 查询失败: "${q}"`, err.message);
        return [] as TavilyResult[];
      })
    )
  );
  return results.flat();
}
