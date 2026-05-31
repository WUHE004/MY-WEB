import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

const PRODUCT_COLUMNS = [
  "sale_id", "manufacturer", "photo", "name",
  "total_stock", "sold_qty", "remaining_stock", "shelf_no",
  "size_80", "size_90", "size_95", "size_100", "size_105", "size_110",
  "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180",
  "stock_warning", "cost_price", "sell_price", "profit",
  "return_qty", "return_rate", "inventory_value", "last_order_time",
  "status",
];

const NUMBER_COLUMNS = [
  "total_stock", "sold_qty", "remaining_stock",
  "size_80", "size_90", "size_95", "size_100", "size_105", "size_110",
  "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180",
  "stock_warning", "cost_price", "sell_price", "profit",
  "return_qty", "return_rate", "inventory_value"
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csvContent, columnMap } = body as {
      csvContent: string;
      columnMap: Record<string, string>;
    };

    const { headers, rows } = parseCSV(csvContent);
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV 内容为空" }, { status: 400 });
    }

    const dbColumns: string[] = [];
    const columnIndexes: number[] = [];
    const saleIdIndex = headers.indexOf(columnMap.sale_id || "");
    const nameIndex = headers.indexOf(columnMap.name || "");

    for (const dbCol of PRODUCT_COLUMNS) {
      const csvCol = columnMap[dbCol];
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

    let successCount = 0;
    let skipCount = 0;
    const errors: string[] = [];
    const batch: Record<string, unknown>[] = [];

    for (let r = 0; r < rows.length && r < 10000; r++) {
      try {
        const row = rows[r];
        const saleId = saleIdIndex >= 0 ? (row[saleIdIndex] || "") : "";
        const name = nameIndex >= 0 ? (row[nameIndex] || "") : "";

        let id = "";
        if (saleId) {
          id = `sale_${saleId}`;
        } else if (name) {
          id = `name_${name}_${Date.now()}_${r}`;
        } else {
          id = `auto_${Date.now()}_${r}`;
        }

        const record: Record<string, unknown> = { id };

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

        // 确保所有必填字段都有默认值
        for (const dbCol of PRODUCT_COLUMNS) {
          if (!(dbCol in record)) {
            if (NUMBER_COLUMNS.includes(dbCol)) {
              record[dbCol] = 0;
            } else {
              record[dbCol] = "";
            }
          }
        }

        batch.push(record);

        if (batch.length >= 50) {
          const { error } = await supabase.from("products").upsert(batch, { onConflict: "id" });
          if (error) {
            errors.push(`批量导入错误: ${error.message}`);
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
      const { error } = await supabase.from("products").upsert(batch, { onConflict: "id" });
      if (error) {
        errors.push(`批量导入错误: ${error.message}`);
      }
    }

    // 重新从数据库读取实际导入数量
    const { count, data: actualData, error: countError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: false })
      .limit(0);

    const actualCount = countError ? 0 : (count || 0);

    return NextResponse.json({
      success: errors.length === 0,
      total: rows.length,
      actualCount,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `导入失败: ${errorMsg}` }, { status: 500 });
  }
}