-- 成员表更新：添加手机号和收货信息字段
-- 注意：此 SQL 假设 members 表已经存在，但可能结构不同

-- 添加手机号相关字段
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

-- 添加收货信息字段
ALTER TABLE members ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS recipient TEXT DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS recipient_phone TEXT DEFAULT '';

-- 添加抖音号字段
ALTER TABLE members ADD COLUMN IF NOT EXISTS douyin TEXT DEFAULT '';

-- 添加在线状态字段
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_online TIMESTAMPTZ;

-- 创建唯一索引（手机号唯一，允许空值）
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_phone_unique ON members(phone) WHERE phone IS NOT NULL;
