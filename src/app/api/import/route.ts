import { NextRequest, NextResponse } from "next/server";
import { initDatabase } from "@/lib/schema";
import { getDbSync, scheduleSave } from "@/lib/db";
import type { SqlValue } from "sql.js";

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

const TABLE_SCHEMAS: Record<string, { table: string; columns: string[]; autoColumns: string[] }> = {
  products: {
    table: "products",
    columns: ["name", "sku", "category", "price", "stock", "status", "platform"],
    autoColumns: ["id", "created_at", "updated_at"],
  },
  accounts: {
    table: "accounts",
    columns: ["name", "platform", "handle", "followers", "posts", "engagement", "status", "avatar", "growth"],
    autoColumns: ["id", "created_at", "updated_at"],
  },
  links: {
    table: "links",
    columns: ["name", "url", "short_url", "platform", "clicks", "conversions", "status"],
    autoColumns: ["id", "created_at", "updated_at"],
  },
  monthly_revenue: {
    table: "monthly_revenue",
    columns: ["month", "revenue", "cost"],
    autoColumns: ["id"],
  },
  transactions: {
    table: "transactions",
    columns: ["type", "amount", "description", "date", "platform"],
    autoColumns: ["id", "created_at"],
  },
  category_data: {
    table: "category_data",
    columns: ["name", "value", "color"],
    autoColumns: ["id"],
  },
  platform_revenue: {
    table: "platform_revenue",
    columns: ["name", "revenue", "cost"],
    autoColumns: ["id"],
  },
};

export async function POST(request: NextRequest) {
  await initDatabase();

  try {
    const body = await request.json();
    const { table, csvContent, columnMap } = body as {
      table: string;
      csvContent: string;
      columnMap: Record<string, string>;
    };

    const schema = TABLE_SCHEMAS[table];
    if (!schema) {
      return NextResponse.json({ error: "无效的表类型" }, { status: 400 });
    }

    const { headers, rows } = parseCSV(csvContent);
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV 内容为空" }, { status: 400 });
    }

    const columnIndexes: number[] = [];
    const dbColumns: string[] = [];
    for (const dbCol of schema.columns) {
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

    const placeholders = dbColumns.map(() => "?").join(", ");
    const insertSql = `INSERT OR REPLACE INTO ${schema.table} (${dbColumns.join(", ")}) VALUES (${placeholders})`;

    let importedCount = 0;
    let skipCount = 0;

    for (let r = 0; r < rows.length && r < 10000; r++) {
      const values: SqlValue[] = [];
      let hasValues = false;
      for (const idx of columnIndexes) {
        const val = rows[r][idx];
        if (val !== undefined && val !== "") hasValues = true;
        values.push(val || null);
      }
      if (hasValues) {
        try {
          const db = getDbSync();
          db.run(insertSql, values);
          importedCount++;
        } catch {
          skipCount++;
        }
      } else {
        skipCount++;
      }
    }

    scheduleSave();

    return NextResponse.json({
      success: true,
      importedCount,
      skipCount,
      total: rows.length,
    });
  } catch (error) {
    console.error("CSV import error:", error);
    return NextResponse.json({ error: "导入失败" }, { status: 500 });
  }
}