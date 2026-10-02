-- 008: 瑕疵出库功能 + 删除赛道资讯
-- 在 Supabase SQL Editor 中手动执行一次

-- 1. 瑕疵出库记录表(瑕疵商品退回厂家, 扣减入库登记库存)
CREATE TABLE IF NOT EXISTS defect_out_records (
  id SERIAL PRIMARY KEY,
  sale_id TEXT NOT NULL,              -- 售卖编号(须已入库)
  size INTEGER NOT NULL,              -- 尺码
  quantity INTEGER NOT NULL,          -- 出库件数
  cost_price REAL DEFAULT 0,          -- 入库进价(厂家退货结算价)
  defect_type TEXT DEFAULT '',        -- 瑕疵细节(如 一级瑕疵：破损)
  notes TEXT DEFAULT '',              -- 备注
  registrant TEXT DEFAULT '',         -- 登记人
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defect_out_records_sale_id ON defect_out_records(sale_id);
CREATE INDEX IF NOT EXISTS idx_defect_out_records_created_at ON defect_out_records(created_at DESC);

-- 2. 删除赛道资讯表(功能已下线)
DROP TABLE IF EXISTS live_track_news;
