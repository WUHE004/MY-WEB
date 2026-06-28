-- 支付和订单扩展表
-- 请在 Supabase SQL Editor 中执行此文件

-- 扩展 web_orders 表添加支付和会员字段
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT '';
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS member_id TEXT DEFAULT '';
ALTER TABLE web_orders ADD COLUMN IF NOT EXISTS member_name TEXT DEFAULT '';

-- 收款码配置表
CREATE TABLE IF NOT EXISTS payment_qr_codes (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('wechat', 'alipay')),
  image_url TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认收款码记录（管理员需上传实际图片）
INSERT INTO payment_qr_codes (type, image_url, description) VALUES
  ('wechat', '', '微信收款码'),
  ('alipay', '', '支付宝收款码')
ON CONFLICT DO NOTHING;