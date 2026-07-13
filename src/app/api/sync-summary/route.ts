import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const ALL_SIZES = [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180];

async function getSalesSummaryColumns(): Promise<string[]> {
  // 命中缓存直接返回（表结构很少变化，避免每次调用都探测）
  if (cachedSalesCols) return cachedSalesCols;

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
      cachedSalesCols = Object.keys(testRow);
      return cachedSalesCols;
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
      cachedSalesCols = await probeColumns(Object.keys(testRow), "sales_summary");
      return cachedSalesCols;
    }

    // 其他错误，返回空
    console.error("probe columns unexpected error:", errMsg);
    return [];
  } catch (e) {
    console.error("probe columns catch:", e);
    return [];
  }
}

async function probeColumns(cols: string[], table: string): Promise<string[]> {
  const testSaleId = "__column_probe__";
  const testRow: Record<string, unknown> = { sale_id: testSaleId };
  for (const c of cols) {
    if (c === "sale_id") continue;
    if (c.startsWith("size_")) testRow[c] = 0;
    else if (c === "sell_price_info" || c === "return_price_info") testRow[c] = {};
    else if (c === "updated_at") testRow[c] = new Date().toISOString();
    else if (["total_sold", "total_returned", "sales_count", "return_count", "cost_price", "sell_price", "total_revenue", "total_return_amount"].includes(c)) testRow[c] = 0;
    else testRow[c] = "";
  }

  try {
    const { error } = await supabase
      .from(table)
      .upsert(testRow, { onConflict: "sale_id" });

    if (!error) {
      await supabase.from(table).delete().eq("sale_id", testSaleId);
      return cols;
    }

    const errMsg = error.message || "";
    const match = errMsg.match(/Could not find the '([^']+)' column/);
    if (match) {
      const missingCol = match[1];
      const remaining = cols.filter((c) => c !== missingCol);
      return await probeColumns(remaining, table);
    }

    console.error(`probeColumns(${table}) unexpected error:`, errMsg);
    return cols;
  } catch (e) {
    console.error(`probeColumns(${table}) catch:`, e);
    return cols;
  }
}

// 模块级缓存：避免每次调用都探测列名（表结构很少变化）
let cachedSalesCols: string[] | null = null;
let cachedReturnCols: string[] | null = null;

// 分页读取整张表的辅助函数（复用分页逻辑）
async function readAllPages(table: string, select: string): Promise<Record<string, unknown>[]> {
  let allData: Record<string, unknown>[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data: chunk, error } = await supabase
      .from(table)
      .select(select)
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order("id", { ascending: true });
    if (error) {
      console.error(`readAllPages(${table}) page ${page} error:`, error.message);
      break;
    }
    if (!chunk || chunk.length === 0) break;
    allData = allData.concat(chunk as unknown as Record<string, unknown>[]);
    if (chunk.length < pageSize) break;
    page++;
  }
  return allData;
}

