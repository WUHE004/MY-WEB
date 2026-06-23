import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 禁止操作的表（安全白名单外的表）
const ALLOWED_TABLES = [
  "inbound_records", "sales_records", "return_records", "members",
  "model_library", "model_usage", "accounts", "live_selections",
  "douyin_links", "pack_records", "pack_items", "monthly_revenue",
  "transactions", "category_data", "platform_revenue", "settings", "links",
];

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

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: "无效的表名" }, { status: 400 });
    }

    const ascending = order === "asc";

    // 先获取列信息用于筛选
    const { data: columns } = await supabase
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", table);

    const columnNames = (columns || []).map((c) => c.column_name as string);

    // 构建查询
    let query = supabase.from(table).select("*", { count: "exact" });

    // 筛选：对所有文本列做 ilike 模糊匹配
    if (filter) {
      const filterConditions = columnNames
        .filter((col) => col !== "id" && col !== "created_at" && col !== "updated_at")
        .map((col) => `${col}.ilike.%${filter}%`)
        .join(",");
      if (filterConditions) {
        query = query.or(filterConditions);
      }
    }

    // 排序
    const sortCol = columnNames.includes(sort) ? sort : "created_at";
    query = query.order(sortCol, { ascending });

    // 分页
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: 新增行
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, data } = body as { table: string; data: Record<string, unknown> };

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: "无效的表名" }, { status: 400 });
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "缺少 data" }, { status: 400 });
    }

    // 清理空值
    const cleanData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== "" && v !== null && v !== undefined) {
        cleanData[k] = v;
      }
    }

    const { data: inserted, error } = await supabase
      .from(table)
      .insert(cleanData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: inserted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT: 更新行
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, id, data } = body as { table: string; id: string; data: Record<string, unknown> };

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: "无效的表名" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "缺少 data" }, { status: 400 });
    }

    // 清理空值
    const cleanData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== "" && v !== null && v !== undefined) {
        cleanData[k] = v;
      }
    }

    const { data: updated, error } = await supabase
      .from(table)
      .update(cleanData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: 删除行
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    const id = searchParams.get("id");

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: "无效的表名" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    }

    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}