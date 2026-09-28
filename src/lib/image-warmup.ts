// 上传后预热验证工具
//
// 背景: 图片刚传完存在"首次访问窗口期"——CDN 回源慢/网络抖动可能导致第一次加载失败,
// 而页面上的 <img> 没有自动重试(Safari 裸 img 失败只会显示 alt 文本, 如 "Preview"),
// 造成"入库成功但到处都看不到图片"。此工具在上传成功后先验证 URL 真正可访问,
// 确认无误(或重试耗尽)再把 URL 交给预览, 配合 NeoImage 的自动重试形成双保险。

const WARMUP_TIMEOUT = 8000;

async function fetchOnce(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WARMUP_TIMEOUT);
  try {
    // cache: "reload" 强制绕过 SW/HTTP 缓存直取网络, 验证真实可达性;
    // 成功后该响应也会回填 HTTP/SW 缓存, 后续 <img> 加载基本秒开
    const res = await fetch(url, { cache: "reload", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 验证图片 URL 可访问: 最多尝试 attempts 次, 每次间隔 intervalMs。
 * 返回是否至少成功一次; 全部失败时调用方仍可照常使用 URL(交给 NeoImage 自动重试兜底)。
 */
export async function warmupImageUrl(url: string, attempts = 3, intervalMs = 1500): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (await fetchOnce(url)) return true;
  }
  return false;
}
