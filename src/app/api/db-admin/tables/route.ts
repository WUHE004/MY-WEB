import { NextResponse } from "next/server";

// 表名 → 中文名 + 列定义
const TABLE_SCHEMAS: Record<string, { label: string; columns: Array<{ name: string; type: string; nullable: boolean }> }> = {
  inbound_records: {
    label: "入库记录",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "sale_id", type: "text", nullable: true },
      { name: "name", type: "text", nullable: true },
      { name: "manufacturer", type: "text", nullable: true },
      { name: "cost_price", type: "numeric", nullable: true },
      { name: "sell_price", type: "numeric", nullable: true },
      { name: "total_stock", type: "integer", nullable: true },
      { name: "photo", type: "text", nullable: true },
      { name: "shelf_no", type: "text", nullable: true },
      { name: "size_80", type: "integer", nullable: true },
      { name: "size_90", type: "integer", nullable: true },
      { name: "size_95", type: "integer", nullable: true },
      { name: "size_100", type: "integer", nullable: true },
      { name: "size_105", type: "integer", nullable: true },
      { name: "size_110", type: "integer", nullable: true },
      { name: "size_120", type: "integer", nullable: true },
      { name: "size_130", type: "integer", nullable: true },
      { name: "size_140", type: "integer", nullable: true },
      { name: "size_150", type: "integer", nullable: true },
      { name: "size_160", type: "integer", nullable: true },
      { name: "size_170", type: "integer", nullable: true },
      { name: "size_180", type: "integer", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
      { name: "updated_at", type: "timestamptz", nullable: true },
    ],
  },
  sales_records: {
    label: "销售记录",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "sale_id", type: "text", nullable: true },
      { name: "name", type: "text", nullable: true },
      { name: "size", type: "text", nullable: true },
      { name: "quantity", type: "integer", nullable: true },
      { name: "sell_price", type: "numeric", nullable: true },
      { name: "member_id", type: "text", nullable: true },
      { name: "member_name", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  return_records: {
    label: "退货记录",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "sale_id", type: "text", nullable: true },
      { name: "name", type: "text", nullable: true },
      { name: "size", type: "text", nullable: true },
      { name: "quantity", type: "integer", nullable: true },
      { name: "member_id", type: "text", nullable: true },
      { name: "member_name", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  members: {
    label: "成员管理",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "name", type: "text", nullable: true },
      { name: "phone", type: "text", nullable: true },
      { name: "password", type: "text", nullable: true },
      { name: "role", type: "text", nullable: true },
      { name: "is_online", type: "boolean", nullable: true },
      { name: "last_online", type: "timestamptz", nullable: true },
      { name: "address", type: "text", nullable: true },
      { name: "recipient", type: "text", nullable: true },
      { name: "recipient_phone", type: "text", nullable: true },
      { name: "douyin", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  model_library: {
    label: "模特库",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "name", type: "text", nullable: true },
      { name: "photo_url", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  model_usage: {
    label: "模型用量",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "member_id", type: "text", nullable: true },
      { name: "model_name", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  accounts: {
    label: "账户管理",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "name", type: "text", nullable: true },
      { name: "type", type: "text", nullable: true },
      { name: "amount", type: "numeric", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  live_selections: {
    label: "直播选品",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "sale_id", type: "text", nullable: true },
      { name: "name", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  douyin_links: {
    label: "抖音链接",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "name", type: "text", nullable: true },
      { name: "url", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  pack_records: {
    label: "打包记录",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "member_id", type: "text", nullable: true },
      { name: "member_name", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  pack_items: {
    label: "打包明细",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "pack_id", type: "uuid", nullable: true },
      { name: "sale_id", type: "text", nullable: true },
      { name: "name", type: "text", nullable: true },
      { name: "size", type: "text", nullable: true },
      { name: "quantity", type: "integer", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  monthly_revenue: {
    label: "月度营收",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "month", type: "text", nullable: true },
      { name: "revenue", type: "numeric", nullable: true },
      { name: "cost", type: "numeric", nullable: true },
      { name: "profit", type: "numeric", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  transactions: {
    label: "交易记录",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "type", type: "text", nullable: true },
      { name: "amount", type: "numeric", nullable: true },
      { name: "description", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  category_data: {
    label: "分类数据",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "name", type: "text", nullable: true },
      { name: "value", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  platform_revenue: {
    label: "平台营收",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "platform", type: "text", nullable: true },
      { name: "revenue", type: "numeric", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  settings: {
    label: "系统设置",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "key", type: "text", nullable: true },
      { name: "value", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  links: {
    label: "快捷链接",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "name", type: "text", nullable: true },
      { name: "url", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
};

export async function GET() {
  try {
    const tables = Object.entries(TABLE_SCHEMAS).map(([name, schema]) => ({
      name,
      label: schema.label,
      columns: schema.columns,
    }));

    return NextResponse.json({ tables });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("db-admin/tables 错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}