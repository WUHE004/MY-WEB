-- 清除旧表并创建新表
-- 请在 Supabase SQL Editor 中执行此文件

-- 删除旧表
DROP TABLE IF EXISTS platform_revenue CASCADE;
DROP TABLE IF EXISTS category_data CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS monthly_revenue CASCADE;
DROP TABLE IF EXISTS links CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- 创建成员表
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
  is_online BOOLEAN DEFAULT false,
  last_online TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 自动更新触发器
CREATE OR REPLACE FUNCTION update_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_members_updated_at') THEN
    CREATE TRIGGER update_members_updated_at
      BEFORE UPDATE ON members
      FOR EACH ROW EXECUTE FUNCTION update_members_updated_at();
  END IF;
END $$;

-- 插入默认管理员
INSERT INTO members (name, phone, password, role)
VALUES ('管理员', '13800000000', 'admin123', 'admin')
ON CONFLICT (phone) DO NOTHING;