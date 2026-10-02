// 数据库表清单(db-admin 各 API 共用)
// 2026-09 与数据库真实 schema 对齐, 通过 get_db_tables RPC 核验
export const SIZE_COLS = ["size_80", "size_90", "size_95", "size_100", "size_105", "size_110", "size_120", "size_130", "size_140", "size_150", "size_160", "size_170", "size_180"];

export const TABLE_COLUMNS: Record<string, string[]> = {
  inbound_records: ["id", "inbound_date", "sale_id", "manufacturer", "photo", "name", "total_stock", "shelf_no", ...SIZE_COLS, "cost_price", "season", "style_category", "notes", "created_at"],
  sales_records: ["id", "registration_date", "sale_id", "photo", "product_name", "size", "quantity", "sell_price", "cost_price", "profit", "total_profit", "manufacturer", "notes", "order_time", "tracking_number", "registrant", "created_at", "shelf_no"],
  return_records: ["id", "sale_id", "size", "quantity", "return_price", "remarks", "registrant", "created_at", "return_time"],
  members: ["id", "name", "phone", "password", "role", "address", "recipient", "recipient_phone", "douyin", "created_at", "updated_at", "is_online", "last_online", "phone_verified"],
  model_library: ["id", "name", "photo_url", "created_at", "updated_at", "sort_order"],
  model_usage: ["id", "member_id", "model_name", "created_at"],
  live_selections: ["id", "member_name", "sale_id", "created_at"],
  live_shoot_scripts: ["id", "user_idea", "script_content", "created_at"],
  defect_out_records: ["id", "sale_id", "size", "quantity", "cost_price", "defect_type", "notes", "registrant", "created_at"],
  douyin_links: ["id", "name", "live_url", "qr_code", "created_at"],
  pack_records: ["id", "tracking_number", "status", "submitter", "packer", "created_at", "updated_at"],
  pack_items: ["id", "pack_id", "sale_id", "photo", "product_name", "size", "quantity", "sell_price", "shelf_no", "order_time", "manufacturer", "created_at"],
  payment_qr_codes: ["id", "type", "image_url", "description", "is_active", "created_at", "updated_at"],
  product_display: ["sale_id", "sell_price", "created_at"],
  returns_daily_stats: ["id", "date", "total_returned", "created_at"],
  returns_summary: ["sale_id", "photo", "name", "shelf_no", "manufacturer", ...SIZE_COLS, "total_returned", "return_price_info", "return_count", "updated_at", "created_at"],
  sales_daily_stats: ["id", "date", "total_amount", "total_quantity", "total_profit", "created_at", "shipping_fee", "platform_fee"],
  sales_summary: ["sale_id", "photo", "name", "shelf_no", "manufacturer", ...SIZE_COLS, "total_sold", "sell_price_info", "sales_count", "updated_at", "created_at"],
  settings: ["key", "value", "updated_at"],
  shipping_tracks: ["id", "order_id", "tracking_number", "status", "location", "time", "message", "created_at"],
  sms_codes: ["id", "phone", "code", "type", "expires_at", "used", "created_at"],
  web_orders: ["id", "customer", "address", "recipient", "recipient_phone", "sale_id", "size", "quantity", "sell_price", "total_price", "created_at", "payment_status", "payment_method", "member_id", "member_name", "tracking_number", "shipping_status", "shipping_company"],
};
