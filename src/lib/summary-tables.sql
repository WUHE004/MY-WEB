-- 售卖汇总表
CREATE TABLE IF NOT EXISTS sales_summary (
  sale_id TEXT PRIMARY KEY,
  photo TEXT DEFAULT '',
  name TEXT DEFAULT '',
  shelf_no TEXT DEFAULT '',
  manufacturer TEXT DEFAULT '',
  cost_price NUMERIC DEFAULT 0,
  sell_price NUMERIC DEFAULT 0,
  size_80 INTEGER DEFAULT 0, size_90 INTEGER DEFAULT 0, size_95 INTEGER DEFAULT 0,
  size_100 INTEGER DEFAULT 0, size_105 INTEGER DEFAULT 0, size_110 INTEGER DEFAULT 0,
  size_120 INTEGER DEFAULT 0, size_130 INTEGER DEFAULT 0, size_140 INTEGER DEFAULT 0,
  size_150 INTEGER DEFAULT 0, size_160 INTEGER DEFAULT 0, size_170 INTEGER DEFAULT 0, size_180 INTEGER DEFAULT 0,
  total_sold INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  sell_price_info JSONB DEFAULT '{}'::jsonb,
  sales_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 退货汇总表
CREATE TABLE IF NOT EXISTS returns_summary (
  sale_id TEXT PRIMARY KEY,
  photo TEXT DEFAULT '',
  name TEXT DEFAULT '',
  shelf_no TEXT DEFAULT '',
  manufacturer TEXT DEFAULT '',
  cost_price NUMERIC DEFAULT 0,
  size_80 INTEGER DEFAULT 0, size_90 INTEGER DEFAULT 0, size_95 INTEGER DEFAULT 0,
  size_100 INTEGER DEFAULT 0, size_105 INTEGER DEFAULT 0, size_110 INTEGER DEFAULT 0,
  size_120 INTEGER DEFAULT 0, size_130 INTEGER DEFAULT 0, size_140 INTEGER DEFAULT 0,
  size_150 INTEGER DEFAULT 0, size_160 INTEGER DEFAULT 0, size_170 INTEGER DEFAULT 0, size_180 INTEGER DEFAULT 0,
  total_returned INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE sales_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns_summary ENABLE ROW LEVEL SECURITY;

-- 允许公开读取
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '允许公开读取售卖汇总' AND tablename = 'sales_summary') THEN
    CREATE POLICY "允许公开读取售卖汇总" ON sales_summary FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '允许公开读取退货汇总' AND tablename = 'returns_summary') THEN
    CREATE POLICY "允许公开读取退货汇总" ON returns_summary FOR SELECT USING (true);
  END IF;
END $$;

-- 允许认证用户写入
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '允许认证用户管理售卖汇总' AND tablename = 'sales_summary') THEN
    CREATE POLICY "允许认证用户管理售卖汇总" ON sales_summary FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '允许认证用户管理退货汇总' AND tablename = 'returns_summary') THEN
    CREATE POLICY "允许认证用户管理退货汇总" ON returns_summary FOR ALL USING (true);
  END IF;
END $$;