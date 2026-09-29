-- 直播选品共享表：每个设备/用户的选品记录，所有人都能看到
-- 注意: 不设 (member_name, sale_id) 唯一约束 —— 选品按天独立记录,
-- 同编号每天可选(跨天可重复), 同天防重由 API 层查重保证(见 005 迁移背景)
CREATE TABLE IF NOT EXISTS live_selections (
  id BIGSERIAL PRIMARY KEY,
  member_name TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引：按成员查询
CREATE INDEX IF NOT EXISTS idx_live_selections_member ON live_selections(member_name);

-- 索引：按商品查询
CREATE INDEX IF NOT EXISTS idx_live_selections_sale_id ON live_selections(sale_id);