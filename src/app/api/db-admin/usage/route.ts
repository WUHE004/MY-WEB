import { NextResponse } from "next/server";
import { statfsSync, readFileSync } from "node:fs";
import os from "node:os";
import { supabase } from "@/lib/supabase";
import { TABLE_COLUMNS } from "@/lib/db-tables";

// GET /api/db-admin/usage - 服务器用量仪表盘数据(数据库/文件存储/CPU/内存/公网带宽/系统磁盘)
// 自托管架构(阿里云轻量服务器): 数据库为本机 PostgreSQL(用量经 get_db_usage RPC 查询),
// 文件存储为服务器本地磁盘, 硬件指标经 /proc 与 statfs 实时读取, 与阿里云控制台口径一致
// 数据库字节大小依赖迁移 004 的 get_db_usage RPC; 未执行迁移时 dbSize=null + rpcMissing=true

export const dynamic = "force-dynamic";

// 轻量应用服务器套餐公网带宽峰值(Mbps), 与云控制台"峰值公网带宽"上限一致(腾讯云香港轻量 20M)
const NET_LIMIT_MBPS = 20;
// CPU/网速采样间隔(ms): 两次读取 /proc 差值算瞬时值
const SAMPLE_MS = 250;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 内存: /proc/meminfo 的 MemTotal-MemAvailable(含可回收缓存的口径, 同阿里云控制台)
function readMem(): { used: number; total: number } | null {
  try {
    const m = readFileSync("/proc/meminfo", "utf8");
    const get = (k: string) => {
      const r = m.match(new RegExp(`^${k}:\\s+(\\d+) kB`, "m"));
      return r ? parseInt(r[1]) * 1024 : null;
    };
    const total = get("MemTotal");
    const avail = get("MemAvailable");
    if (total == null || avail == null) return null;
    return { used: total - avail, total };
  } catch {
    return null; // 非 Linux(本地开发)取不到
  }
}

// 网络字节数: /proc/net/dev 除 lo 外全部网卡的 rx+tx 之和
function readNetBytes(): number | null {
  try {
    const lines = readFileSync("/proc/net/dev", "utf8").split("\n");
    let bytes = 0;
    for (const line of lines) {
      const m = line.match(/^\s*(\S+):\s*(.*)$/);
      if (!m || m[1] === "lo") continue;
      const f = m[2].trim().split(/\s+/).map(Number);
      if (f.length >= 9) bytes += f[0] + f[8]; // rx_bytes + tx_bytes
    }
    return bytes;
  } catch {
    return null;
  }
}

// CPU: os.cpus() 累计时间片
function readCpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const v of Object.values(c.times)) total += v;
    idle += c.times.idle;
  }
  return { idle, total };
}

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
  // 0a. 系统磁盘: 已用 = blocks-bfree(不含 root 保留块, 同阿里云"系统盘"口径), 可用 = bavail
  let diskTotal: number | null = null;
  let diskFree: number | null = null;
  let diskUsed: number | null = null;
  try {
    const s = statfsSync("/");
    diskTotal = s.blocks * s.bsize;
    diskFree = s.bavail * s.bsize;
    diskUsed = (s.blocks - s.bfree) * s.bsize;
  } catch {
    // statfs 不可用时保持 null, 前端显示提示文字
  }

  // 0b. CPU 使用率: 两次采样差值
  const cores = os.cpus().length;
  let cpuPct: number | null = null;
  try {
    const t1 = readCpuTimes();
    await sleep(SAMPLE_MS);
    const t2 = readCpuTimes();
    const dTotal = t2.total - t1.total;
    const dIdle = t2.idle - t1.idle;
    if (dTotal > 0) cpuPct = Math.round((1 - dIdle / dTotal) * 1000) / 10;
  } catch {
    // 保持 null
  }

  // 0c. 内存
  const mem = readMem();

  // 0d. 公网带宽: 瞬时速率 Mbps(rx+tx)
  let mbps: number | null = null;
  try {
    const b1 = readNetBytes();
    await sleep(SAMPLE_MS);
    const b2 = readNetBytes();
    if (b1 != null && b2 != null) {
      mbps = Math.round(((b2 - b1) * 8) / ((SAMPLE_MS / 1000) * 1e6) * 100) / 100;
    }
  } catch {
    // 保持 null
  }

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
    dbSizeLimit: diskTotal, // 自托管: 数据库与磁盘共用容量, 不再有平台免费额度
    rpcMissing,
    totalRows,
    tableCount: tables.length,
    tables: tables.slice(0, 8), // 行数最多的前 8 张表
    storageUsed,
    storageLimit: diskTotal,
    storageFiles,
    storageError,
    diskTotal,
    diskFree,
    diskUsed,
    cpu: { usagePct: cpuPct, cores },
    mem: mem ? { used: mem.used, total: mem.total } : { used: null, total: null },
    net: { mbps, limitMbps: NET_LIMIT_MBPS },
  });
}
