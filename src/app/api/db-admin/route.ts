import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 表名 → 列名列表（与数据库实际结构一致）
const TABLE_COLUMNS: Record<string, string[]> = {
  inbound_records: ["id", "sale_id", "name", "manufacturer", "cost_price", "sell_price", "total_stock", "photo", "shelf_no", "size_80", "size_90", "size_95", "size_100", "size_105", "size_110", "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180", "inbound_date", "created_at", "updated_at"],
  sales_records: ["id", "sale_id", "product_name", "size", "quantity", "sell_price", "cost_price", "profit", "total_profit", "photo", "manufacturer", "shelf_no", "tracking_number", "order_time", "registration_date", "notes", "registrant", "member_id", "member_name", "created_at"],
  return_records: ["id", "sale_id", "name", "size", "quantity", "member_id", "member_name", "return_time", "created_at"],
  members: ["id", "name", "phone", "password", "role", "is_online", "last_online", "address", "recipient", "recipient_phone", "douyin", "created_at"],
  model_library: ["id", "name", "photo_url", "created_at"],
  model_usage: ["id", "member_id", "model_name", "created_at"],
  accounts: ["id", "name", "type", "amount", "status", "created_at"],
  live_selections: ["id", "sale_id", "name", "created_at"],
  douyin_links: ["id", "name", "url", "created_at"],
  pack_records: ["id", "member_id", "member_name", "created_at"],
  pack_items: ["id", "pack_id", "sale_id", "name", "size", "quantity", "created_at"],
  monthly_revenue: ["id", "month", "revenue", "cost", "profit", "created_at"],
  transactions: ["id", "type", "amount", "description", "date", "created_at"],
  category_data: ["id", "name", "value", "created_at"],
  platform_revenue: ["id", "platform", "revenue", "created_at"],
  settings: ["id", "key", "value", "created_at"],
  links: ["id", "name", "url", "status", "created_at"],
  web_orders: ["id", "member_id", "customer", "address", "recipient", "recipient_phone", "sale_id", "size", "quantity", "sell_price", "total_price", "tracking_number", "order_time", "status", "created_at"],
  "product-photos": ["id", "sale_id", "photo_url", "created_at"],
  sales_summary: ["id", "sale_id", "name", "photo", "shelf_no", "manufacturer", "cost_price", "sell_price", "total_sold", "total_revenue", "sell_price_info", "sales_count", "size_80", "size_90", "size_95", "size_100", "size_105", "size_110", "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180", "updated_at", "created_at"],
  returns_summary: ["id", "sale_id", "name", "photo", "shelf_no", "manufacturer", "cost_price", "total_returned", "total_return_amount", "return_price_info", "return_count", "size_80", "size_90", "size_95", "size_100", "size_105", "size_110", "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180", "updated_at", "created_at"],
  sales_daily_stats: ["id", "date", "total_amount", "total_quantity", "total_profit", "shipping_fee", "platform_fee", "created_at"],
  returns_daily_stats: ["id", "date", "total_returned", "created_at"],
};

// GET: 获取表数据（分页 + 排序 + 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const sort = searchParams.get("sort") || "created_at";
    const order = searchParams.get("order") || "desc";
    const filter = searchParams.get("filter") || "";

    if (!table) {
      return NextResponse.json({ error: "无效的表名" }, { status: 400 });
    }

    // 直接使用硬编码列定义（稳定可靠）
    let columnNames: string[] | null = TABLE_COLUMNS[table] || null;
    if (!columnNames) {
      columnNames = ["id", "created_at"]; // 最小兜底
    }
    const ascending = order === "asc";

    let query = supabase.from(table).select("*", { count: "exact" });

    if (filter) {
      const filterConditions = columnNames
        .filter((col) => col !== "id" && col !== "created_at" && col !== "updated_at")
        .map((col) => `${col}.ilike.%${filter}%`)
        .join(",");
      if (filterConditions) {
        query = query.or(filterConditions);
      }
    }

    const sortCol = columnNames.includes(sort) ? sort : "created_at";
    query = query.order(sortCol, { ascending });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [], total: count || 0, page, pageSize });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, data } = body as { table: string; data: Record<string, unknown> };
    if (!table || !TABLE_COLUMNS[table]) return NextResponse.json({ error: "无效的表名" }, { status: 400 });
    if (!data || typeof data !== "object") return NextResponse.json({ error: "缺少 data" }, { status: 400 });

    const cleanData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== "" && v !== null && v !== undefined) cleanData[k] = v;
    }

    const { data: inserted, error } = await supabase.from(table).insert(cleanData).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, id, data } = body as { table: string; id: string; data: Record<string, unknown> };
    if (!table || !TABLE_COLUMNS[table]) return NextResponse.json({ error: "无效的表名" }, { status: 400 });
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    if (!data || typeof data !== "object") return NextResponse.json({ error: "缺少 data" }, { status: 400 });

    const cleanData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== "" && v !== null && v !== undefined) cleanData[k] = v;
    }

    const { data: updated, error } = await supabase.from(table).update(cleanData).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    const id = searchParams.get("id");
    if (!table || !TABLE_COLUMNS[table]) return NextResponse.json({ error: "无效的表名" }, { status: 400 });
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}