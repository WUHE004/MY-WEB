import { NextRequest, NextResponse } from "next/server";
import { initDatabase } from "@/lib/schema";
import { getDbSync, scheduleSave } from "@/lib/db";
import type { SqlValue } from "sql.js";

const API_KEY = process.env.WEBHOOK_API_KEY || "wps-webhook-key-change-me";
const ALLOWED_TABLES = [
  "products",
  "accounts",
  "links",
  "monthly_revenue",
  "transactions",
  "category_data",
  "platform_revenue",
];

const TABLE_COLUMNS: Record<string, string[]> = {
  products: ["name", "sku", "category", "price", "stock", "status", "platform"],
  accounts: ["name", "platform", "handle", "followers", "posts", "engagement", "status", "avatar", "growth"],
  links: ["name", "url", "short_url", "platform", "clicks", "conversions", "status"],
  monthly_revenue: ["month", "revenue", "cost"],
  transactions: ["type", "amount", "description", "date", "platform"],
  category_data: ["name", "value", "color"],
  platform_revenue: ["name", "revenue", "cost"],
};

interface SyncPayload {
  table: string;
  records: Record<string, unknown>[];
  mode?: "append" | "upsert" | "replace";
  id_field?: string;
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== API_KEY) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  await initDatabase();

  try {
    const body = (await request.json()) as SyncPayload;
    const { table, records, mode = "append", id_field } = body;

    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json(
        { error: `无效的表类型: ${table}` },
        { status: 400 }
      );
    }

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { error: "records 必须是非空数组" },
        { status: 400 }
      );
    }

    const columns = TABLE_COLUMNS[table];
    const db = getDbSync();

    let upserted = 0;
    let inserted = 0;
    let skipped = 0;

    if (mode === "replace" && id_field) {
      db.run(`DELETE FROM ${table}`);
    }

    for (const record of records) {
      const rowColumns: string[] = [];
      const values: SqlValue[] = [];
      let idValue: SqlValue = null;

      for (const col of columns) {
        if (record[col] !== undefined) {
          rowColumns.push(col);
          values.push(record[col] as SqlValue);
        }
      }

      if (rowColumns.length === 0) {
        skipped++;
        continue;
      }

      try {
        if (mode === "upsert" && id_field && record[id_field] !== undefined) {
          idValue = record[id_field] as SqlValue;

          const existing = db.exec(
            `SELECT id FROM ${table} WHERE ${id_field} = ?`,
            [idValue]
          );

          if (
            existing.length > 0 &&
            existing[0].values.length > 0
          ) {
            const setClauses = rowColumns
              .map((col) => `${col} = ?`)
              .join(", ");
            const updateSql = `UPDATE ${table} SET ${setClauses} WHERE ${id_field} = ?`;
            db.run(updateSql, [...values, idValue]);
            upserted++;
            continue;
          }
        }

        if (mode === "replace" && !id_field) {
          inserted++;
          continue;
        }

        const placeholders = rowColumns.map(() => "?").join(", ");
        const insertSql = `INSERT INTO ${table} (${rowColumns.join(", ")}) VALUES (${placeholders})`;
        db.run(insertSql, values);
        inserted++;
      } catch (err) {
        console.error(`Error inserting record into ${table}:`, err);
        skipped++;
      }
    }

    scheduleSave();

    return NextResponse.json({
      success: true,
      table,
      inserted,
      upserted,
      skipped,
      total: records.length,
    });
  } catch (error) {
    console.error("Webhook sync error:", error);
    return NextResponse.json(
      { error: "数据处理失败" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "running",
    tables: ALLOWED_TABLES,
    schemas: TABLE_COLUMNS,
    usage: {
      method: "POST",
      header: "x-api-key: your-api-key",
      body: {
        table: "products",
        mode: "append | upsert | replace",
        id_field: "sku (用于upsert模式)",
        records: [{ name: "商品名", price: 99 }],
      },
    },
    wpsAutomationGuide: {
      trigger: "修改记录 / 新增记录 / 定时触发",
      action: "发送HTTP请求",
      method: "POST",
      bodyExample: {
        table: "products",
        mode: "upsert",
        id_field: "sku",
        records: [
          {
            name: "{{商品名}}",
            sku: "{{SKU}}",
            price: "{{价格}}",
            stock: "{{库存}}",
          },
        ],
      },
    },
  });
}