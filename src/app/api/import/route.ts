import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { upsertSalesSummary } from "@/app/api/sales-summary/route";
import { upsertReturnsSummary } from "@/app/api/returns-summary/route";

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

// 入库清单字段映射（photo字段存放文件名，最终URL由photoFilter匹配提供）
const INBOUND_COLUMNS = [
  "sale_id", "manufacturer", "photo", "name",
  "size_80", "size_90", "size_95", "size_100", "size_105", "size_110",
  "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180",
  "cost_price", "shelf_no", "season", "style_category", "notes", "inbound_date",
];

const INBOUND_NUMBER_COLUMNS = [
  "size_80", "size_90", "size_95", "size_100", "size_105", "size_110",
  "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180",
  "cost_price",
];

// 售出清单字段映射（photo/product_name/cost_price从入库表查找，registrant自动填入）
const SALES_COLUMNS = [
  "sale_id", "size", "quantity",
  "sell_price", "notes",
  "order_time", "tracking_number",
];

const SALES_NUMBER_COLUMNS = [
  "size", "quantity", "sell_price",
];

// 退货清单字段映射（registrant自动填入）
const RETURNS_COLUMNS = [
  "sale_id", "size", "quantity", "return_price", "remarks", "return_time",
];

const RETURNS_NUMBER_COLUMNS = [
  "size", "quantity", "return_price",
];

const TABLES: Record<string, string> = {
  inbound: "inbound_records",
  sales: "sales_records",
  returns: "return_records",
};

const COLUMNS_BY_TYPE: Record<string, string[]> = {
  inbound: INBOUND_COLUMNS,
  sales: SALES_COLUMNS,
  returns: RETURNS_COLUMNS,
};

