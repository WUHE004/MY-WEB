-- 009: return_records 新增 售卖方式 / 退货原因 字段
-- 在 Supabase SQL Editor 中执行（Dashboard → SQL Editor → 粘贴运行）
-- 背景: 退货登记增加"售卖方式"(抖音售卖/多多售卖)与"退货原因"
--       (品退（瑕疵/破损）/七天无理由/尺码（尺码不符）)单选;
--       品退在每日统计中按 5 元/件 计入退货快递费损失(见 src/lib/daily-stats.ts)。
-- 兼容: 存量记录两字段为空串, 统计与展示按"默认"处理, 不计快递费。
-- 说明: 未执行本迁移前, 接口会自动降级为不写这两个字段(本地预览不受影响)。

ALTER TABLE return_records ADD COLUMN IF NOT EXISTS sale_method TEXT NOT NULL DEFAULT '';
ALTER TABLE return_records ADD COLUMN IF NOT EXISTS return_reason TEXT NOT NULL DEFAULT '';
