-- ============================================================
-- 为 return_records 表添加 return_time 字段
-- 在 Supabase SQL Editor 中执行
-- ============================================================

ALTER TABLE return_records ADD COLUMN IF NOT EXISTS return_time TIMESTAMPTZ;

-- 为已有记录设置默认值（使用 created_at 作为默认 return_time）
UPDATE return_records SET return_time = created_at WHERE return_time IS NULL;