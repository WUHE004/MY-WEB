-- 完整数据库修复脚本
-- 请在 Supabase SQL Editor 中执行此文件

-- 1. 先删除旧的 members 表（确保用 phone 重建）
DROP TABLE IF EXISTS members CASCADE;

-- 2. 创建 products 表
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  total_stock INTEGER NOT NULL DEFAULT 0,
  sold_qty INTEGER NOT NULL DEFAULT 0,
  remaining_stock INTEGER NOT NULL DEFAULT 0,
  shelf_no TEXT NOT NULL DEFAULT '',
  size_80 INTEGER NOT NULL DEFAULT 0,
  size_90 INTEGER NOT NULL DEFAULT 0,
  size_95 INTEGER NOT NULL DEFAULT 0,
  size_100 INTEGER NOT NULL DEFAULT 0,
  size_105 INTEGER NOT NULL DEFAULT 0,
  size_110 INTEGER NOT NULL DEFAULT 0,
  size_120 INTEGER NOT NULL DEFAULT 0,
  size_130 INTEGER NOT NULL DEFAULT 0,
  size_140 INTEGER NOT NULL DEFAULT 0,
  size_150 INTEGER NOT NULL DEFAULT 0,
  size_160 INTEGER NOT NULL DEFAULT 0,
  size_170 INTEGER NOT NULL DEFAULT 0,
  size_180 INTEGER NOT NULL DEFAULT 0,
  stock_warning INTEGER NOT NULL DEFAULT 10,
  cost_price REAL NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  return_qty INTEGER NOT NULL DEFAULT 0,
  return_rate REAL NOT NULL DEFAULT 0,
  inventory_value REAL NOT NULL DEFAULT 0,
  last_order_time TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT '',
  season TEXT NOT NULL DEFAULT '',
  style_category TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 创建 members 表（用 phone 登录）
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'customer', 'operator')),
  address TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL DEFAULT '',
  recipient_phone TEXT NOT NULL DEFAULT '',
  douyin TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 创建自动更新触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_products_updated_at') THEN
    CREATE TRIGGER update_products_updated_at
      BEFORE UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_members_updated_at') THEN
    CREATE TRIGGER update_members_updated_at
      BEFORE UPDATE ON members
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 5. 插入默认管理员
INSERT INTO members (name, phone, password, role)
VALUES ('管理员', '13800000000', 'admin123', 'admin')
ON CONFLICT (phone) DO NOTHING;

-- 6. 创建入库记录表
CREATE TABLE IF NOT EXISTS inbound_records (
  id SERIAL PRIMARY KEY,
  inbound_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sale_id TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  total_stock INTEGER NOT NULL DEFAULT 0,
  shelf_no TEXT NOT NULL DEFAULT '',
  size_80 INTEGER NOT NULL DEFAULT 0,
  size_90 INTEGER NOT NULL DEFAULT 0,
  size_95 INTEGER NOT NULL DEFAULT 0,
  size_100 INTEGER NOT NULL DEFAULT 0,
  size_105 INTEGER NOT NULL DEFAULT 0,
  size_110 INTEGER NOT NULL DEFAULT 0,
  size_120 INTEGER NOT NULL DEFAULT 0,
  size_130 INTEGER NOT NULL DEFAULT 0,
  size_140 INTEGER NOT NULL DEFAULT 0,
  size_150 INTEGER NOT NULL DEFAULT 0,
  size_160 INTEGER NOT NULL DEFAULT 0,
  size_170 INTEGER NOT NULL DEFAULT 0,
  size_180 INTEGER NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  season TEXT NOT NULL DEFAULT '',
  style_category TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_records_manufacturer ON inbound_records(manufacturer);

-- 8. 创建网页下单表
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

-- 9. 创建抖音直播链接表
CREATE TABLE IF NOT EXISTS douyin_links (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  live_url TEXT NOT NULL DEFAULT '',
  qr_code TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 验证结果
SELECT 'products' AS table_name, COUNT(*) AS row_count FROM products
UNION ALL
SELECT 'members', COUNT(*) FROM members
UNION ALL
SELECT 'inbound_records', COUNT(*) FROM inbound_records
UNION ALL
SELECT 'web_orders', COUNT(*) FROM web_orders
UNION ALL
SELECT 'douyin_links', COUNT(*) FROM douyin_links;