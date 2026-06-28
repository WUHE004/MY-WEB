-- 物流相关表
-- 请在 Supabase SQL Editor 中执行此文件

-- 扩展 web_orders 表添加物流字段
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT DEFAULT '';
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'pending';
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS shipping_company TEXT DEFAULT '';

-- 物流追踪记录表（存储物流轨迹）
CREATE TABLE IF NOT EXISTS shipping_tracks (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES web_orders(id),
  tracking_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '',
  location TEXT DEFAULT '',
  time TEXT DEFAULT '',
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipping_tracks_order ON shipping_tracks(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_tracks_tracking ON shipping_tracks(tracking_number);