const NUMBER_COLUMNS_BY_TYPE: Record<string, string[]> = {
  inbound: INBOUND_NUMBER_COLUMNS,
  sales: SALES_NUMBER_COLUMNS,
  returns: RETURNS_NUMBER_COLUMNS,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csvContent, columnMap, importType, registrant, photoFilter } = body as {
      csvContent: string;
      columnMap: Record<string, string>;
      importType?: string;
      registrant?: string;
      photoFilter?: Record<string, string>;
    };

    const type = importType || "inbound";
    const tableName = TABLES[type] || "inbound_records";
    const DB_COLUMNS = COLUMNS_BY_TYPE[type] || INBOUND_COLUMNS;
    const NUMBER_COLUMNS = NUMBER_COLUMNS_BY_TYPE[type] || INBOUND_NUMBER_COLUMNS;
    const prefix = type + "_"; // e.g. "inbound_", "sales_", "returns_"

    const { headers, rows } = parseCSV(csvContent);
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV 内容为空" }, { status: 400 });
    }

    const dbColumns: string[] = [];
    const columnIndexes: number[] = [];

    for (const dbCol of DB_COLUMNS) {
      const mapKey = prefix + dbCol;
      const csvCol = columnMap[mapKey];
      if (csvCol) {
        const idx = headers.indexOf(csvCol);
        if (idx >= 0) {
          columnIndexes.push(idx);
          dbColumns.push(dbCol);
        }
      }
    }

    if (dbColumns.length === 0) {
      return NextResponse.json({ error: "未匹配到任何列" }, { status: 400 });
    }

    // 售出模式：预先从入库表查询所有商品的 cost_price
    let inboundCostLookup: Record<string, number> = {};
    if (type === "sales") {
      const saleIds = [...new Set(rows.map((row) => {
        const idx = columnIndexes[dbColumns.indexOf("sale_id")];
        return idx >= 0 ? (row[idx] || "").trim() : "";
      }).filter(Boolean))];

      if (saleIds.length > 0) {
        const batchSize = 200;
        for (let i = 0; i < saleIds.length; i += batchSize) {
          const batch = saleIds.slice(i, i + batchSize);
          const { data: inboundData } = await supabase
            .from("inbound_records")
            .select("sale_id, cost_price")
            .in("sale_id", batch);

          if (inboundData) {
            for (const item of inboundData) {
              const sid = (item.sale_id || "").toUpperCase();
              if (!(sid in inboundCostLookup)) {
                inboundCostLookup[sid] = Number(item.cost_price) || 0;
              }
            }
          }
        }
      }
    }

    let successCount = 0;
    let skipCount = 0;
    const errors: string[] = [];
    const batch: Record<string, unknown>[] = [];
    const affectedSaleIds = new Set<string>();
    const affectedReturnIds = new Set<string>();

    for (let r = 0; r < rows.length; r++) {
      try {
        const row = rows[r];
        const record: Record<string, unknown> = {};

        for (let i = 0; i < dbColumns.length; i++) {
          const dbCol = dbColumns[i];
          const idx = columnIndexes[i];
          const raw = row[idx];

          if (raw !== undefined && raw !== "") {
            if (NUMBER_COLUMNS.includes(dbCol)) {
              const num = parseFloat(raw.replace(/[^0-9.-]/g, ""));
              record[dbCol] = isNaN(num) ? 0 : num;
            } else {
              record[dbCol] = raw;
            }
          }
        }

        // 入库表：计算 total_stock，自动填入 registrant，匹配照片
        if (type === "inbound") {
          // 确保所有 NOT NULL 字段有默认值
          if (!record.sale_id) record.sale_id = "";
          if (!record.manufacturer) record.manufacturer = "";
          if (!record.photo || record.photo === "0" || String(record.photo).trim() === "0") record.photo = "";
          if (!record.name || record.name === "0" || String(record.name).trim() === "0") record.name = "";
          if (!record.shelf_no) record.shelf_no = "";
          if (!record.season) record.season = "";
          if (!record.style_category) record.style_category = "";
          if (!record.notes) record.notes = "";
          if (!record.inbound_date) record.inbound_date = new Date().toISOString();
          if (record.cost_price === undefined) record.cost_price = 0;

          // 确保所有尺码字段默认值为 0
          for (const s of [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180]) {
            if (record[`size_${s}`] === undefined) record[`size_${s}`] = 0;
          }

          let totalStock = 0;
          for (const s of [80, 90, 95, 100, 105, 110, 120, 130, 140, 150, 160, 170, 180]) {
            totalStock += Number(record[`size_${s}`]) || 0;
          }
          record.total_stock = totalStock;

          // 照片匹配：根据 CSV 中 photo 字段的文件名，在 photoFilter 中查找上传后的 URL
          if (photoFilter && record.photo) {
            const csvPhotoName = String(record.photo).trim();
            // 提取文件名（去路径和扩展名），与 photoFilter 的 key 匹配
            const baseName = csvPhotoName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim();
            const matchedUrl = photoFilter[baseName];
            if (matchedUrl) {
              record.photo = matchedUrl;
            }
          }
        }

        // 售出表：从入库表查找 cost_price，自动填入 registrant，计算 profit
        if (type === "sales") {
          const saleId = String(record.sale_id || "").trim().toUpperCase();
          const costPrice = inboundCostLookup[saleId] || 0;
          record.cost_price = costPrice;

          // 确保所有 NOT NULL 字段有默认值
          if (!record.sale_id) record.sale_id = "";
          if (!record.notes) record.notes = "";
          if (!record.tracking_number) record.tracking_number = "";
          if (!record.registrant) record.registrant = registrant || "";
          if (record.size === undefined) record.size = 0;
          if (record.quantity === undefined) record.quantity = 0;
          if (record.sell_price === undefined) record.sell_price = 0;
          if (record.cost_price === undefined) record.cost_price = 0;
          if (!record.order_time || record.order_time === "0") record.order_time = new Date().toISOString();

          const sellPrice = Number(record.sell_price) || 0;
          const cp = Number(record.cost_price) || 0;
          const quantity = Number(record.quantity) || 0;
          record.profit = sellPrice - cp;
          record.total_profit = (sellPrice - cp) * quantity;
        }

        // 退货表：自动填入 registrant，确保 NOT NULL 字段有默认值
        if (type === "returns") {
          if (!record.sale_id) record.sale_id = "";
          if (!record.registrant) record.registrant = registrant || "";
          if (!record.remarks) record.remarks = "";
          if (record.size === undefined) record.size = 0;
          if (record.quantity === undefined) record.quantity = 0;
          if (record.return_price === undefined) record.return_price = 0;
          if (!record.return_time || record.return_time === "0") record.return_time = new Date().toISOString();
        }

        batch.push(record);

        if (type === "sales") {
          // 强制转为大写保证一致性
          const saleId = String(record.sale_id || "").trim().toUpperCase();
          record.sale_id = saleId;
          affectedSaleIds.add(saleId);
        }
        if (type === "returns") {
          // 强制转为大写保证一致性
          const saleId = String(record.sale_id || "").trim().toUpperCase();
          record.sale_id = saleId;
          affectedReturnIds.add(saleId);
        }

        if (batch.length >= 50) {
          const { error } = await supabase.from(tableName).insert(batch);
          if (error) {
            errors.push(`批量导入错误: ${error.message}`);
          } else {
            successCount += batch.length;
          }
          batch.length = 0;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`第 ${r + 2} 行: ${errorMsg}`);
        skipCount++;
        if (skipCount > 20) break;
      }
    }

    if (batch.length > 0) {
      const { error } = await supabase.from(tableName).insert(batch);
      if (error) {
        errors.push(`批量导入错误: ${error.message}`);
      } else {
        successCount += batch.length;
      }
    }

    // 售出导入后同步更新售卖总表
    if (type === "sales" && successCount > 0) {
      const saleIds = [...affectedSaleIds].filter(Boolean);
      console.log(`[import] 开始同步 ${saleIds.length} 个 sale_id 到 sales_summary:`, saleIds.slice(0, 5));
      // 分批处理，每批 10 个，避免并发过高
      let syncedCount = 0;
      for (let i = 0; i < saleIds.length; i += 10) {
        const batch = saleIds.slice(i, i + 10);
        const results = await Promise.all(
          batch.map((sid) => upsertSalesSummary(sid).catch((e) => {
            console.error("upsertSalesSummary error:", e);
            return null;
          }))
        );
        syncedCount += results.filter((r) => r === true).length;
      }
      console.log(`[import] 同步完成: ${syncedCount}/${saleIds.length} 个 sale_id`);
    }

    // 退货导入后同步更新退货总表
    if (type === "returns" && successCount > 0) {
      const returnIds = [...affectedReturnIds].filter(Boolean);
      for (let i = 0; i < returnIds.length; i += 10) {
        const batch = returnIds.slice(i, i + 10);
        await Promise.all(
          batch.map((sid) => upsertReturnsSummary(sid).catch((e) => console.error("upsertReturnsSummary error:", e)))
        );
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      total: rows.length,
      actualCount: successCount,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `导入失败: ${errorMsg}` }, { status: 500 });
  }
}