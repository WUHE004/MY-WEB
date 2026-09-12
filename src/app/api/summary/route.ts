import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

interface SummaryRow {
  sale_id: string;
  inbound_total: number;
  sold_total: number;
  // 拼多多渠道销量(面单号以"多多"开头, 如多多20260903); 抖音渠道销量 = sold_total - pdd_sold
  pdd_sold: number;
  return_total: number;
  remaining: number;
  profits: number;
  inventory_value: number;
  cost_price: number;
  sell_price: number;
  name: string;
  manufacturer: string;
  photo: string;
  // per-size remaining
  [key: string]: unknown;
}

// 并行拉取全表：先 count 总数，再并行请求所有分页
// （取代逐页串行，2万+条记录的拉取耗时从 ~15s 降到 ~2s）
const PAGE_SIZE = 1000;

async function fetchAllRows(
  table: string,
  select: string,
  orderCol: string
): Promise<{ rows: Record<string, any>[]; error: string | null }> {
  // 1. 查总数（head 请求不返回数据，只返回 count）
  const { count, error: countErr } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (countErr) return { rows: [], error: countErr.message };
  if (!count || count === 0) return { rows: [], error: null };

  // 2. 按总页数并行拉取（多拉一页防止 count 后有新数据导致末页遗漏）
  // orderCol 不唯一(如批量导入产生842行同 registration_date),必须加 id 次级排序键,
  // 否则 Postgres 对同值行的顺序无保证,分页边界落在同值组内时会跳行/重复
  const pages = Math.ceil(count / PAGE_SIZE) + 1;
  const results = await Promise.all(
    Array.from({ length: pages }, (_, p) =>
      supabase
        .from(table)
        .select(select)
        .order(orderCol, { ascending: false })
        .order("id", { ascending: false })
        .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
    )
  );

  const rows: Record<string, any>[] = [];
  for (const r of results) {
    if (r.error) return { rows: [], error: r.error.message };
    if (r.data) rows.push(...(r.data as Record<string, any>[]));
  }
  return { rows, error: null };
}

