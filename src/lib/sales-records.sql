-- 售出明细表
CREATE TABLE IF NOT EXISTS sales_records (
  id SERIAL PRIMARY KEY,
  registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sale_id TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  total_profit REAL NOT NULL DEFAULT 0,
  manufacturer TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  order_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tracking_number TEXT NOT NULL DEFAULT '',
  registrant TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_records_sale_id ON sales_records(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_date ON sales_records(registration_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_records_registrant ON sales_records(registrant);