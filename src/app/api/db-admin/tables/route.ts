import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 英文字段名 → 中文翻译
const COLUMN_LABELS: Record<string, string> = {
  id: "ID", sale_id: "货号", name: "名称", manufacturer: "厂家",
  cost_price: "成本价", sell_price: "售价", total_stock: "总库存", photo: "照片", photo_url: "照片",
  shelf_no: "货架号",
  size_80: "80码", size_90: "90码", size_95: "95码", size_100: "100码", size_105: "105码",
  size_110: "110码", size_120: "120码", size_130: "130码", size_140: "140码",
  size_150: "150码", size_160: "160码", size_170: "170码", size_180: "180码",
  size: "尺码", quantity: "数量",
  member_id: "会员ID", member_name: "会员名",
  password: "密码", role: "角色", is_online: "在线状态", last_online: "最后在线",
  address: "地址", recipient: "收件人", recipient_phone: "收件人电话",
  douyin: "抖音", phone: "手机号", model_name: "模型名", type: "类型", amount: "金额",
  platform: "平台", revenue: "营收", cost: "成本", profit: "利润",
  month: "月份", url: "链接", pack_id: "打包ID", key: "键", value: "值", description: "描述",
  updated_at: "更新时间", created_at: "创建时间", inbound_date: "入库日期",
  product_name: "商品名", total_profit: "总利润", tracking_number: "面单号",
  order_time: "下单时间", registration_date: "登记日期", notes: "备注",
  registrant: "登记人", status: "状态", date: "日期", customer: "顾客", total_price: "总价",
  total_sold: "总售出", total_revenue: "总营收", sell_price_info: "售价信息", sales_count: "销售次数",
  total_returned: "总退货", total_return_amount: "退货总额", return_price_info: "退货价信息", return_count: "退货次数",
  season: "季节", style_category: "风格分类", shipping_fee: "运费", platform_fee: "平台费",
  payment_status: "付款状态", shipping_status: "物流状态",
  payment_screenshot: "付款截图", payment_screenshot_url: "付款截图",
};

const PHOTO_FIELDS = ["photo", "photo_url", "url", "image_url", "payment_screenshot", "payment_screenshot_url", "image", "thumbnail", "preview", "avatar"];

// 表名 → 中文标签（兜底）
const TABLE_LABEL_MAP: Record<string, string> = {
  inbound_records: "入库记录", sales_records: "销售记录", return_records: "退货记录",
  members: "成员管理", model_library: "模特库", model_usage: "模型用量",
  live_selections: "直播选品", douyin_links: "抖音链接",
  pack_records: "打包记录", pack_items: "打包明细",
  settings: "系统设置", web_orders: "网页下单",
  sales_summary: "销售汇总", returns_summary: "退货汇总",
  product_display: "商品展示", payment_qr_codes: "付款码",
  shipping_tracks: "运费模板", sms_codes: "短信验证码",
  accounts: "账户管理", monthly_revenue: "月度营收", transactions: "交易记录",
  category_data: "分类数据", platform_revenue: "平台营收", links: "快捷链接",
  "product-photos": "产品照片", products: "商品（旧）",
};

// 兜底硬编码表定义（当数据库查询失败时使用）
const FALLBACK_TABLE_SCHEMAS: Record<string, string[]> = {
  inbound_records: ["id", "sale_id", "name", "manufacturer", "cost_price", "sell_price", "total_stock", "photo", "shelf_no", "size_80", "size_90", "size_95", "size_100", "size_105", "size_110", "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180", "inbound_date", "created_at", "updated_at"],
  sales_records: ["id", "sale_id", "product_name", "size", "quantity", "sell_price", "cost_price", "profit", "total_profit", "photo", "manufacturer", "shelf_no", "tracking_number", "order_time", "registration_date", "notes", "registrant", "member_id", "member_name", "created_at"],
  return_records: ["id", "sale_id", "name", "size", "quantity", "member_id", "member_name", "created_at"],
  members: ["id", "name", "phone", "password", "role", "is_online", "last_online", "address", "recipient", "recipient_phone", "douyin", "created_at"],
  sales_summary: ["id", "sale_id", "name", "photo", "manufacturer", "shelf_no", "cost_price", "sell_price", "sell_price_info", "total_sold", "total_revenue", "sales_count", "size_80", "size_90", "size_95", "size_100", "size_105", "size_110", "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180", "created_at", "updated_at"],
  returns_summary: ["id", "sale_id", "name", "photo", "manufacturer", "shelf_no", "cost_price", "return_price_info", "total_returned", "total_return_amount", "return_count", "size_80", "size_90", "size_95", "size_100", "size_105", "size_110", "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180", "created_at", "updated_at"],
  web_orders: ["id", "customer", "address", "recipient", "recipient_phone", "sale_id", "size", "quantity", "sell_price", "total_price", "created_at", "payment_screenshot", "payment_screenshot_url", "payment_status", "shipping_status", "tracking_number", "shipping_fee", "platform_fee", "notes"],
  live_selections: ["id", "sale_id", "name", "created_at"],
  douyin_links: ["id", "name", "url", "created_at"],
  pack_records: ["id", "member_id", "member_name", "created_at"],
  pack_items: ["id", "pack_id", "sale_id", "name", "size", "quantity", "created_at"],
  model_library: ["id", "name", "photo_url", "created_at"],
  model_usage: ["id", "member_id", "model_name", "created_at"],
  settings: ["id", "key", "value", "created_at"],
  product_display: ["id", "sale_id", "sell_price", "is_hidden", "is_featured", "created_at", "updated_at"],
  payment_qr_codes: ["id", "name", "url", "created_at"],
  shipping_tracks: ["id", "name", "rate", "created_at"],
  sms_codes: ["id", "phone", "code", "expires_at", "created_at"],
};

export async function GET() {
  try {
    // 直接使用硬编码表列表（稳定可靠）
    // 未来如需自动发现新表，可在 Supabase 创建 get_db_tables() 函数后启用 RPC
    const tables = Object.entries(FALLBACK_TABLE_SCHEMAS).map(([name, colNames]) => ({
      name,
      label: TABLE_LABEL_MAP[name] || name,
      columns: colNames.map((col) => ({
        name: col,
        type: "text",
        nullable: col !== "id",
        label: COLUMN_LABELS[col] || col,
        isPhoto: PHOTO_FIELDS.includes(col),
      })),
    }));

    return NextResponse.json({ tables, columnLabels: COLUMN_LABELS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}