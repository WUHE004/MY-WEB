-- 商品展示表：存储管理员设置的展示售价
CREATE TABLE IF NOT EXISTS product_display (
  sale_id TEXT PRIMARY KEY,
  sell_price NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE product_display ENABLE ROW LEVEL SECURITY;

-- 允许公开读取
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = '允许公开读取商品展示'
    AND tablename = 'product_display'
  ) THEN
    CREATE POLICY "允许公开读取商品展示" ON product_display FOR SELECT USING (true);
  END IF;
END $$;

-- 允许认证用户管理
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = '允许认证用户管理商品展示'
    AND tablename = 'product_display'
  ) THEN
    CREATE POLICY "允许认证用户管理商品展示" ON product_display FOR ALL USING (true);
  END IF;
END $$;