export async function POST(request: Request) {
  try {
    const diagnostics: string[] = [];

    // 检查是否为全量重同步模式（先清空 daily_stats 再重写，用于清理累加脏数据）
    let fullResync = false;
    try {
      const body = await request.json();
      fullResync = body?.full_resync === true;
    } catch { /* 无 body 时默认 false */ }

    if (fullResync) {
      diagnostics.push("全量重同步模式：清空 sales_daily_stats 和 returns_daily_stats");
      await supabase.from("sales_daily_stats").delete().neq("date", "__never__");
      await supabase.from("returns_daily_stats").delete().neq("date", "__never__");
    }

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

    // ---------- 1. 并行读取所有售出记录和入库记录 ----------
    let [allSalesRecords, allInboundRecords] = await Promise.all([
      readAllPages("sales_records", "*"),
      readAllPages("inbound_records", "sale_id, photo, shelf_no, manufacturer, name, cost_price"),
    ]);
    diagnostics.push(`读取 ${allSalesRecords.length} 条售出记录`);
    console.log(`sync-summary: 读取 ${allSalesRecords.length} 条售出记录`);
    console.log(`sync-summary: 读取 ${allInboundRecords.length} 条入库记录`);

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
    let zeroQtyFullSamples: Record<string, unknown>[] = [];
    let zeroWithSaleId = 0;
    let zeroWithoutSaleId = 0;
    for (const r of allSalesRecords) {
      const rawQ = r.quantity;
      const q = Number(rawQ);
      const typeOfQ = typeof rawQ;
      if (qtyTypeSamples.length < 5) qtyTypeSamples.push(`${typeOfQ}=${rawQ}`);
      if (rawQ === null || rawQ === undefined) nullQtyCount++;
      else if (isNaN(q) || q === 0) {
        zeroQtyCount++;
        const sid = String(r.sale_id || "").trim();
        if (sid) zeroWithSaleId++;
        else zeroWithoutSaleId++;
        if (zeroQtyFullSamples.length < 2) {
          zeroQtyFullSamples.push({ ...r });
        }
      } else { validQtyCount++; sumQty += q; }
    }
    diagnostics.push(`有效数量记录: ${validQtyCount}条, 数量总和: ${sumQty}; 零数量: ${zeroQtyCount}条(有sale_id:${zeroWithSaleId}, 无sale_id:${zeroWithoutSaleId}); 空值: ${nullQtyCount}条`);

    // 清理无效记录（sale_id 为空）
    if (zeroWithoutSaleId > 0) {
      diagnostics.push(`发现 ${zeroWithoutSaleId} 条无效记录(sale_id为空)，正在清理...`);
      const { error: cleanError } = await supabase
        .from("sales_records")
        .delete()
        .or("sale_id.is.null,sale_id.eq.");
      if (cleanError) {
        diagnostics.push(`清理失败: ${cleanError.message}`);
      } else {
        diagnostics.push(`已清理无效记录`);
        // 重新统计有效数量
        allSalesRecords = allSalesRecords.filter((r) => String(r.sale_id || "").trim());
        sumQty = 0;
        for (const r of allSalesRecords) sumQty += Number(r.quantity) || 0;
        diagnostics.push(`清理后有效数量总和: ${sumQty}`);
      }
    }
    diagnostics.push(`quantity类型样本: ${qtyTypeSamples.join("; ")}`);
    if (zeroQtyFullSamples.length > 0) {
      const sample0 = zeroQtyFullSamples[0];
      diagnostics.push(`零数量样本字段: ${Object.keys(sample0).join(",")}`);
      diagnostics.push(`零数量样本值: sale_id=${sample0.sale_id}, size=${sample0.size}, quantity=${sample0.quantity}, sell_price=${sample0.sell_price}, product_name=${sample0.product_name}`);
    }

    // ---------- 2. 构建入库查找表 (uppercase sale_id -> 入库信息) ----------
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

    diagnostics.push(`分组: ${groupMap.size} 个唯一ID`);
    diagnostics.push(`upsert行数: ${upsertRows.length}`);
    diagnostics.push(`写入: ${salesSynced}`);

    // ========== 退货汇总 ==========
    let returnsSynced = 0;
    let allReturnRecords: Record<string, unknown>[] = [];

    const { count: returnCount } = await supabase
      .from("return_records")
      .select("*", { count: "exact", head: true });
    diagnostics.push(`return_records 表共 ${returnCount ?? 0} 条记录`);

    if (returnCount && returnCount > 0) {
      // 探测 returns_summary 表列（带缓存）
      let returnCols: string[] = [];
      if (cachedReturnCols) {
        returnCols = cachedReturnCols;
      } else {
        const returnTestRow: Record<string, unknown> = {
          sale_id: "__column_probe__",
          photo: "", name: "", shelf_no: "", manufacturer: "",
          cost_price: 0, total_returned: 0, total_return_amount: 0,
          return_price_info: {}, return_count: 0,
          updated_at: new Date().toISOString(),
        };
        for (const s of ALL_SIZES) returnTestRow[`size_${s}`] = 0;

        try {
          const { error: testErr } = await supabase
            .from("returns_summary")
            .upsert(returnTestRow, { onConflict: "sale_id" });
          if (!testErr) {
            await supabase.from("returns_summary").delete().eq("sale_id", "__column_probe__");
            returnCols = Object.keys(returnTestRow);
          } else {
            const match = testErr.message.match(/Could not find the '([^']+)' column/);
            if (match) {
              delete returnTestRow[match[1]];
              returnCols = await probeColumns(Object.keys(returnTestRow), "returns_summary");
            }
          }
        } catch {
          returnCols = Object.keys(returnTestRow);
        }
        cachedReturnCols = returnCols;
      }
      diagnostics.push(`returns_summary 表有 ${returnCols.length} 列`);

      // 读取所有退货记录
      allReturnRecords = await readAllPages("return_records", "*");
      diagnostics.push(`读取 ${allReturnRecords.length} 条退货记录`);

      // 按 sale_id 分组汇总退货
      const returnGroupMap = new Map<string, {
        sizes: Record<string, number>;
        totalReturned: number;
        totalReturnAmount: number;
        priceMap: Map<number, string>;
        records: Record<string, unknown>[];
      }>();

      for (const row of allReturnRecords) {
        const sid = String(row.sale_id || "").toUpperCase();
        if (!sid) continue;

        let group = returnGroupMap.get(sid);
        if (!group) {
          group = {
            sizes: {},
            totalReturned: 0,
            totalReturnAmount: 0,
            priceMap: new Map(),
            records: [],
          };
          for (const s of ALL_SIZES) group.sizes[`size_${s}`] = 0;
          returnGroupMap.set(sid, group);
        }

        const qty = Number(row.quantity) || 0;
        const sz = Number(row.size) || 0;
        const rp = Number(row.return_price) || 0;

        group.records.push(row);
        if (sz >= 80 && sz <= 180) {
          group.sizes[`size_${sz}`] = (group.sizes[`size_${sz}`] || 0) + qty;
        }
        group.totalReturned += qty;
        group.totalReturnAmount += rp * qty;

        if (rp > 0) {
          const rt = String(row.return_time || row.created_at || "");
          const existing = group.priceMap.get(rp);
          if (!existing || rt > existing) {
            group.priceMap.set(rp, rt);
          }
        }
      }

      // 构建退货 upsert 数据
      const returnUpsertRows: Record<string, unknown>[] = [];
      for (const [sid, group] of returnGroupMap) {
        const inbound = inboundMap.get(sid);
        let fallbackName = "";
        let fallbackManufacturer = "";
        let fallbackShelfNo = "";
        if (!inbound && group.records.length > 0) {
          const first = group.records[0];
          fallbackName = String(first.product_name || "");
          fallbackManufacturer = String(first.manufacturer || "");
          fallbackShelfNo = String(first.shelf_no || "");
        }

        const returnPriceInfo: Record<string, string> = {};
        for (const [price, time] of group.priceMap) {
          returnPriceInfo[String(price)] = time;
        }

        const fullReturnRow: Record<string, unknown> = {
          sale_id: sid,
          photo: inbound?.photo || "",
          name: inbound?.name || fallbackName,
          shelf_no: inbound?.shelf_no || fallbackShelfNo,
          manufacturer: inbound?.manufacturer || fallbackManufacturer,
          cost_price: inbound?.cost_price || 0,
          ...group.sizes,
          total_returned: group.totalReturned,
          total_return_amount: group.totalReturnAmount,
          return_price_info: returnPriceInfo,
          return_count: group.records.length,
          updated_at: new Date().toISOString(),
        };

        const filteredReturnRow: Record<string, unknown> = {};
        for (const col of returnCols) {
          if (col in fullReturnRow) {
            filteredReturnRow[col] = fullReturnRow[col];
          }
        }
        returnUpsertRows.push(filteredReturnRow);
      }

      // 分批 upsert 退货
      for (let i = 0; i < returnUpsertRows.length; i += 50) {
        const batch = returnUpsertRows.slice(i, i + 50);
        const { error } = await supabase
          .from("returns_summary")
          .upsert(batch, { onConflict: "sale_id" });
        if (error) {
          diagnostics.push(`退货批次${Math.floor(i / 50) + 1}: ${error.code} - ${error.message}`);
        } else {
          returnsSynced += batch.length;
        }
      }

      diagnostics.push(`退货分组: ${returnGroupMap.size} 个唯一ID, 写入: ${returnsSynced}`);
    }

    // ========== 归档每日统计到 sales_daily_stats（含快递费和平台抽点）==========
    let dailyStatsSynced = 0;
    if (allSalesRecords.length > 0) {
      // 并行读取快递费率和平台抽点率
      const [shippingRatesResult, platformRateResult] = await Promise.all([
        supabase.from("settings").select("value").eq("key", "shipping_rates").single(),
        supabase.from("settings").select("value").eq("key", "platform_fee_rate").single(),
      ]);
      const sRates = (shippingRatesResult.data?.value as Record<string, unknown>) || {};
      const sRate1 = Number(sRates.rate1) || 0;
      const sRate2 = Number(sRates.rate2) || 0;
      const sRate3 = Number(sRates.rate3) || 0;
      const sPlatformRate = Number(platformRateResult.data?.value) || 5;

      const dailyMap = new Map<string, {
        total_amount: number; total_quantity: number; total_profit: number;
        trackingMap: Map<string, number>;
      }>();
      const inboundCostMap = new Map<string, number>();
      for (const ib of allInboundRecords) {
        inboundCostMap.set(String(ib.sale_id || "").toUpperCase(), Number(ib.cost_price) || 0);
      }

      for (const row of allSalesRecords) {
        const ot = String(row.order_time || "");
        if (!ot) continue;
        const date = ot.slice(0, 10);
        if (!dailyMap.has(date)) dailyMap.set(date, { total_amount: 0, total_quantity: 0, total_profit: 0, trackingMap: new Map() });
        const entry = dailyMap.get(date)!;
        const price = Number(row.sell_price) || 0;
        const qty = Number(row.quantity) || 0;
        const cost = inboundCostMap.get(String(row.sale_id || "").toUpperCase()) || 0;
        entry.total_amount += price * qty;
        entry.total_quantity += qty;
        entry.total_profit += (price - cost) * qty;

        // 按面单号累计件数
        const tn = String(row.tracking_number || "").trim();
        if (tn && tn !== "0") {
          entry.trackingMap.set(tn, (entry.trackingMap.get(tn) || 0) + qty);
        }
      }

      // 批量 upsert 日统计（全量重算 → 直接覆盖，不累加，避免重复执行导致数据翻倍）
      const allDates = Array.from(dailyMap.keys());
      if (allDates.length > 0) {
        const dailyUpsertBatch = allDates.map((date) => {
          const stats = dailyMap.get(date)!;
          // 计算快递费
          let shippingFee = 0;
          for (const [, qty] of stats.trackingMap) {
            if (qty <= 4) shippingFee += sRate1;
            else if (qty <= 7) shippingFee += sRate2;
            else shippingFee += sRate3;
          }
          // 计算平台抽点
          const platformFee = stats.total_quantity >= 100 ? stats.total_amount * (sPlatformRate / 100) : 0;

          // 覆盖模式：直接用本次全量聚合结果，不累加已有值
          return {
            date,
            total_amount: stats.total_amount,
            total_quantity: stats.total_quantity,
            total_profit: stats.total_profit,
            shipping_fee: shippingFee,
            platform_fee: platformFee,
          };
        });

        const { error: dailyUpsertError } = await supabase
          .from("sales_daily_stats")
          .upsert(dailyUpsertBatch, { onConflict: "date" });

        if (dailyUpsertError) {
          diagnostics.push(`销售日统计批量写入失败: ${dailyUpsertError.message}`);
        } else {
          dailyStatsSynced = dailyUpsertBatch.length;
        }
      }
    }
    diagnostics.push(`销售日统计归档: ${dailyStatsSynced} 天`);

    // ========== 归档每日退货统计到 returns_daily_stats ==========
    let returnDailySynced = 0;
    if (allReturnRecords && allReturnRecords.length > 0) {
      const retDailyMap = new Map<string, number>();
      for (const row of allReturnRecords) {
        // 退货日期用 return_time，没有时回退到 created_at
        const rt = String(row.return_time || row.created_at || "");
        if (!rt) continue;
        const date = rt.slice(0, 10);
        retDailyMap.set(date, (retDailyMap.get(date) || 0) + (Number(row.quantity) || 0));
      }

      // 批量 upsert 退货日统计（全量重算 → 直接覆盖，不累加）
      const allReturnDates = Array.from(retDailyMap.keys());
      if (allReturnDates.length > 0) {
        const retDailyUpsertBatch = allReturnDates.map((date) => ({
          date,
          total_returned: retDailyMap.get(date) || 0,
        }));

        const { error: retDailyUpsertError } = await supabase
          .from("returns_daily_stats")
          .upsert(retDailyUpsertBatch, { onConflict: "date" });

        if (retDailyUpsertError) {
          diagnostics.push(`退货日统计批量写入失败: ${retDailyUpsertError.message}`);
        } else {
          returnDailySynced = retDailyUpsertBatch.length;
        }
      }
    }
    diagnostics.push(`退货日统计归档: ${returnDailySynced} 天`);

    return NextResponse.json({
      sales_synced: salesSynced,
      returns_synced: returnsSynced,
      message: `售出${salesSynced}款, 退货${returnsSynced}款`,
      diagnostics: [
        ...diagnostics,
        ...upsertErrors.slice(0, 5),
      ],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("sync-summary error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}