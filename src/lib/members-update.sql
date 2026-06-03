-- 成员表更新：添加在线状态和上次在线时间字段
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_online TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;