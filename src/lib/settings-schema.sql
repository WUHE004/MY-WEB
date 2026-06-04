-- 系统设置表（存储款式分类、货架配置等）
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 插入默认设置
INSERT INTO settings (key, value) VALUES
  ('size_styles', '["T恤","裤子","裙子","外套","卫衣","套装","连体衣","羽绒服","衬衫","内衣","其他"]'::jsonb),
  ('no_size_styles', '["母婴","日用","配饰"]'::jsonb),
  ('shelf_data', '{"A":[1,2,3,4,5,6,7,8,9,10],"B":[1,2],"C":[1,2,3,4,5]}'::jsonb),
  ('manufacturers', '["大炳家","小礼物","海燕家","曾姐姐","程祥家","老刘家","茶七厘家","大咖家","梓东家","米可鑫家","红姐家","一鸣家","小渔家","奇布鲁家","笨笨家","小绵羊家","婴时尚家","啊正家","钱多多家","化磊家","喜宝家","收购家","衣品汇家","程哲家","梨子家","韩瑞家","静静家","衣鞋柜家","晓晓家","晓丽家","甜妈家","番薯家","圆啊圆","可乐家","可可家","凑凑","童优格","艾衣诺","幸运儿","丹丹家","百变童年","大妞童装","阿勇","丫丫家","陈丽家"]'::jsonb)
ON CONFLICT (key) DO NOTHING;