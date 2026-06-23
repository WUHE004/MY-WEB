import { NextResponse } from "next/server";

// 英文字段名 → 中文翻译
const COLUMN_LABELS: Record<string, string> = {
  id: "ID",
  sale_id: "货号",
  name: "名称",
  manufacturer: "厂家",
  cost_price: "成本价",
  sell_price: "售价",
  total_stock: "总库存",
  photo: "照片",
  photo_url: "照片",
  shelf_no: "货架号",
  size_80: "80码", size_90: "90码", size_95: "95码", size_100: "100码", size_105: "105码",
  size_110: "110码", size_120: "120码", size_130: "130码", size_140: "140码",
  size_150: "150码", size_160: "160码", size_170: "170码", size_180: "180码",
  size: "尺码", quantity: "数量",
  member_id: "会员ID", member_name: "会员名",
  password: "密码", role: "角色",
  is_online: "在线状态", last_online: "最后在线",
  address: "地址", recipient: "收件人", recipient_phone: "收件人电话",
  douyin: "抖音", phone: "手机号",
  model_name: "模型名", type: "类型", amount: "金额",
  platform: "平台", revenue: "营收", cost: "成本", profit: "利润",
  month: "月份", url: "链接",
  pack_id: "打包ID", key: "键", value: "值", description: "描述",
  updated_at: "更新时间", created_at: "创建时间",
  inbound_date: "入库日期",
  product_name: "商品名",
  total_profit: "总利润",
  tracking_number: "面单号",
  order_time: "下单时间",
  registration_date: "登记日期",
  notes: "备注",
  registrant: "登记人",
  status: "状态",
  date: "日期",
  customer: "顾客",
  total_price: "总价",
};

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
      { name: "size_80", type: "integer", nullable: true }, { name: "size_90", type: "integer", nullable: true },
      { name: "size_95", type: "integer", nullable: true }, { name: "size_100", type: "integer", nullable: true },
      { name: "size_105", type: "integer", nullable: true }, { name: "size_110", type: "integer", nullable: true },
      { name: "size_120", type: "integer", nullable: true }, { name: "size_130", type: "integer", nullable: true },
      { name: "size_140", type: "integer", nullable: true }, { name: "size_150", type: "integer", nullable: true },
      { name: "size_160", type: "integer", nullable: true }, { name: "size_170", type: "integer", nullable: true },
      { name: "size_180", type: "integer", nullable: true },
      { name: "inbound_date", type: "timestamptz", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
      { name: "updated_at", type: "timestamptz", nullable: true },
    ],
  },
  sales_records: {
    label: "销售记录",
    columns: [
      { name: "id", type: "uuid", nullable: false },
      { name: "sale_id", type: "text", nullable: true },
      { name: "product_name", type: "text", nullable: true },
      { name: "size", type: "text", nullable: true },
      { name: "quantity", type: "integer", nullable: true },
      { name: "sell_price", type: "numeric", nullable: true },
      { name: "cost_price", type: "numeric", nullable: true },
      { name: "profit", type: "numeric", nullable: true },
      { name: "total_profit", type: "numeric", nullable: true },
      { name: "photo", type: "text", nullable: true },
      { name: "manufacturer", type: "text", nullable: true },
      { name: "shelf_no", type: "text", nullable: true },
      { name: "tracking_number", type: "text", nullable: true },
      { name: "order_time", type: "timestamptz", nullable: true },
      { name: "registration_date", type: "timestamptz", nullable: true },
      { name: "notes", type: "text", nullable: true },
      { name: "registrant", type: "text", nullable: true },
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
      { name: "name", type: "text", nullable: true }, { name: "phone", type: "text", nullable: true },
      { name: "password", type: "text", nullable: true }, { name: "role", type: "text", nullable: true },
      { name: "is_online", type: "boolean", nullable: true }, { name: "last_online", type: "timestamptz", nullable: true },
      { name: "address", type: "text", nullable: true }, { name: "recipient", type: "text", nullable: true },
      { name: "recipient_phone", type: "text", nullable: true }, { name: "douyin", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  model_library: {
    label: "模特库",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "name", type: "text", nullable: true },
      { name: "photo_url", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  model_usage: {
    label: "模型用量",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "member_id", type: "text", nullable: true },
      { name: "model_name", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  accounts: {
    label: "账户管理",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "name", type: "text", nullable: true },
      { name: "type", type: "text", nullable: true }, { name: "amount", type: "numeric", nullable: true },
      { name: "status", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  live_selections: {
    label: "直播选品",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "sale_id", type: "text", nullable: true },
      { name: "name", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  douyin_links: {
    label: "抖音链接",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "name", type: "text", nullable: true },
      { name: "url", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  pack_records: {
    label: "打包记录",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "member_id", type: "text", nullable: true },
      { name: "member_name", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  pack_items: {
    label: "打包明细",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "pack_id", type: "uuid", nullable: true },
      { name: "sale_id", type: "text", nullable: true }, { name: "name", type: "text", nullable: true },
      { name: "size", type: "text", nullable: true }, { name: "quantity", type: "integer", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  monthly_revenue: {
    label: "月度营收",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "month", type: "text", nullable: true },
      { name: "revenue", type: "numeric", nullable: true }, { name: "cost", type: "numeric", nullable: true },
      { name: "profit", type: "numeric", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  transactions: {
    label: "交易记录",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "type", type: "text", nullable: true },
      { name: "amount", type: "numeric", nullable: true }, { name: "description", type: "text", nullable: true },
      { name: "date", type: "timestamptz", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  category_data: {
    label: "分类数据",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "name", type: "text", nullable: true },
      { name: "value", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  platform_revenue: {
    label: "平台营收",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "platform", type: "text", nullable: true },
      { name: "revenue", type: "numeric", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  settings: {
    label: "系统设置",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "key", type: "text", nullable: true },
      { name: "value", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  links: {
    label: "快捷链接",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "name", type: "text", nullable: true },
      { name: "url", type: "text", nullable: true }, { name: "status", type: "text", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  web_orders: {
    label: "网页下单",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "customer", type: "text", nullable: true },
      { name: "address", type: "text", nullable: true }, { name: "recipient", type: "text", nullable: true },
      { name: "recipient_phone", type: "text", nullable: true }, { name: "sale_id", type: "text", nullable: true },
      { name: "size", type: "integer", nullable: true }, { name: "quantity", type: "integer", nullable: true },
      { name: "sell_price", type: "numeric", nullable: true }, { name: "total_price", type: "numeric", nullable: true },
      { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  "product-photos": {
    label: "产品照片",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "sale_id", type: "text", nullable: true },
      { name: "photo_url", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
  sales_summary: {
    label: "销售汇总",
    columns: [
      { name: "id", type: "uuid", nullable: false }, { name: "sale_id", type: "text", nullable: true },
      { name: "name", type: "text", nullable: true }, { name: "created_at", type: "timestamptz", nullable: true },
    ],
  },
};

const PHOTO_FIELDS = ["photo", "photo_url", "url", "image_url"];

export async function GET() {
  try {
    const tables = Object.entries(TABLE_SCHEMAS).map(([name, schema]) => ({
      name,
      label: schema.label,
      columns: schema.columns.map((col) => ({
        ...col,
        label: COLUMN_LABELS[col.name] || col.name,
        isPhoto: PHOTO_FIELDS.includes(col.name),
      })),
    }));

    return NextResponse.json({ tables, columnLabels: COLUMN_LABELS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("db-admin/tables 错误:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}