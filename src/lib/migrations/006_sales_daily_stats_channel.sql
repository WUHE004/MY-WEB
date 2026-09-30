-- 006: sales_daily_stats 增加渠道维度（抖音 douyin / 多多 duoduo）
-- 背景: 抖音和多多的快递费/平台抽点规则不同, 且利润需要扣除退货损失,
--       原表按 date 唯一, 无法分渠道记账。改为 (date, channel) 唯一。
-- 执行后需要在系统里触发一次"数据同步/回填"重建全部统计行(该表是纯派生数据, 重建安全)。

-- 1. 加渠道列(默认抖音)
ALTER TABLE public.sales_daily_stats
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'douyin';

-- 2. 换唯一键: date → (date, channel)
ALTER TABLE public.sales_daily_stats
  DROP CONSTRAINT IF EXISTS sales_daily_stats_date_key;
ALTER TABLE public.sales_daily_stats
  DROP CONSTRAINT IF EXISTS sales_daily_stats_date_channel_key;
ALTER TABLE public.sales_daily_stats
  ADD CONSTRAINT sales_daily_stats_date_channel_key UNIQUE (date, channel);

-- 3. 清空旧数据(混合渠道口径, 已不可用; 执行系统回填后按新口径重建)
DELETE FROM public.sales_daily_stats;

-- 4. 多多费率默认值(0.6% 抽点 + 每件 2 元快递), 已存在则不覆盖
INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('duoduo_fee_rate', 0.6, NOW()),
  ('duoduo_ship_per_item', 2, NOW())
ON CONFLICT (key) DO NOTHING;
