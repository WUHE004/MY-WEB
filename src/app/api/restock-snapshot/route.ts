import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 补录视图快照接口: 按补录日期分组, 返回每个(日期,编号)的补录明细 + 补录前各尺码剩余库存
// 用途: 老板当天补录后立即查看"该给抖音链接加多少件库存 / 那天该商品还剩多少 / 补了多少"
// 数据来源(2026-10-16 重构): 每条补录记录提交时已把"补录当天各尺码剩余"快照存进 before_sizes 列,
//   本接口只读入库表(1900行级别, 毫秒级)组装输出, 不再拉售出/退货全量现算(旧方案内存峰值1G+曾把服务器打爆)
// before 口径: before[s] = Σ入库(≤D)[s] − Σ售出(≤D)[s] + Σ退回(≤D)[s] − 当日补录增量[s] (天粒度, 北京时间)

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];
const PAGE = 1000;

// 北京时间日期串 YYYY-MM-DD
function bjDate(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(d);
}

// 北京时间 "MM-DD HH:mm"(补录时间显示用); 完整格式后截取, 不依赖 locale 字段顺序
function bjShort(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return "";
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d); // "2026-10-04 16:56"
  return s.slice(5); // "10-04 16:56"
}

// 按 count 分批拉全表(每批5页并行, 控制内存峰值)
async function pullAll(table: string, cols: string, order: string) {
  const { count, error: countErr } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (countErr) throw new Error(`${table}: ${countErr.message}`);
  if (!count) return [];
  const pages = Math.ceil(count / PAGE) + 1;
  const BATCH = 5;
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < pages; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, pages - i) }, (_, k) =>
      supabase.from(table).select(cols).order(order, { ascending: false }).range((i + k) * PAGE, (i + k + 1) * PAGE - 1)
    );
    const results = await Promise.all(batch);
    for (const r of results) {
      if (r.error) throw new Error(`${table}: ${r.error.message}`);
      if (r.data) out.push(...(r.data as unknown as Record<string, unknown>[]));
    }
  }
  return out;
}

// 模块级缓存 + 单飞锁: 60秒内所有请求复用同一份快照(补录低频, 60秒内数据新鲜度足够);
// 过期后并发请求共享同一次计算(单飞); 补录提交成功后调用 invalidateRestockCache() 立即失效
const RESTOCK_TTL_MS = 60_000;
let restockCache: { body: { days: unknown }; ts: number } | null = null;
let restockInflight: Promise<{ days: unknown }> | null = null;

export function invalidateRestockCache() {
  restockCache = null;
}

type SizeMap = Record<string, number>;
interface RestockGroup {
  restock: SizeMap;       // 该日补录增量(各尺码, 多行累计)
  before: SizeMap;        // 该日补录前剩余快照(取当天最早提交行; 天粒度同日各行相同)
  timeISO: string;        // 当日最后一条补录的 inbound_date(取最新)
  time: string;           // 显示用 "MM-DD HH:mm"
  operator: string | null; // 当日最后一条补录的登记人
  firstId: number;        // 当天最早提交行 id(before 快照取该行)
}

