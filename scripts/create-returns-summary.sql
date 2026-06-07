-- ============================================================
-- 退货总表 (returns_summary) 建表脚本
-- 在 Supabase SQL Editor 中执行
-- ============================================================

CREATE TABLE IF NOT EXISTS returns_summary (
  -- 售卖编号（主键）
  sale_id TEXT PRIMARY KEY,
  
  -- 照片（引用入库清单中的照片）
  photo TEXT DEFAULT '',
  
  -- 产品名称（引用入库清单）
  name TEXT DEFAULT '',
  
  -- 货架号（引用入库清单）
  shelf_no TEXT DEFAULT '',
  
  -- 厂家（引用入库清单）
  manufacturer TEXT DEFAULT '',
  
  -- 各尺码退货数量
  size_80  INTEGER DEFAULT 0,
  size_90  INTEGER DEFAULT 0,
  size_95  INTEGER DEFAULT 0,
  size_100 INTEGER DEFAULT 0,
  size_105 INTEGER DEFAULT 0,
  size_110 INTEGER DEFAULT 0,
  size_120 INTEGER DEFAULT 0,
  size_130 INTEGER DEFAULT 0,
  size_140 INTEGER DEFAULT 0,
  size_150 INTEGER DEFAULT 0,
  size_160 INTEGER DEFAULT 0,
  size_170 INTEGER DEFAULT 0,
  size_180 INTEGER DEFAULT 0,
  
  -- 总退货数量
  total_returned INTEGER DEFAULT 0,
  
  -- 退货价信息 JSON: { "price": "return_time", ... }
  return_price_info JSONB DEFAULT '{}',
  
  -- 退货次数（该商品在退货表中的记录数）
  return_count INTEGER DEFAULT 0,
  
  -- 时间戳
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_returns_summary_updated_at ON returns_summary(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_summary_return_count ON returns_summary(return_count DESC);

-- ============================================================
-- 初始化数据：从现有 return_records 汇总数据到 returns_summary
-- ============================================================
INSERT INTO returns_summary (sale_id, photo, name, shelf_no, manufacturer, size_80, size_90, size_95, size_100, size_105, size_110, size_120, size_130, size_140, size_150, size_160, size_170, size_180, total_returned, return_price_info, return_count, updated_at)
SELECT
  UPPER(rr.sale_id) AS sale_id,
  COALESCE(ib.photo, '') AS photo,
  COALESCE(ib.name, '') AS name,
  COALESCE(ib.shelf_no, '') AS shelf_no,
  COALESCE(ib.manufacturer, '') AS manufacturer,
  COALESCE(SUM(CASE WHEN rr.size = 80  THEN rr.quantity ELSE 0 END), 0) AS size_80,
  COALESCE(SUM(CASE WHEN rr.size = 90  THEN rr.quantity ELSE 0 END), 0) AS size_90,
  COALESCE(SUM(CASE WHEN rr.size = 95  THEN rr.quantity ELSE 0 END), 0) AS size_95,
  COALESCE(SUM(CASE WHEN rr.size = 100 THEN rr.quantity ELSE 0 END), 0) AS size_100,
  COALESCE(SUM(CASE WHEN rr.size = 105 THEN rr.quantity ELSE 0 END), 0) AS size_105,
  COALESCE(SUM(CASE WHEN rr.size = 110 THEN rr.quantity ELSE 0 END), 0) AS size_110,
  COALESCE(SUM(CASE WHEN rr.size = 120 THEN rr.quantity ELSE 0 END), 0) AS size_120,
  COALESCE(SUM(CASE WHEN rr.size = 130 THEN rr.quantity ELSE 0 END), 0) AS size_130,
  COALESCE(SUM(CASE WHEN rr.size = 140 THEN rr.quantity ELSE 0 END), 0) AS size_140,
  COALESCE(SUM(CASE WHEN rr.size = 150 THEN rr.quantity ELSE 0 END), 0) AS size_150,
  COALESCE(SUM(CASE WHEN rr.size = 160 THEN rr.quantity ELSE 0 END), 0) AS size_160,
  COALESCE(SUM(CASE WHEN rr.size = 170 THEN rr.quantity ELSE 0 END), 0) AS size_170,
  COALESCE(SUM(CASE WHEN rr.size = 180 THEN rr.quantity ELSE 0 END), 0) AS size_180,
  COALESCE(SUM(rr.quantity), 0) AS total_returned,
  COALESCE(
    jsonb_object_agg(
      price::TEXT,
      max_return_time
    ) FILTER (WHERE price IS NOT NULL),
    '{}'::jsonb
  ) AS return_price_info,
  COUNT(*) AS return_count,
  NOW() AS updated_at
FROM return_records rr
LEFT JOIN LATERAL (
  SELECT photo, name, shelf_no, manufacturer
  FROM inbound_records
  WHERE UPPER(inbound_records.sale_id) = UPPER(rr.sale_id)
  LIMIT 1
) ib ON true
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (return_price) return_price AS price, COALESCE(return_time, created_at) AS max_return_time
  FROM return_records rr2
  WHERE UPPER(rr2.sale_id) = UPPER(rr.sale_id)
    AND rr2.return_price > 0
  ORDER BY return_price, COALESCE(return_time, created_at) DESC
) rp ON true
WHERE rr.sale_id IS NOT NULL
  AND TRIM(rr.sale_id) <> ''
GROUP BY UPPER(rr.sale_id), ib.photo, ib.name, ib.shelf_no, ib.manufacturer
ON CONFLICT (sale_id) DO UPDATE SET
  photo = EXCLUDED.photo,
  name = EXCLUDED.name,
  shelf_no = EXCLUDED.shelf_no,
  manufacturer = EXCLUDED.manufacturer,
  size_80 = EXCLUDED.size_80,
  size_90 = EXCLUDED.size_90,
  size_95 = EXCLUDED.size_95,
  size_100 = EXCLUDED.size_100,
  size_105 = EXCLUDED.size_105,
  size_110 = EXCLUDED.size_110,
  size_120 = EXCLUDED.size_120,
  size_130 = EXCLUDED.size_130,
  size_140 = EXCLUDED.size_140,
  size_150 = EXCLUDED.size_150,
  size_160 = EXCLUDED.size_160,
  size_170 = EXCLUDED.size_170,
  size_180 = EXCLUDED.size_180,
  total_returned = EXCLUDED.total_returned,
  return_price_info = EXCLUDED.return_price_info,
  return_count = EXCLUDED.return_count,
  updated_at = EXCLUDED.updated_at;