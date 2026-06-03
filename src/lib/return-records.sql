-- 退货登记表
CREATE TABLE IF NOT EXISTS return_records (
  id SERIAL PRIMARY KEY,
  sale_id TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  return_price REAL NOT NULL DEFAULT 0,
  remarks TEXT NOT NULL DEFAULT '',
  registrant TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_records_sale_id ON return_records(sale_id);
CREATE INDEX IF NOT EXISTS idx_return_records_date ON return_records(created_at DESC);