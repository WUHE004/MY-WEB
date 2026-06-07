/**
 * 检查 inbound_records 表中照片链接是否有无效图片
 * 用法: node scripts/check-broken-photos.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error("请设置 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 环境变量");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("正在查询 inbound_records 表...\n");

  // 分页查询所有有照片的入库记录
  let allRecords = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("inbound_records")
      .select("sale_id, photo")
      .not("photo", "is", null)
      .neq("photo", "")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("查询失败:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allRecords = allRecords.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`共找到 ${allRecords.length} 条有照片的记录\n`);

  // 去重照片 URL
  const uniquePhotos = [...new Set(allRecords.map((r) => r.photo))];
  console.log(`去重后共 ${uniquePhotos.length} 个唯一照片 URL\n`);

  // 批量检查照片 URL（每批 20 个并发）
  const brokenUrls = new Set();
  const batchSize = 20;
  let checked = 0;

  for (let i = 0; i < uniquePhotos.length; i += batchSize) {
    const batch = uniquePhotos.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const res = await fetch(url, {
            method: "HEAD",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          return { url, ok: res.ok, status: res.status };
        } catch {
          return { url, ok: false, status: 0 };
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && !r.value.ok) {
        brokenUrls.add(r.value.url);
      } else if (r.status === "rejected") {
        // 网络错误也视为 broken
        if (batch[results.indexOf(r)]) {
          brokenUrls.add(batch[results.indexOf(r)]);
        }
      }
    }

    checked += batch.length;
    process.stdout.write(`\r检查进度: ${checked}/${uniquePhotos.length}`);
  }

  console.log(`\n\n发现 ${brokenUrls.size} 个无效图片 URL\n`);

  // 找出关联的售卖编号
  const brokenRecords = allRecords.filter((r) => brokenUrls.has(r.photo));

  if (brokenRecords.length === 0) {
    console.log("所有照片链接均有效！");
    return;
  }

  // 输出表格
  console.log("| 售卖编号 | 照片链接 |");
  console.log("|----------|----------|");
  for (const r of brokenRecords) {
    // 截断太长的 URL
    const urlDisplay = r.photo.length > 80 ? r.photo.substring(0, 77) + "..." : r.photo;
    console.log(`| ${r.sale_id} | ${urlDisplay} |`);
  }

  console.log(`\n共 ${brokenRecords.length} 条记录的照片无法显示。`);
}

main().catch(console.error);