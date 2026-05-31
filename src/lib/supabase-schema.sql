-- Supabase PostgreSQL 数据库表结构
-- 请在 Supabase SQL Editor 中执行此文件

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL DEFAULT '',
  manufacturer TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  total_stock INTEGER NOT NULL DEFAULT 0,
  sold_qty INTEGER NOT NULL DEFAULT 0,
  remaining_stock INTEGER NOT NULL DEFAULT 0,
  shelf_no TEXT NOT NULL DEFAULT '',
  size_80 INTEGER NOT NULL DEFAULT 0,
  size_90 INTEGER NOT NULL DEFAULT 0,
  size_95 INTEGER NOT NULL DEFAULT 0,
  size_100 INTEGER NOT NULL DEFAULT 0,
  size_105 INTEGER NOT NULL DEFAULT 0,
  size_110 INTEGER NOT NULL DEFAULT 0,
  size_120 INTEGER NOT NULL DEFAULT 0,
  size_130 INTEGER NOT NULL DEFAULT 0,
  size_140 INTEGER NOT NULL DEFAULT 0,
  size_150 INTEGER NOT NULL DEFAULT 0,
  size_160 INTEGER NOT NULL DEFAULT 0,
  size_170 INTEGER NOT NULL DEFAULT 0,
  size_180 INTEGER NOT NULL DEFAULT 0,
  stock_warning INTEGER NOT NULL DEFAULT 10,
  cost_price REAL NOT NULL DEFAULT 0,
  sell_price REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  return_qty INTEGER NOT NULL DEFAULT 0,
  return_rate REAL NOT NULL DEFAULT 0,
  inventory_value REAL NOT NULL DEFAULT 0,
  last_order_time TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  handle TEXT NOT NULL DEFAULT '',
  followers INTEGER NOT NULL DEFAULT 0,
  posts INTEGER NOT NULL DEFAULT 0,
  engagement REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  avatar TEXT NOT NULL DEFAULT '',
  growth REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  short_url TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_revenue (
  id SERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS category_data (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  value REAL NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS platform_revenue (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  revenue REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0
);

-- 自动更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_products_updated_at') THEN
    CREATE TRIGGER update_products_updated_at
      BEFORE UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_accounts_updated_at') THEN
    CREATE TRIGGER update_accounts_updated_at
      BEFORE UPDATE ON accounts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_links_updated_at') THEN
    CREATE TRIGGER update_links_updated_at
      BEFORE UPDATE ON links
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 种子数据
INSERT INTO products (id, sale_id, manufacturer, photo, name, total_stock, sold_qty, remaining_stock, shelf_no, size_80, size_90, size_95, size_100, size_105, size_110, size_120, size_130, size_140, size_150, size_160, size_170, size_180, stock_warning, cost_price, sell_price, profit, return_qty, return_rate, inventory_value, last_order_time, status)
VALUES
  ('1', 'S001', '杭州服装厂', '', '纯棉T恤-男款', 200, 120, 80, 'A-01', 10, 15, 20, 15, 10, 5, 3, 2, 0, 0, 0, 0, 0, 10, 35, 89, 54, 5, 4.2, 2800, '2024-06-20', 'active'),
  ('2', 'S002', '广州制衣厂', '', '休闲裤-女款', 150, 80, 70, 'A-02', 8, 12, 15, 15, 10, 5, 3, 2, 0, 0, 0, 0, 0, 10, 48, 128, 80, 3, 3.8, 3360, '2024-06-19', 'active'),
  ('3', 'S003', '深圳纺织', '', '卫衣-连帽款', 100, 60, 40, 'B-03', 5, 8, 10, 8, 5, 3, 1, 0, 0, 0, 0, 0, 0, 5, 65, 168, 103, 2, 3.3, 2600, '2024-06-18', 'warning'),
  ('4', 'S004', '义乌小商品', '', '运动短裤', 300, 200, 100, 'B-05', 15, 20, 25, 20, 10, 5, 3, 2, 0, 0, 0, 0, 0, 20, 22, 59, 37, 8, 4.0, 2200, '2024-06-17', 'active'),
  ('5', 'S005', '上海服装', '', '保暖内衣套装', 80, 70, 10, 'C-01', 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 10, 55, 138, 83, 1, 1.4, 550, '2024-06-15', 'low')
ON CONFLICT (id) DO NOTHING;

INSERT INTO accounts (id, name, platform, handle, followers, posts, engagement, status, avatar, growth)
VALUES
  ('1', '数码好物推荐', '小红书', '@digital_best', 45200, 156, 8.5, 'active', 'bg-[#FF6B7A]', 12.3),
  ('2', '科技测评室', '抖音', '@tech_review', 128000, 89, 6.2, 'active', 'bg-[#171717]', 25.6),
  ('3', '好物分享君', '淘宝直播', '@haowu_share', 23000, 234, 4.8, 'warning', 'bg-[#FFC93C]', -2.1),
  ('4', '极客数码', 'B站', '@geek_digital', 67000, 67, 10.2, 'active', 'bg-[#4A90E2]', 18.9),
  ('5', '每日好货', '微博', '@daily_goods', 15600, 456, 3.5, 'active', 'bg-[#7B61FF]', 5.4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO links (id, name, url, short_url, platform, clicks, conversions, status)
VALUES
  ('1', '夏季促销-蓝牙耳机', 'https://item.taobao.com/item.htm?id=123456', 'https://kucun.gg/a1b2c3', '淘宝', 3420, 156, 'active'),
  ('2', '新品首发-智能手表', 'https://item.jd.com/123456.html', 'https://kucun.gg/d4e5f6', '京东', 2156, 89, 'active'),
  ('3', '限时秒杀-充电宝', 'https://mobile.yangkeduo.com/goods.html?goods_id=123', 'https://kucun.gg/g7h8i9', '拼多多', 5678, 234, 'active'),
  ('4', '直播专享-键盘', 'https://www.douyin.com/', 'https://kucun.gg/j0k1l2', '抖音', 1890, 67, 'paused'),
  ('5', '种草笔记-手机支架', 'https://www.xiaohongshu.com/', 'https://kucun.gg/m3n4o5', '小红书', 1234, 45, 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO monthly_revenue (month, revenue, cost) VALUES
  ('1月', 32000, 24000),
  ('2月', 35000, 26000),
  ('3月', 38000, 27000),
  ('4月', 42000, 30000),
  ('5月', 40000, 28000),
  ('6月', 48320, 32000);

INSERT INTO transactions (id, type, amount, description, date, platform) VALUES
  ('TRX-001', 'income', 2990, '蓝牙耳机 Pro x10', '2024-06-15', '淘宝'),
  ('TRX-002', 'expense', 1500, '采购成本-充电宝', '2024-06-14', '拼多多'),
  ('TRX-003', 'income', 5997, '智能手表 x3', '2024-06-14', '京东'),
  ('TRX-004', 'expense', 800, '物流费用', '2024-06-13', '-'),
  ('TRX-005', 'income', 1290, '充电宝 x10', '2024-06-13', '拼多多'),
  ('TRX-006', 'expense', 2000, '广告投放-抖音', '2024-06-12', '抖音'),
  ('TRX-007', 'income', 918, '手机支架 x23', '2024-06-12', '小红书'),
  ('TRX-008', 'expense', 500, '包装材料', '2024-06-11', '-');

INSERT INTO category_data (name, value, color) VALUES
  ('数码电子', 45, '#FF6B7A'),
  ('电脑配件', 25, '#4A90E2'),
  ('手机配件', 20, '#FFC93C'),
  ('其他', 10, '#7B61FF');

INSERT INTO platform_revenue (name, revenue, cost) VALUES
  ('淘宝', 18000, 12000),
  ('京东', 12000, 8000),
  ('拼多多', 8000, 5000),
  ('抖音', 6000, 4000),
  ('小红书', 4320, 3000);