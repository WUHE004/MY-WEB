// 总表聚合数据服务端内存缓存: TTL 45s 兜底 + 高频写路由主动失效
// 高频写入口成功写入后调用 invalidateSummaryCache() 立即失效:
//   - sales-summary.upsertSalesSummary(售卖录入/编辑/批量导入/网单/微信 webhook 售卖流的汇总点)
//   - return-records / inbound-records / product-display 的写接口
// 其余低频写入口(月度清理 cron 等)由 TTL 兜底, 最长 45s 后自动刷新
let cache: { at: number; data: unknown } | null = null;
const TTL_MS = 45_000;

export function getSummaryCache(): { at: number; data: unknown } | null {
  return cache && Date.now() - cache.at < TTL_MS ? cache : null;
}

export function setSummaryCache(data: unknown): void {
  cache = { at: Date.now(), data };
}

export function invalidateSummaryCache(): void {
  cache = null;
}
