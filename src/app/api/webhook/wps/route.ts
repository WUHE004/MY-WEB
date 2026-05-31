import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const API_KEY = process.env.WEBHOOK_API_KEY || "wps-webhook-key-change-me";
const ALLOWED_TABLES = [
  "products", "accounts", "links",
  "monthly_revenue", "transactions",
  "category_data", "platform_revenue",
];

const TABLE_COLUMNS: Record<string, string[]> = {
  products: ["sale_id", "manufacturer", "photo", "name", "total_stock", "sold_qty", "remaining_stock", "shelf_no", "size_80", "size_90", "size_95", "size_100", "size_105", "size_110", "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180", "stock_warning", "cost_price", "sell_price", "profit", "return_qty", "return_rate", "inventory_value", "last_order_time", "status"],
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

  try {
    const body = (await request.json()) as SyncPayload;
    const { table, records, mode = "append", id_field } = body;

    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: `无效的表类型: ${table}` }, { status: 400 });
    }

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "records 必须是非空数组" }, { status: 400 });
    }

    let inserted = 0;
    let upserted = 0;
    let skipped = 0;

    if (mode === "replace") {
      await supabase.from(table).delete().neq("id", "__never__");
      inserted = records.length;
    } else if (mode === "upsert" && id_field) {
      const { error } = await supabase.from(table).upsert(records, { onConflict: id_field, ignoreDuplicates: false });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      upserted = records.length;
    } else {
      for (const record of records) {
        const { error } = await supabase.from(table).insert(record);
        if (error) {
          skipped++;
        } else {
          inserted++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      table,
      inserted,
      upserted,
      skipped,
      total: records.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "running",
    tables: ALLOWED_TABLES,
    usage: {
      method: "POST",
      header: "x-api-key: your-api-key",
      body: {
        table: "products",
        mode: "append | upsert | replace",
        id_field: "sale_id",
        records: [{ name: "商品名", sale_id: "S001", sell_price: 99 }],
      },
    },
  });
}