async function buildRestockSnapshot(): Promise<{ days: unknown }> {
    // 只拉入库表全部行(行数少): 补录行自带 before_sizes 快照 + size_* 增量; 原始行提供静态信息与首次入库时间
    const inboundRows = await pullAll(
      "inbound_records",
      `id,sale_id,inbound_date,notes,photo,name,manufacturer,shelf_no,cost_price,operator,before_sizes,${ALL_SIZES.map((s) => `size_${s}`).join(",")}`,
      "id"
    );

    const prods = new Map<string, {
      photo: string; name: string; manufacturer: string; shelf_no: string; cost_price: number;
      inboundTimeISO: string; // 最早入库时间(首次原始入库)
      groups: Map<string, RestockGroup>;
    }>();
    const ensureProd = (sid: string) => {
      let p = prods.get(sid);
      if (!p) {
        p = { photo: "", name: "", manufacturer: "", shelf_no: "", cost_price: 0, inboundTimeISO: "", groups: new Map() };
        prods.set(sid, p);
      }
      return p;
    };
    const ensureGroup = (p: ReturnType<typeof ensureProd>, d: string): RestockGroup => {
      let g = p.groups.get(d);
      if (!g) {
        g = { restock: {}, before: {}, timeISO: "", time: "", operator: null, firstId: Number.MAX_SAFE_INTEGER };
        p.groups.set(d, g);
      }
      return g;
    };
    // 读行里的 before_sizes 快照(jsonb: {"80": n, ...}; null/缺列 → 全 0)
    const readBefore = (v: unknown): SizeMap => {
      const src = (v && typeof v === "object") ? v as Record<string, unknown> : {};
      const out: SizeMap = {};
      for (const s of ALL_SIZES) out[String(s)] = Number(src[String(s)]) || 0;
      return out;
    };

    for (const row of inboundRows) {
      const sid = String(row.sale_id || "").trim().toUpperCase();
      if (!sid) continue;
      const p = ensureProd(sid);
      // pullAll 按 id 倒序 → 首次遇到即最新行(静态信息取最新)
      if (!p.photo && !p.name && !p.manufacturer) {
        p.photo = String(row.photo || "");
        p.name = String(row.name || "");
        p.manufacturer = String(row.manufacturer || "");
        p.shelf_no = String(row.shelf_no || "");
        p.cost_price = Number(row.cost_price) || 0;
      }
      const d = bjDate(row.inbound_date);
      if (!d) continue;
      const iso = String(row.inbound_date);
      if (!p.inboundTimeISO || new Date(iso).getTime() < new Date(p.inboundTimeISO).getTime()) p.inboundTimeISO = iso;
      if (!String(row.notes || "").startsWith("补录入库")) continue;

      const g = ensureGroup(p, d);
      for (const s of ALL_SIZES) {
        const v = Number(row[`size_${s}`]) || 0;
        if (v) g.restock[s] = (g.restock[s] || 0) + v;
      }
      if (Number(row.id) < g.firstId) {
        g.firstId = Number(row.id) || 0;
        g.before = readBefore(row.before_sizes);
      }
      if (iso > g.timeISO) {
        g.timeISO = iso;
        g.time = bjShort(iso);
        g.operator = (row.operator as string) || null;
      }
    }

    const dayMap = new Map<string, Record<string, unknown>[]>();
    for (const [sid, p] of prods) {
      for (const [d, g] of p.groups) {
        let beforeTotal = 0;
        let restockTotal = 0;
        const before_sizes: Record<number, number> = {};
        const restock_sizes: Record<number, number> = {};
        for (const s of ALL_SIZES) {
          const b = g.before[s] || 0;
          const a = g.restock[s] || 0;
          before_sizes[s] = b;
          restock_sizes[s] = a;
          beforeTotal += b;
          restockTotal += a;
        }
        const item = {
          sale_id: sid,
          photo: p.photo, name: p.name, manufacturer: p.manufacturer, shelf_no: p.shelf_no,
          cost_price: p.cost_price,
          operator: g.operator,
          restock_total: restockTotal,
          before_total: beforeTotal,
          restock_sizes,
          before_sizes,
          restock_time: g.time || bjShort(g.timeISO),
          inbound_time: p.inboundTimeISO ? bjDate(p.inboundTimeISO) : "",
        };
        let arr = dayMap.get(d);
        if (!arr) { arr = []; dayMap.set(d, arr); }
        arr.push(item);
      }
    }

    const days = Array.from(dayMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items: items.sort((a, b) => String(a.sale_id).localeCompare(String(b.sale_id))) }));

    return { days };
}

export async function GET() {
  try {
    // 命中缓存直接返回(60秒内), 不再重复查表组装
    if (restockCache && Date.now() - restockCache.ts < RESTOCK_TTL_MS) {
      return NextResponse.json(restockCache.body);
    }
    // 单飞: 过期后并发进来的请求共享同一次计算
    if (!restockInflight) {
      restockInflight = buildRestockSnapshot()
        .then((body) => { restockCache = { body, ts: Date.now() }; return body; })
        .finally(() => { restockInflight = null; });
    }
    const body = await restockInflight;
    return NextResponse.json(body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
