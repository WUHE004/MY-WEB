-- 网页下单表
CREATE TABLE IF NOT EXISTS web_orders (
  id SERIAL PRIMARY KEY,
  customer TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL DEFAULT '',
  recipient_phone TEXT NOT NULL DEFAULT '',
  sale_id TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  sell_price REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_orders_sale_id ON web_orders(sale_id);
CREATE INDEX IF NOT EXISTS idx_web_orders_created_at ON web_orders(created_at DESC);

-- 抖音直播链接表
CREATE TABLE IF NOT EXISTS douyin_links (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  live_url TEXT NOT NULL DEFAULT '',
  qr_code TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);