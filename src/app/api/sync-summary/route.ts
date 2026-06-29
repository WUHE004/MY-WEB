import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

async function getSalesSummaryColumns(): Promise<string[]> {
  // 方案1: 先试一次插入 1 条测试数据，从错误信息获取不存在的列
  const testSaleId = "__column_probe__";
  const testRow: Record<string, unknown> = {
    sale_id: testSaleId,
    photo: "",
    name: "",
    shelf_no: "",
    manufacturer: "",
    cost_price: 0,
    sell_price: 0,
    total_sold: 0,
    total_revenue: 0,
    sell_price_info: {},
    sales_count: 0,
    updated_at: new Date().toISOString(),
  };
  for (const s of ALL_SIZES) testRow[`size_${s}`] = 0;

  try {
    const { error } = await supabase
      .from("sales_summary")
      .upsert(testRow, { onConflict: "sale_id" });

    if (!error) {
      // 成功，说明所有列都存在，先删掉测试数据
      await supabase.from("sales_summary").delete().eq("sale_id", testSaleId);
      return Object.keys(testRow);
    }

    // 从错误信息中提取不存在的列名
    // 错误格式: "Could not find the 'xxx' column of 'sales_summary' in the schema cache"
    const errMsg = error.message || "";
    const match = errMsg.match(/Could not find the '([^']+)' column/);
    if (match) {
      // 有一列不存在，剔除它，递归重试
      const missingCol = match[1];
      delete testRow[missingCol];
      // 重新尝试，用剩余的列
      return await probeColumns(Object.keys(testRow));
    }

    // 其他错误，返回空
    console.error("probe columns unexpected error:", errMsg);
    return [];
  } catch (e) {
    console.error("probe columns catch:", e);
    return [];
  }
}

async function probeColumns(cols: string[]): Promise<string[]> {
  const testSaleId = "__column_probe__";
  const testRow: Record<string, unknown> = { sale_id: testSaleId };
  for (const c of cols) {
    if (c === "sale_id") continue;
    if (c.startsWith("size_")) testRow[c] = 0;
    else if (c === "sell_price_info") testRow[c] = {};
    else if (c === "updated_at") testRow[c] = new Date().toISOString();
    else if (["total_sold", "sales_count", "cost_price", "sell_price", "total_revenue"].includes(c)) testRow[c] = 0;
    else testRow[c] = "";
  }

  try {
    const { error } = await supabase
      .from("sales_summary")
      .upsert(testRow, { onConflict: "sale_id" });

    if (!error) {
      await supabase.from("sales_summary").delete().eq("sale_id", testSaleId);
      return cols;
    }

    const errMsg = error.message || "";
    const match = errMsg.match(/Could not find the '([^']+)' column/);
    if (match) {
      const missingCol = match[1];
      const remaining = cols.filter((c) => c !== missingCol);
      return await probeColumns(remaining);
    }

    console.error("probeColumns unexpected error:", errMsg);
    return cols;
  } catch (e) {
    console.error("probeColumns catch:", e);
    return cols;
  }
}

