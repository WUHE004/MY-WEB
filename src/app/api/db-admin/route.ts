import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { TABLE_COLUMNS, SIZE_COLS } from "@/lib/db-tables";

// 表名 → 列名列表已移至 src/lib/db-tables.ts(db-admin 各 API 共用)

// 文本类型列（可用 ilike 模糊搜索；real/numeric/timestamp/uuid/jsonb 列用 ilike 会报
// "operator does not exist: real ~~* unknown" 等类型错误，故只对文本列模糊匹配）
const TEXT_COLUMNS: Record<string, string[]> = {
  inbound_records: ["sale_id", "manufacturer", "photo", "name", "shelf_no", "season", "style_category", "notes"],
  sales_records: ["sale_id", "photo", "product_name", "manufacturer", "notes", "tracking_number", "registrant", "shelf_no"],
  return_records: ["sale_id", "remarks", "registrant"],
  members: ["name", "phone", "password", "role", "address", "recipient", "recipient_phone", "douyin"],
  model_library: ["name", "photo_url"],
  model_usage: ["member_id", "model_name"],
  live_selections: ["member_name", "sale_id"],
  live_shoot_scripts: ["user_idea", "script_content"],
  live_track_news: ["date", "category_insights"],
  douyin_links: ["name", "live_url", "qr_code"],
  pack_records: ["tracking_number", "status", "submitter", "packer"],
  pack_items: ["sale_id", "photo", "product_name", "shelf_no", "order_time", "manufacturer"],
  payment_qr_codes: ["type", "image_url", "description"],
  product_display: ["sale_id"],
  returns_daily_stats: [],
  returns_summary: ["sale_id", "photo", "name", "shelf_no", "manufacturer"],
  sales_daily_stats: [],
  sales_summary: ["sale_id", "photo", "name", "shelf_no", "manufacturer"],
  settings: ["key"],
  shipping_tracks: ["tracking_number", "status", "location", "time", "message"],
  sms_codes: ["phone", "code", "type"],
  web_orders: ["customer", "address", "recipient", "recipient_phone", "sale_id", "payment_status", "payment_method", "member_id", "member_name", "tracking_number", "shipping_status", "shipping_company"],
};

// 数字类型列（筛选值为数字时用 eq 精确匹配）
const NUMERIC_COLUMNS: Record<string, string[]> = {
  inbound_records: ["cost_price", "total_stock", ...SIZE_COLS],
  sales_records: ["size", "quantity", "sell_price", "cost_price", "profit", "total_profit"],
  return_records: ["size", "quantity", "return_price"],
  model_library: ["sort_order"],
  pack_items: ["pack_id", "size", "quantity", "sell_price"],
  product_display: ["sell_price"],
  returns_daily_stats: ["total_returned"],
  returns_summary: ["total_returned", "return_count", ...SIZE_COLS],
  sales_daily_stats: ["total_amount", "total_quantity", "total_profit", "shipping_fee", "platform_fee"],
  sales_summary: ["total_sold", "sales_count", ...SIZE_COLS],
  shipping_tracks: ["order_id"],
  web_orders: ["size", "quantity", "sell_price", "total_price"],
};

// GET: 获取表数据（分页 + 排序 + 筛选）
// 缓存: 表 → 实际可用的筛选列（硬编码定义可能与真实 schema 漂移，探测后自动修正）
const availableFilterCols: Record<string, { text: string[]; num: string[] }> = {};

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

    // 初始化该表的可用筛选列缓存
    if (!availableFilterCols[table]) {
      availableFilterCols[table] = {
        text: (TEXT_COLUMNS[table] || []).filter((c) => columnNames.includes(c)),
        num: (NUMERIC_COLUMNS[table] || []).filter((c) => columnNames.includes(c)),
      };
    }

    const trimmed = filter.trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // 整数类型列（size/quantity/count 等），小数筛选值对其 eq 匹配会报
    // "invalid input syntax for type integer"，故小数时跳过这些列
    const isIntCol = (c: string) =>
      /^(size|quantity|.*_count|total_sold|total_returned|total_stock|total_quantity|sort_order|pack_id|order_id)/.test(c);

    let currentSortCol = columnNames.includes(sort) ? sort : "created_at";

    // 构建查询（闭包引用可变的列缓存与排序列，失败剔除后可重建重试）
    const buildQuery = () => {
      let query = supabase.from(table).select("*", { count: "exact" });
      if (filter) {
        // 文本列用 ilike 模糊匹配；数字列在筛选值为数字时用 eq 精确匹配
        // （对 real/numeric/timestamp 等非文本列用 ilike 会触发 "operator does not exist" 类型错误）
        const cols = availableFilterCols[table];
        const conditions = cols.text.map((col) => `${col}.ilike.%${filter}%`);
        if (trimmed && /^-?\d+$/.test(trimmed)) {
          // int4 范围外的长数字（如 15 位面单号）跳过 integer 列，避免 "out of range for type integer"；
          // 超过 1e15 的超大数字连 real 列也跳过；文本列的 ilike 模糊匹配不受影响
          const n = Number(trimmed);
          const inInt4 = Number.isFinite(n) && n >= -2147483648 && n <= 2147483647;
          const safeReal = Number.isFinite(n) && Math.abs(n) <= 1e15;
          for (const col of cols.num) {
            if (isIntCol(col) ? !inInt4 : !safeReal) continue;
            conditions.push(`${col}.eq.${trimmed}`);
          }
        } else if (trimmed && /^-?\d+\.\d+$/.test(trimmed)) {
          for (const col of cols.num) {
            if (!isIntCol(col)) conditions.push(`${col}.eq.${trimmed}`);
          }
        }
        if (conditions.length > 0) {
          query = query.or(conditions.join(","));
        }
      }
      return query.order(currentSortCol, { ascending }).range(from, to);
    };

    let { data, error, count } = await buildQuery();

    // 硬编码列定义与真实 schema 漂移时（如列实际不存在），从错误信息提取列名修正后重试：
    // - 筛选列不存在 → 从可用列缓存剔除
    // - 排序列不存在（如 settings 表无 created_at）→ 降级到首列排序
    let retries = 0;
    let sortDowngraded = false;
    while (error && retries < 6 && /column .+ does not exist/.test(error.message || "")) {
      const m = (error.message || "").match(/column [^.]+\.(\w+) does not exist/);
      if (!m) break;
      const bad = m[1];
      if (bad === currentSortCol) {
        if (sortDowngraded) break;
        currentSortCol = columnNames[0] || "id";
        sortDowngraded = true;
      } else {
        const cols = availableFilterCols[table];
        cols.text = cols.text.filter((c) => c !== bad);
        cols.num = cols.num.filter((c) => c !== bad);
      }
      ({ data, error, count } = await buildQuery());
      retries++;
    }

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