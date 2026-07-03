-- P1-4 性能索引补全
-- 在 Supabase SQL Editor 中执行（Dashboard → SQL Editor → 粘贴运行）
-- 创建日期：2026-07-03

-- 退货按退货日期汇总（sync-summary 用 return_time 分组日统计）
CREATE INDEX IF NOT EXISTS idx_return_records_return_time
  ON return_records(return_time DESC);

-- 售出按订单日期汇总（sync-summary 用 order_time 分组日统计）
CREATE INDEX IF NOT EXISTS idx_sales_records_order_time
  ON sales_records(order_time DESC);

-- web-orders 库存校验：按 sale_id + size 查询已售数量
CREATE INDEX IF NOT EXISTS idx_sales_records_sale_id_size
  ON sales_records(sale_id, size);

-- web-orders 库存校验：按 sale_id + size 查询退货数量
CREATE INDEX IF NOT EXISTS idx_return_records_sale_id_size
  ON return_records(sale_id, size);

-- web_orders 按会员查询订单列表（my-orders 页面）
CREATE INDEX IF NOT EXISTS idx_web_orders_member_id
  ON web_orders(member_id, created_at DESC);