export async function POST() {
  try {
    const diagnostics: string[] = [];

    // ---------- 0. 先检查表实际有哪些列 ----------
    const existingCols = await getSalesSummaryColumns();
    diagnostics.push(`sales_summary 表有 ${existingCols.length} 列: ${existingCols.slice(0, 10).join(",")}${existingCols.length > 10 ? "..." : ""}`);

    // ---------- 0. 先验证表是否有数据 ----------
    const { count: salesCount, error: countError } = await supabase
      .from("sales_records")
      .select("*", { count: "exact", head: true });
    diagnostics.push(`sales_records 表共 ${salesCount ?? 0} 条记录`);
    if (countError) diagnostics.push(`count error: ${countError.message}`);

    if (!salesCount || salesCount === 0) {
      return NextResponse.json({
        sales_synced: 0,
        returns_synced: 0,
        message: "sales_records 表无数据",
        diagnostics,
      });
    }

    // ---------- 1. 一次性读取所有售出记录 ----------
    let allSalesRecords: Record<string, unknown>[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("sales_records")
        .select("*")
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order("id", { ascending: true });
      if (error) {
        diagnostics.push(`sales_records 第${page}页查询错误: ${error.message}`);
        console.error("sync-summary: sales_records query error:", error.message);
        break;
      }
      if (!chunk || chunk.length === 0) break;
      allSalesRecords = allSalesRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }
    diagnostics.push(`读取 ${allSalesRecords.length} 条售出记录`);
    console.log(`sync-summary: 读取 ${allSalesRecords.length} 条售出记录`);

    if (allSalesRecords.length === 0) {
      return NextResponse.json({
        sales_synced: 0,
        returns_synced: 0,
        message: "读取售出记录为空",
        diagnostics,
      });
    }

    // 诊断：看看第一条记录的字段和 quantity
    const firstRecord = allSalesRecords[0];
    const firstKeys = Object.keys(firstRecord);
    diagnostics.push(`第一条记录字段: ${firstKeys.slice(0, 15).join(",")}${firstKeys.length > 15 ? "..." : ""}`);
    // 查找可能的数量字段
    const qtyCandidates = ["quantity", "qty", "count", "amount", "num", "数量", "sale_quantity", "sold_quantity"];
    let foundQtyField = "";
    for (const k of firstKeys) {
      if (qtyCandidates.includes(k.toLowerCase())) {
        foundQtyField = k;
        diagnostics.push(`找到数量字段: ${k} = ${firstRecord[k]}`);
        break;
      }
    }
    if (!foundQtyField) {
      diagnostics.push(`未找到明确的数量字段，当前使用 quantity，其值为: ${firstRecord["quantity"] ?? "undefined"}`);
    }
    // 统计 quantity 为 0/null/undefined 的记录数
    let zeroQtyCount = 0;
    let nullQtyCount = 0;
    let validQtyCount = 0;
    let sumQty = 0;
    let qtyTypeSamples: string[] = [];
    let zeroQtySamples: { q: unknown; t: string; sid: string }[] = [];
    for (const r of allSalesRecords) {
      const rawQ = r.quantity;
      const q = Number(rawQ);
      const typeOfQ = typeof rawQ;
      if (qtyTypeSamples.length < 5) qtyTypeSamples.push(`${typeOfQ}=${rawQ}`);
      if (rawQ === null || rawQ === undefined) nullQtyCount++;
      else if (isNaN(q) || q === 0) {
        zeroQtyCount++;
        if (zeroQtySamples.length < 3) {
          zeroQtySamples.push({ q: rawQ, t: typeOfQ, sid: String(r.sale_id || "") });
        }
      } else { validQtyCount++; sumQty += q; }
    }
    diagnostics.push(`有效数量记录: ${validQtyCount}条, 数量总和: ${sumQty}; 零数量: ${zeroQtyCount}条; 空值: ${nullQtyCount}条`);
    diagnostics.push(`quantity类型样本: ${qtyTypeSamples.join("; ")}`);
    diagnostics.push(`零数量样本: ${zeroQtySamples.map((s) => `${s.sid}:${s.t}(${s.q})`).join("; ")}`);

    // ---------- 2. 一次性读取所有入库记录 ----------
    let allInboundRecords: Record<string, unknown>[] = [];
    page = 0;
    while (true) {
      const { data: chunk, error } = await supabase
        .from("inbound_records")
        .select("sale_id, photo, shelf_no, manufacturer, name, cost_price, sell_price")
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) {
        console.error("sync-summary: inbound_records query error:", error.message);
        break;
      }
      if (!chunk || chunk.length === 0) break;
      allInboundRecords = allInboundRecords.concat(chunk);
      if (chunk.length < pageSize) break;
      page++;
    }
    console.log(`sync-summary: 读取 ${allInboundRecords.length} 条入库记录`);

    // 构建入库查找表 (uppercase sale_id -> 入库信息)
    const inboundMap = new Map<string, Record<string, unknown>>();
    for (const ib of allInboundRecords) {
      const key = String(ib.sale_id || "").toUpperCase();
      if (key && !inboundMap.has(key)) {
        inboundMap.set(key, ib);
      }
    }
    console.log(`sync-summary: 入库查找表共 ${inboundMap.size} 个唯一 sale_id`);

    // ---------- 3. 按 sale_id 分组汇总 ----------
    const groupMap = new Map<string, {
      records: Record<string, unknown>[];
      sizes: Record<string, number>;
      totalSold: number;
      totalRevenue: number;
      priceMap: Map<number, string>;
      trackingNumbers: Set<string>;
    }>();

    for (const row of allSalesRecords) {
      const sid = String(row.sale_id || "").toUpperCase();
      if (!sid) continue;

      let group = groupMap.get(sid);
      if (!group) {
        group = {
          records: [],
          sizes: {},
          totalSold: 0,
          totalRevenue: 0,
          priceMap: new Map(),
          trackingNumbers: new Set(),
        };
        for (const s of ALL_SIZES) group.sizes[`size_${s}`] = 0;
        groupMap.set(sid, group);
      }

      const qty = Number(row.quantity) || 0;
      const sz = Number(row.size) || 0;
      const sp = Number(row.sell_price) || 0;

      group.records.push(row);
      if (sz >= 80 && sz <= 180) {
        group.sizes[`size_${sz}`] = (group.sizes[`size_${sz}`] || 0) + qty;
      }
      group.totalSold += qty;
      group.totalRevenue += sp * qty;

      if (sp > 0) {
        const ot = String(row.order_time || row.created_at || "");
        const existing = group.priceMap.get(sp);
        if (!existing || ot > existing) {
          group.priceMap.set(sp, ot);
        }
      }

      const tn = String(row.tracking_number || "").trim();
      if (tn) group.trackingNumbers.add(tn);
    }

    console.log(`sync-summary: 共 ${groupMap.size} 个唯一 sale_id 待汇总`);

    // ---------- 4. 构建 upsert 数据并批量写入 ----------
    const upsertRows: Record<string, unknown>[] = [];
    for (const [sid, group] of groupMap) {
      const inbound = inboundMap.get(sid);

      // Fallback from sales_records
      let fallbackName = "";
      let fallbackManufacturer = "";
      let fallbackShelfNo = "";
      let fallbackCostPrice = 0;
      if (!inbound && group.records.length > 0) {
        const first = group.records[0];
        fallbackName = String(first.product_name || "");
        fallbackManufacturer = String(first.manufacturer || "");
        fallbackShelfNo = String(first.shelf_no || "");
        fallbackCostPrice = Number(first.cost_price) || 0;
      }

      // 最高售价
      let highestSellPrice = inbound ? (Number(inbound.sell_price) || 0) : 0;
      if (group.priceMap.size > 0) {
        highestSellPrice = Math.max(...group.priceMap.keys());
      }

      // sell_price_info JSON
      const sellPriceInfo: Record<string, string> = {};
      for (const [price, time] of group.priceMap) {
        sellPriceInfo[String(price)] = time;
      }

      const fullRow: Record<string, unknown> = {
        sale_id: sid,
        photo: inbound?.photo || "",
        name: inbound?.name || fallbackName,
        shelf_no: inbound?.shelf_no || fallbackShelfNo,
        manufacturer: inbound?.manufacturer || fallbackManufacturer,
        cost_price: inbound?.cost_price || fallbackCostPrice,
        sell_price: highestSellPrice,
        ...group.sizes,
        total_sold: group.totalSold,
        total_revenue: group.totalRevenue,
        sell_price_info: sellPriceInfo,
        sales_count: group.trackingNumbers.size,
        updated_at: new Date().toISOString(),
      };

      // 只保留表中实际存在的列
      const filteredRow: Record<string, unknown> = {};
      for (const col of existingCols) {
        if (col in fullRow) {
          filteredRow[col] = fullRow[col];
        }
      }
      upsertRows.push(filteredRow);
    }

    // ---------- 5. 分批 upsert 到 sales_summary ----------
    let salesSynced = 0;
    let upsertErrors: string[] = [];
    for (let i = 0; i < upsertRows.length; i += 50) {
      const batch = upsertRows.slice(i, i + 50);
      const { error } = await supabase
        .from("sales_summary")
        .upsert(batch, { onConflict: "sale_id" });
      if (error) {
        console.error("sync-summary: upsert batch error:", error.message, error.code);
        upsertErrors.push(`批次${Math.floor(i/50)+1}: ${error.code} - ${error.message}`);
      } else {
        salesSynced += batch.length;
      }
    }

    console.log(`sync-summary: 售出汇总完成 ${salesSynced} 款`);

    return NextResponse.json({
      sales_synced: salesSynced,
      returns_synced: 0,
      message: `售出汇总完成: ${salesSynced} 款`,
      diagnostics: [
        ...diagnostics,
        `分组: ${groupMap.size} 个唯一ID`,
        `upsert行数: ${upsertRows.length}`,
        `写入: ${salesSynced}`,
        ...upsertErrors.slice(0, 5),
      ],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("sync-summary error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}