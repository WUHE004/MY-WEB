-- ============================================================
-- 售卖总表 (sales_summary) 建表脚本
-- 在 Supabase SQL Editor 中执行
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_summary (
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
  
  -- 各尺码售出数量
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
  
  -- 总售出数量
  total_sold INTEGER DEFAULT 0,
  
  -- 售价信息 JSON: { "price": "order_time", ... }
  sell_price_info JSONB DEFAULT '{}',
  
  -- 售卖次数（不同面单号数量）
  sales_count INTEGER DEFAULT 0,
  
  -- 时间戳
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_sales_summary_updated_at ON sales_summary(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_summary_sales_count ON sales_summary(sales_count DESC);

-- ============================================================
-- 初始化数据：从现有 sales_records 汇总数据到 sales_summary
-- （首次执行，后续由 API 自动同步）
-- ============================================================
INSERT INTO sales_summary (sale_id, photo, name, shelf_no, manufacturer, size_80, size_90, size_95, size_100, size_105, size_110, size_120, size_130, size_140, size_150, size_160, size_170, size_180, total_sold, sell_price_info, sales_count, updated_at)
SELECT
  UPPER(sr.sale_id) AS sale_id,
  COALESCE(ib.photo, '') AS photo,
  COALESCE(ib.name, '') AS name,
  COALESCE(ib.shelf_no, '') AS shelf_no,
  COALESCE(ib.manufacturer, '') AS manufacturer,
  COALESCE(SUM(CASE WHEN sr.size = 80  THEN sr.quantity ELSE 0 END), 0) AS size_80,
  COALESCE(SUM(CASE WHEN sr.size = 90  THEN sr.quantity ELSE 0 END), 0) AS size_90,
  COALESCE(SUM(CASE WHEN sr.size = 95  THEN sr.quantity ELSE 0 END), 0) AS size_95,
  COALESCE(SUM(CASE WHEN sr.size = 100 THEN sr.quantity ELSE 0 END), 0) AS size_100,
  COALESCE(SUM(CASE WHEN sr.size = 105 THEN sr.quantity ELSE 0 END), 0) AS size_105,
  COALESCE(SUM(CASE WHEN sr.size = 110 THEN sr.quantity ELSE 0 END), 0) AS size_110,
  COALESCE(SUM(CASE WHEN sr.size = 120 THEN sr.quantity ELSE 0 END), 0) AS size_120,
  COALESCE(SUM(CASE WHEN sr.size = 130 THEN sr.quantity ELSE 0 END), 0) AS size_130,
  COALESCE(SUM(CASE WHEN sr.size = 140 THEN sr.quantity ELSE 0 END), 0) AS size_140,
  COALESCE(SUM(CASE WHEN sr.size = 150 THEN sr.quantity ELSE 0 END), 0) AS size_150,
  COALESCE(SUM(CASE WHEN sr.size = 160 THEN sr.quantity ELSE 0 END), 0) AS size_160,
  COALESCE(SUM(CASE WHEN sr.size = 170 THEN sr.quantity ELSE 0 END), 0) AS size_170,
  COALESCE(SUM(CASE WHEN sr.size = 180 THEN sr.quantity ELSE 0 END), 0) AS size_180,
  COALESCE(SUM(sr.quantity), 0) AS total_sold,
  -- 聚合 sell_price_info: 每个售价取最新 order_time
  COALESCE(
    jsonb_object_agg(
      price::TEXT,
      max_order_time
    ) FILTER (WHERE price IS NOT NULL),
    '{}'::jsonb
  ) AS sell_price_info,
  COALESCE(COUNT(DISTINCT NULLIF(sr.tracking_number, '')), 0) AS sales_count,
  NOW() AS updated_at
FROM sales_records sr
LEFT JOIN LATERAL (
  SELECT photo, name, shelf_no, manufacturer
  FROM inbound_records
  WHERE UPPER(inbound_records.sale_id) = UPPER(sr.sale_id)
  LIMIT 1
) ib ON true
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (sell_price) sell_price AS price, order_time AS max_order_time
  FROM sales_records sr2
  WHERE UPPER(sr2.sale_id) = UPPER(sr.sale_id)
    AND sr2.sell_price > 0
  ORDER BY sell_price, order_time DESC
) sp ON true
WHERE sr.sale_id IS NOT NULL
  AND TRIM(sr.sale_id) <> ''
GROUP BY UPPER(sr.sale_id), ib.photo, ib.name, ib.shelf_no, ib.manufacturer
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
  total_sold = EXCLUDED.total_sold,
  sell_price_info = EXCLUDED.sell_price_info,
  sales_count = EXCLUDED.sales_count,
  updated_at = EXCLUDED.updated_at;