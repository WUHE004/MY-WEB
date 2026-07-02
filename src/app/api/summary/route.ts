import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

interface SummaryRow {
  sale_id: string;
  inbound_total: number;
  sold_total: number;
  return_total: number;
  remaining: number;
  profits: number;
  inventory_value: number;
  cost_price: number;
  sell_price: number;
  name: string;
  manufacturer: string;
  photo: string;
  shelf_no?: string;
  [key: string]: unknown;
}

async function fetchAllPaginated(table: string, select = "*", orderBy = "id") {
  let allData: Record<string, any>[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: chunk, error } = await supabase
      .from(table)
      .select(select)
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order(orderBy, { ascending: false });

    if (error) {
      throw new Error(`${table} query error: ${error.message}`);
    }
    if (!chunk || chunk.length === 0) break;
    allData = allData.concat(chunk);
    if (chunk.length < pageSize) break;
    page++;
  }
  return allData;
}

export async function GET() {
  try {
    // 1. 获取入库记录（仅必要字段，减少数据传输量）
    const inboundData = await fetchAllPaginated(
      "inbound_records",
      "sale_id,name,manufacturer,photo,shelf_no,cost_price,sell_price,size_80,size_90,size_95,size_100,size_105,size_110,size_120,size_130,size_140,size_150,size_160,size_170,size_180",
      "inbound_date"
    );

    // 2. 获取预聚合售出汇总（替代 sales_records 全表扫描）
    const salesSummaryData = await fetchAllPaginated("sales_summary");

    // 3. 获取预聚合退货汇总（替代 return_records 全表扫描）
    const returnsSummaryData = await fetchAllPaginated("returns_summary");

    // 4. 获取展示售价
    const { data: displayData } = await supabase
      .from("product_display")
      .select("sale_id, sell_price");

    // 构建查找表 (uppercase sale_id -> row)
    const salesSummaryMap = new Map<string, Record<string, any>>();
    for (const row of salesSummaryData) {
      const sid = (row.sale_id || "").toUpperCase();
      if (sid) salesSummaryMap.set(sid, row);
    }

    const returnsSummaryMap = new Map<string, Record<string, any>>();
    for (const row of returnsSummaryData) {
      const sid = (row.sale_id || "").toUpperCase();
      if (sid) returnsSummaryMap.set(sid, row);
    }

    const displayPriceMap = new Map<string, number>();
    if (displayData) {
      for (const row of displayData) {
        const sid = (row.sale_id || "").toUpperCase();
        const price = Number(row.sell_price) || 0;
        if (sid && price > 0) displayPriceMap.set(sid, price);
      }
    }

    // 按 sale_id 分组，从入库记录初始化
    const summaryMap = new Map<string, SummaryRow>();

    for (const row of inboundData) {
      const saleId = (row.sale_id || "").toUpperCase();
      if (!saleId) continue;

      let inboundTotal = 0;
      const sizeCounts: Record<string, number> = {};
      for (const s of SIZES) {
        const val = Number(row[`size_${s}`]) || 0;
        inboundTotal += val;
        sizeCounts[`size_${s}`] = val;
      }

      summaryMap.set(saleId, {
        sale_id: saleId,
        inbound_total: inboundTotal,
        sold_total: 0,
        return_total: 0,
        remaining: inboundTotal,
        profits: 0,
        inventory_value: 0,
        cost_price: Number(row.cost_price) || 0,
        sell_price: Number(row.sell_price) || 0,
        name: row.name || "",
        manufacturer: row.manufacturer || "",
        photo: row.photo || "",
        shelf_no: row.shelf_no || "",
        ...sizeCounts,
      });
    }

    // 从预聚合表应用售出和退货数据
    for (const [saleId, entry] of summaryMap) {
      // 售出
      const salesSummary = salesSummaryMap.get(saleId);
      if (salesSummary) {
        entry.sold_total = Number(salesSummary.total_sold) || 0;
        // 从 sell_price_info 取最高售价
        const info = salesSummary.sell_price_info as Record<string, string> | null;
        if (info && Object.keys(info).length > 0) {
          const prices = Object.keys(info).map(Number).filter((p) => p > 0);
          if (prices.length > 0 && Math.max(...prices) > entry.sell_price) {
            entry.sell_price = Math.max(...prices);
          }
        }
        for (const s of SIZES) {
          const key = `size_${s}`;
          const sold = Number(salesSummary[key]) || 0;
          if (entry[key] !== undefined) {
            entry[key] = (Number(entry[key]) || 0) - sold;
          }
        }
      }

      // 退货
      const returnsSummary = returnsSummaryMap.get(saleId);
      if (returnsSummary) {
        entry.return_total = Number(returnsSummary.total_returned) || 0;
        for (const s of SIZES) {
          const key = `size_${s}`;
          const returned = Number(returnsSummary[key]) || 0;
          if (entry[key] !== undefined) {
            entry[key] = (Number(entry[key]) || 0) + returned;
          } else {
            entry[key] = returned;
          }
        }
      }
    }

    // 处理只有售出/退货但没有入库记录的商品
    for (const [saleId, salesSummary] of salesSummaryMap) {
      if (summaryMap.has(saleId)) continue;

      const totalSold = Number(salesSummary.total_sold) || 0;
      const info = salesSummary.sell_price_info as Record<string, string> | null;
      let sellPrice = 0;
      if (info && Object.keys(info).length > 0) {
        const prices = Object.keys(info).map(Number).filter((p) => p > 0);
        if (prices.length > 0) sellPrice = Math.max(...prices);
      }

      const sizeCounts: Record<string, number> = {};
      for (const s of SIZES) {
        sizeCounts[`size_${s}`] = -(Number(salesSummary[`size_${s}`]) || 0);
      }

      const returnsSummary = returnsSummaryMap.get(saleId);
      let returnTotal = 0;
      if (returnsSummary) {
        returnTotal = Number(returnsSummary.total_returned) || 0;
        for (const s of SIZES) {
          const key = `size_${s}`;
          sizeCounts[key] = (sizeCounts[key] || 0) + (Number(returnsSummary[key]) || 0);
        }
      }

      summaryMap.set(saleId, {
        sale_id: saleId,
        inbound_total: 0,
        sold_total: totalSold,
        return_total: returnTotal,
        remaining: 0,
        profits: 0,
        inventory_value: 0,
        cost_price: Number(salesSummary.cost_price) || 0,
        sell_price: sellPrice,
        name: salesSummary.name || "",
        manufacturer: salesSummary.manufacturer || "",
        photo: salesSummary.photo || "",
        shelf_no: salesSummary.shelf_no || "",
        ...sizeCounts,
      });
    }

    // 处理只有退货没有入库/售出的商品
    for (const [saleId, returnsSummary] of returnsSummaryMap) {
      if (summaryMap.has(saleId)) continue;

      const totalReturned = Number(returnsSummary.total_returned) || 0;
      const sizeCounts: Record<string, number> = {};
      for (const s of SIZES) {
        sizeCounts[`size_${s}`] = Number(returnsSummary[`size_${s}`]) || 0;
      }

      summaryMap.set(saleId, {
        sale_id: saleId,
        inbound_total: 0,
        sold_total: 0,
        return_total: totalReturned,
        remaining: 0,
        profits: 0,
        inventory_value: 0,
        cost_price: Number(returnsSummary.cost_price) || 0,
        sell_price: 0,
        name: returnsSummary.name || "",
        manufacturer: returnsSummary.manufacturer || "",
        photo: returnsSummary.photo || "",
        shelf_no: returnsSummary.shelf_no || "",
        ...sizeCounts,
      });
    }

    // 应用 product_display 展示售价覆盖
    for (const [saleId, price] of displayPriceMap) {
      const entry = summaryMap.get(saleId);
      if (entry) {
        entry.sell_price = price;
      }
    }

    // 计算最终汇总
    const result = Array.from(summaryMap.values()).map((entry) => {
      const remaining = entry.inbound_total - entry.sold_total + entry.return_total;
      const profit = entry.sell_price - entry.cost_price;
      const inventoryValue = remaining * entry.cost_price;
      return { ...entry, remaining, profits: profit, inventory_value: inventoryValue };
    });

    result.sort((a, b) => a.sale_id.localeCompare(b.sale_id));

    const response = NextResponse.json(result);
    response.headers.set("Cache-Control", "public, max-age=10, s-maxage=30, stale-while-revalidate=15");
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}