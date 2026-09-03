// 前端图片压缩工具（Canvas）
// 关键点：iOS Safari 的 canvas.toBlob("image/webp") 会静默回退输出 PNG（quality 失效），
// 导致"压缩"后反而 500KB+。因此先检测浏览器 WebP 编码能力，不支持时改用 JPEG（Safari 完整支持 quality 压缩）。

// WebP 编码能力检测（结果缓存）：toDataURL 输出以 data:image/webp 开头才算支持
let webpEncodeSupport: boolean | null = null;

export function supportsWebpEncode(): boolean {
  if (webpEncodeSupport !== null) return webpEncodeSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    webpEncodeSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpEncodeSupport = false;
  }
  return webpEncodeSupport;
}

interface CompressOptions {
  /** 目标大小（字节），逐级压缩尽量不超标；所有级别都压不到时取最优结果 */
  target?: number;
  /** 最大宽度（px） */
  maxWidth?: number;
  /** 起始质量（仅支持 WebP 时生效的起始档，JPEG 固定从 0.78 开始） */
  quality?: number;
}

/**
 * Canvas 压缩图片为 File。
 * - 支持 WebP 编码（安卓/Chrome/Edge）：输出 .webp
 * - 不支持（iOS Safari/Firefox 等）：输出 .jpg（JPEG 有损压缩，quality 生效）
 * - canvas 不可用 / 图片加载失败：返回原文件
 */
export function compressImageFile(file: File, options: CompressOptions = {}): Promise<File> {
  const TARGET = options.target ?? 100 * 1024;
  const MAX_WIDTH = options.maxWidth ?? 800;
  const useWebp = supportsWebpEncode();
  const mime = useWebp ? "image/webp" : "image/jpeg";
  const ext = useWebp ? ".webp" : ".jpg";
  const newExt = (blobMime: string) => (blobMime === "image/webp" ? ".webp" : ".jpg");

  return new Promise((resolve) => {
    // 已小于目标大小的不压缩
    if (file.size <= TARGET) {
      resolve(file);
      return;
    }

    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // 加载失败，使用原文件
    };

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file); // canvas 不可用，直接上传原文件
        return;
      }

      // 基准缩放：限制最大宽度
      const baseScale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;

      const draw = (scale: number) => {
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };

      // 逐级压缩：先固定尺寸降质量，仍超标则逐步缩小尺寸
      const q0 = options.quality ?? 0.8;
      const steps: Array<{ scale: number; quality: number }> = useWebp
        ? [
            { scale: 1, quality: q0 },
            { scale: 1, quality: 0.6 },
            { scale: 0.8, quality: 0.65 },
            { scale: 0.6, quality: 0.6 },
          ]
        : [
            // JPEG 起始质量稍低（同尺寸下 JPEG 比 WebP 大 25-35%）
            { scale: 1, quality: 0.78 },
            { scale: 1, quality: 0.62 },
            { scale: 0.8, quality: 0.65 },
            { scale: 0.6, quality: 0.6 },
          ];

      let lastBlob: Blob | null = null;
      let attempt = 0;
      const tryCompress = () => {
        if (attempt >= steps.length) {
          // 所有级别压不到目标：用最优结果（已远比原图小），否则原文件
          if (lastBlob && lastBlob.size > 0 && lastBlob.size < file.size) {
            console.log(`[压缩-兜底] ${(file.size / 1024).toFixed(1)}KB → ${(lastBlob.size / 1024).toFixed(1)}KB`);
            resolve(new File([lastBlob], file.name.replace(/\.[^.]+$/, newExt(lastBlob.type)), { type: lastBlob.type }));
          } else {
            resolve(file);
          }
          return;
        }
        const { scale, quality } = steps[attempt++];
        draw(baseScale * scale);
        canvas.toBlob(
          (blob) => {
            lastBlob = blob;
            if (blob && blob.size > 0 && blob.size <= TARGET) {
              console.log(`[压缩] ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB (scale=${scale}, q=${quality}, ${blob.type})`);
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, newExt(blob.type)), { type: blob.type }));
            } else {
              tryCompress();
            }
          },
          mime,
          quality
        );
      };

      tryCompress();
    };

    img.src = url;
  });
}

/**
 * 简单单步压缩：限宽 + 固定质量（不做逐级目标压缩）。
 * 同样自动检测 WebP 编码能力，Safari 回退 JPEG。
 */
export function compressImageFileSimple(file: File, maxWidth = 800, quality = 0.75): Promise<File> {
  const useWebp = supportsWebpEncode();
  const mime = useWebp ? "image/webp" : "image/jpeg";

  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ext), { type: blob.type }));
      }, mime, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