export async function GET() {
  try {
    // 三张表并行拉取（原先串行等待）
    // select 只取聚合需要的列，减少传输量（sales_records 需舍弃 waybill/tracking 等大字段）
    // 注意：inbound_records 表没有 sell_price 列（已知 schema），不能显式 select，代码中按 undefined→0 处理
    const sizeCols = SIZES.map((s) => `size_${s}`).join(",");
    const [inboundRes, salesRes, returnRes] = await Promise.all([
      fetchAllRows(
        "inbound_records",
        `sale_id,${sizeCols},cost_price,name,manufacturer,photo,shelf_no`,
        "inbound_date"
      ),
      fetchAllRows("sales_records", "sale_id,quantity,size,sell_price,tracking_number", "registration_date"),
      fetchAllRows("return_records", "sale_id,quantity,size", "created_at"),
    ]);

    const inboundErr = inboundRes.error || salesRes.error || returnRes.error;
    if (inboundErr) {
      return NextResponse.json({ error: inboundErr }, { status: 500 });
    }

    const inboundData = inboundRes.rows;
    const salesData = salesRes.rows;
    const returnData = returnRes.rows;

    // 按 sale_id 分组
    const summaryMap = new Map<string, SummaryRow>();

    // 处理入库记录（累加同 sale_id 的多条记录，支持补录入库）
    for (const row of inboundData || []) {
      const saleId = (row.sale_id || "").toUpperCase();
      if (!saleId) continue;

      // 计算本条记录的入库数量
      let rowTotal = 0;
      const sizeCounts: Record<string, number> = {};
      for (const s of SIZES) {
        const val = Number(row[`size_${s}`]) || 0;
        rowTotal += val;
        sizeCounts[`size_${s}`] = val;
      }

      const costPrice = Number(row.cost_price) || 0;
      const sellPrice = Number(row.sell_price) || 0;

      // 累加：如果该 sale_id 已存在，则累加尺码数量；否则新建
      if (summaryMap.has(saleId)) {
        const existing = summaryMap.get(saleId)!;
        existing.inbound_total += rowTotal;
        existing.remaining += rowTotal;
        for (const s of SIZES) {
          existing[`size_${s}`] = (Number(existing[`size_${s}`]) || 0) + sizeCounts[`size_${s}`];
        }
        // 基础信息：优先保留非空值（最新记录覆盖空字段）
        if (!existing.name && row.name) existing.name = row.name;
        if (!existing.manufacturer && row.manufacturer) existing.manufacturer = row.manufacturer;
        if (!existing.photo && row.photo) existing.photo = row.photo;
        if (!existing.shelf_no && row.shelf_no) existing.shelf_no = row.shelf_no;
        if (costPrice > 0) existing.cost_price = costPrice;
        if (sellPrice > 0) existing.sell_price = sellPrice;
      } else {
        summaryMap.set(saleId, {
          sale_id: saleId,
          inbound_total: rowTotal,
          sold_total: 0,
          pdd_sold: 0,
          return_total: 0,
          remaining: rowTotal,
          profits: 0,
          inventory_value: 0,
          cost_price: costPrice,
          sell_price: sellPrice,
          name: row.name || "",
          manufacturer: row.manufacturer || "",
          photo: row.photo || "",
          shelf_no: row.shelf_no || "",
          ...sizeCounts,
        });
      }
    }

    // 处理售卖记录
    for (const row of salesData || []) {
      const saleId = (row.sale_id || "").toUpperCase();
      if (!saleId) continue;

      const qty = Number(row.quantity) || 0;
      const size = Number(row.size) || 0;
      const sellPrice = Number(row.sell_price) || 0;

      if (!summaryMap.has(saleId)) {
        summaryMap.set(saleId, {
          sale_id: saleId,
          inbound_total: 0,
          sold_total: 0,
          pdd_sold: 0,
          return_total: 0,
          remaining: 0,
          profits: 0,
          inventory_value: 0,
          cost_price: 0,
          sell_price: 0,
          name: "",
          manufacturer: "",
          photo: "",
          shelf_no: "",
        });
      }

      const entry = summaryMap.get(saleId)!;
      entry.sold_total += qty;
      // 拼多多渠道(面单号"多多20260903"格式)计入多多角标, 其余(抖店/补录)计入抖音角标
      if (String(row.tracking_number || "").trim().startsWith("多多")) {
        entry.pdd_sold += qty;
      }
      if (sellPrice > 0) entry.sell_price = sellPrice;

      // 减去对应尺码
      const sizeKey = `size_${size}`;
      if (entry[sizeKey] !== undefined) {
        entry[sizeKey] = (Number(entry[sizeKey]) || 0) - qty;
      }
    }

    // 处理退货记录
    for (const row of returnData || []) {
      const saleId = (row.sale_id || "").toUpperCase();
      if (!saleId) continue;

      const qty = Number(row.quantity) || 0;
      const size = Number(row.size) || 0;

      if (!summaryMap.has(saleId)) {
        summaryMap.set(saleId, {
          sale_id: saleId,
          inbound_total: 0,
          sold_total: 0,
          pdd_sold: 0,
          return_total: 0,
          remaining: 0,
          profits: 0,
          inventory_value: 0,
          cost_price: 0,
          sell_price: 0,
          name: "",
          manufacturer: "",
          photo: "",
          shelf_no: "",
        });
      }

      const entry = summaryMap.get(saleId)!;
      entry.return_total += qty;

      // 加上对应尺码
      const sizeKey = `size_${size}`;
      if (entry[sizeKey] !== undefined) {
        entry[sizeKey] = (Number(entry[sizeKey]) || 0) + qty;
      } else {
        entry[sizeKey] = qty;
      }
    }

    // 计算最终汇总
    // 从 product_display 表读取展示售价（优先于售卖记录中的售价）
    const { data: displayData } = await supabase
      .from("product_display")
      .select("sale_id, sell_price");

    if (displayData) {
      for (const row of displayData) {
        const saleId = (row.sale_id || "").toUpperCase();
        const displayPrice = Number(row.sell_price) || 0;
        if (displayPrice > 0 && summaryMap.has(saleId)) {
          const entry = summaryMap.get(saleId)!;
          // 如果售卖记录中没有售价，或展示售价更新，使用展示售价
          if (entry.sell_price === 0 || displayPrice !== entry.sell_price) {
            entry.sell_price = displayPrice;
          }
        }
      }
    }

    const result = Array.from(summaryMap.values()).map((entry) => {
      const remaining = entry.inbound_total - entry.sold_total + entry.return_total;
      const profit = entry.sell_price - entry.cost_price;
      const inventoryValue = remaining * entry.cost_price;

      return {
        ...entry,
        remaining,
        profits: profit,
        inventory_value: inventoryValue,
      };
    });

    // 按 sale_id 排序
    result.sort((a, b) => a.sale_id.localeCompare(b.sale_id));

    // CDN 缓存 15 秒，过期后 30 秒内仍返回旧数据并后台刷新
    // 商品页每 15 秒轮询，缓存可大幅减轻 Serverless 函数压力
    const response = NextResponse.json(result);
    response.headers.set("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}