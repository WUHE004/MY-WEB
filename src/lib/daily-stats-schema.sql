-- 月度清理归档表
-- 在 Supabase SQL Editor 中执行

-- 售卖每日汇总存档表
CREATE TABLE IF NOT EXISTS sales_daily_stats (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  total_amount NUMERIC DEFAULT 0,
  total_quantity INTEGER DEFAULT 0,
  total_profit NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);

-- 退货每日汇总存档表
CREATE TABLE IF NOT EXISTS returns_daily_stats (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date DATE NOT NULL,
  total_returned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);