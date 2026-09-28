import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { TABLE_COLUMNS } from "@/lib/db-tables";

// GET /api/db-admin/usage - Supabase 用量仪表盘数据(数据库空间/文件存储/总行数)
// 数据库字节大小依赖迁移 004 的 get_db_usage RPC; 未执行迁移时 dbSize=null + rpcMissing=true

export const dynamic = "force-dynamic";

// Supabase 免费额度(2026 现行)
const FREE_DB_BYTES = 500 * 1024 * 1024; // 数据库 500 MB
const FREE_STORAGE_BYTES = 1024 * 1024 * 1024; // 文件存储 1 GB

// 递归列出 bucket 全部文件求总大小(storage.list 只返回当前层, 子文件夹需递归)
async function listAllFiles(bucket: string, path = "", depth = 0): Promise<{ count: number; size: number }> {
  if (depth > 6) return { count: 0, size: 0 }; // 防御: 目录层级超深
  const { data } = await supabase.storage.from(bucket).list(path, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  let count = 0;
  let size = 0;
  for (const f of data || []) {
    const meta = (f as { metadata?: { size?: number } }).metadata;
    if (meta && typeof meta.size === "number") {
      count++;
      size += meta.size;
    } else {
      // 文件夹对象无 metadata, 递归下钻
      const sub = await listAllFiles(bucket, path ? `${path}/${f.name}` : f.name, depth + 1);
      count += sub.count;
      size += sub.size;
    }
  }
  return { count, size };
}

export async function GET() {
  // 1. 数据库字节大小: RPC get_db_usage(迁移 004), 未执行迁移时降级为 null
  let dbSize: number | null = null;
  let rpcMissing = false;
  try {
    const { data, error } = await supabase.rpc("get_db_usage");
    if (!error && data && typeof (data as { db_size?: number }).db_size === "number") {
      dbSize = (data as { db_size: number }).db_size;
    } else {
      rpcMissing = true;
    }
  } catch {
    rpcMissing = true;
  }

  // 2. 各表行数(head 请求只取 count, 不拉数据)
  const tables: { name: string; count: number }[] = [];
  let totalRows = 0;
  await Promise.all(
    Object.keys(TABLE_COLUMNS).map(async (name) => {
      try {
        const { count } = await supabase.from(name).select("*", { count: "exact", head: true });
        const c = count ?? 0;
        tables.push({ name, count: c });
        totalRows += c;
      } catch {
        tables.push({ name, count: 0 });
      }
    })
  );
  tables.sort((a, b) => b.count - a.count);

  // 3. 文件存储用量: 递归列全部 bucket
  let storageUsed = 0;
  let storageFiles = 0;
  let storageError = "";
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      storageError = error.message;
    } else {
      for (const b of buckets || []) {
        const r = await listAllFiles(b.name);
        storageUsed += r.size;
        storageFiles += r.count;
      }
    }
  } catch (e) {
    storageError = e instanceof Error ? e.message : "获取存储用量失败";
  }

  return NextResponse.json({
    dbSize,
    dbSizeLimit: FREE_DB_BYTES,
    rpcMissing,
    totalRows,
    tableCount: tables.length,
    tables: tables.slice(0, 8), // 行数最多的前 8 张表
    storageUsed,
    storageLimit: FREE_STORAGE_BYTES,
    storageFiles,
    storageError,
  });
}
