-- 打包找货记录表
CREATE TABLE IF NOT EXISTS pack_records (
  id SERIAL PRIMARY KEY,
  tracking_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', -- pending(找货中), found(已找齐), suspended(挂起), shipped(已发货)
  submitter TEXT NOT NULL DEFAULT '', -- 提交人
  packer TEXT NOT NULL DEFAULT '', -- 打包人
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 打包找货关联的商品明细表
CREATE TABLE IF NOT EXISTS pack_items (
  id SERIAL PRIMARY KEY,
  pack_id INTEGER NOT NULL REFERENCES pack_records(id) ON DELETE CASCADE,
  sale_id TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  shelf_no TEXT NOT NULL DEFAULT '',
  order_time TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);