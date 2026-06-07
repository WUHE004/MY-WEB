-- 直播选品共享表：每个设备/用户的选品记录，所有人都能看到
CREATE TABLE IF NOT EXISTS live_selections (
  id BIGSERIAL PRIMARY KEY,
  member_name TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_name, sale_id)
);

-- 索引：按成员查询
CREATE INDEX IF NOT EXISTS idx_live_selections_member ON live_selections(member_name);

-- 索引：按商品查询
CREATE INDEX IF NOT EXISTS idx_live_selections_sale_id ON live_selections(sale_id);