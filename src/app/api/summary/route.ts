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
  // per-size remaining
  [key: string]: unknown;
}

export async function GET() {
  try {
    // 获取所有入库记录（分页获取，避免默认1000条限制）
    let inboundData: Record<string, any>[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error: inboundErr } = await supabase
        .from("inbound_records")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("inbound_date", { ascending: false });

      if (inboundErr) {
        return NextResponse.json({ error: inboundErr.message }, { status: 500 });
      }
      if (!chunk || chunk.length === 0) break;
      inboundData = inboundData.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 获取所有售卖记录（分页获取）
    let salesData: Record<string, any>[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error: salesErr } = await supabase
        .from("sales_records")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("registration_date", { ascending: false });

      if (salesErr) {
        return NextResponse.json({ error: salesErr.message }, { status: 500 });
      }
      if (!chunk || chunk.length === 0) break;
      salesData = salesData.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 获取所有退货记录（分页获取）
    let returnData: Record<string, any>[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error: returnErr } = await supabase
        .from("return_records")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("created_at", { ascending: false });

      if (returnErr) {
        return NextResponse.json({ error: returnErr.message }, { status: 500 });
      }
      if (!chunk || chunk.length === 0) break;
      returnData = returnData.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }

    // 按 sale_id 分组
    const summaryMap = new Map<string, SummaryRow>();

    // 处理入库记录
    for (const row of inboundData || []) {
      const saleId = (row.sale_id || "").toUpperCase();
      if (!saleId) continue;

      // 计算入库总数
      let inboundTotal = 0;
      const sizeCounts: Record<string, number> = {};
      for (const s of SIZES) {
        const val = Number(row[`size_${s}`]) || 0;
        inboundTotal += val;
        sizeCounts[`size_${s}`] = val;
      }

      const costPrice = Number(row.cost_price) || 0;

      summaryMap.set(saleId, {
        sale_id: saleId,
        inbound_total: inboundTotal,
        sold_total: 0,
        return_total: 0,
        remaining: inboundTotal,
        profits: 0,
        inventory_value: 0,
        cost_price: costPrice,
        sell_price: Number(row.sell_price) || 0,
        name: row.name || "",
        manufacturer: row.manufacturer || "",
        photo: row.photo || "",
        shelf_no: row.shelf_no || "",
        ...sizeCounts,
      });
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