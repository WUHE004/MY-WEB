-- P3-5/3-6 数据库 VIEW + RPC 函数
-- 在 Supabase SQL Editor 中执行（Dashboard → SQL Editor → 粘贴运行）
-- 创建日期：2026-07-03
--
-- 目的：将服务端内存聚合逻辑下推到数据库，减少 API 往返和超时风险

-- ============================================================
-- 1. 商品汇总视图（P3-5）
-- 替代 /api/summary 中的三表全量扫描 + 内存聚合
-- ============================================================

CREATE OR REPLACE VIEW product_summary_view AS
SELECT
  i.sale_id,
  i.name,
  i.photo,
  i.shelf_no,
  i.manufacturer,
  i.cost_price,
  i.sell_price,
  -- 入库总量 = 各尺码入库数之和
  COALESCE(i.size_80,0) + COALESCE(i.size_90,0) + COALESCE(i.size_95,0) +
  COALESCE(i.size_100,0) + COALESCE(i.size_105,0) + COALESCE(i.size_110,0) +
  COALESCE(i.size_120,0) + COALESCE(i.size_130,0) + COALESCE(i.size_140,0) +
  COALESCE(i.size_150,0) + COALESCE(i.size_160,0) + COALESCE(i.size_170,0) +
  COALESCE(i.size_180,0) AS inbound_total,
  -- 已售总量
  COALESCE(s.sold_total, 0) AS sold_total,
  -- 退货总量
  COALESCE(r.return_total, 0) AS return_total,
  -- 剩余库存 = 入库 - 已售 + 退货
  (
    COALESCE(i.size_80,0) + COALESCE(i.size_90,0) + COALESCE(i.size_95,0) +
    COALESCE(i.size_100,0) + COALESCE(i.size_105,0) + COALESCE(i.size_110,0) +
    COALESCE(i.size_120,0) + COALESCE(i.size_130,0) + COALESCE(i.size_140,0) +
    COALESCE(i.size_150,0) + COALESCE(i.size_160,0) + COALESCE(i.size_170,0) +
    COALESCE(i.size_180,0)
    - COALESCE(s.sold_total, 0) + COALESCE(r.return_total, 0)
  ) AS remaining,
  i.inbound_date,
  i.created_at
FROM inbound_records i
LEFT JOIN (
  SELECT sale_id, SUM(quantity) AS sold_total
  FROM sales_records
  GROUP BY sale_id
) s ON s.sale_id = i.sale_id
LEFT JOIN (
  SELECT sale_id, SUM(quantity) AS return_total
  FROM return_records
  GROUP BY sale_id
) r ON r.sale_id = i.sale_id;

-- ============================================================
-- 2. 各尺码售出/退货汇总视图
-- ============================================================

CREATE OR REPLACE VIEW product_size_summary_view AS
SELECT
  i.sale_id,
  i.name,
  i.photo,
  -- 各尺码入库
  i.size_80, i.size_90, i.size_95, i.size_100, i.size_105, i.size_110,
  i.size_120, i.size_130, i.size_140, i.size_150, i.size_160, i.size_170, i.size_180,
  -- 各尺码已售
  COALESCE(s.size_80, 0) AS sold_80, COALESCE(s.size_90, 0) AS sold_90,
  COALESCE(s.size_95, 0) AS sold_95, COALESCE(s.size_100, 0) AS sold_100,
  COALESCE(s.size_105, 0) AS sold_105, COALESCE(s.size_110, 0) AS sold_110,
  COALESCE(s.size_120, 0) AS sold_120, COALESCE(s.size_130, 0) AS sold_130,
  COALESCE(s.size_140, 0) AS sold_140, COALESCE(s.size_150, 0) AS sold_150,
  COALESCE(s.size_160, 0) AS sold_160, COALESCE(s.size_170, 0) AS sold_170,
  COALESCE(s.size_180, 0) AS sold_180,
  -- 各尺码退货
  COALESCE(r.size_80, 0) AS returned_80, COALESCE(r.size_90, 0) AS returned_90,
  COALESCE(r.size_95, 0) AS returned_95, COALESCE(r.size_100, 0) AS returned_100,
  COALESCE(r.size_105, 0) AS returned_105, COALESCE(r.size_110, 0) AS returned_110,
  COALESCE(r.size_120, 0) AS returned_120, COALESCE(r.size_130, 0) AS returned_130,
  COALESCE(r.size_140, 0) AS returned_140, COALESCE(r.size_150, 0) AS returned_150,
  COALESCE(r.size_160, 0) AS returned_160, COALESCE(r.size_170, 0) AS returned_170,
  COALESCE(r.size_180, 0) AS returned_180
FROM inbound_records i
LEFT JOIN (
  SELECT sale_id,
    SUM(CASE WHEN size = 80 THEN quantity ELSE 0 END) AS size_80,
    SUM(CASE WHEN size = 90 THEN quantity ELSE 0 END) AS size_90,
    SUM(CASE WHEN size = 95 THEN quantity ELSE 0 END) AS size_95,
    SUM(CASE WHEN size = 100 THEN quantity ELSE 0 END) AS size_100,
    SUM(CASE WHEN size = 105 THEN quantity ELSE 0 END) AS size_105,
    SUM(CASE WHEN size = 110 THEN quantity ELSE 0 END) AS size_110,
    SUM(CASE WHEN size = 120 THEN quantity ELSE 0 END) AS size_120,
    SUM(CASE WHEN size = 130 THEN quantity ELSE 0 END) AS size_130,
    SUM(CASE WHEN size = 140 THEN quantity ELSE 0 END) AS size_140,
    SUM(CASE WHEN size = 150 THEN quantity ELSE 0 END) AS size_150,
    SUM(CASE WHEN size = 160 THEN quantity ELSE 0 END) AS size_160,
    SUM(CASE WHEN size = 170 THEN quantity ELSE 0 END) AS size_170,
    SUM(CASE WHEN size = 180 THEN quantity ELSE 0 END) AS size_180
  FROM sales_records GROUP BY sale_id
) s ON s.sale_id = i.sale_id
LEFT JOIN (
  SELECT sale_id,
    SUM(CASE WHEN size = 80 THEN quantity ELSE 0 END) AS size_80,
    SUM(CASE WHEN size = 90 THEN quantity ELSE 0 END) AS size_90,
    SUM(CASE WHEN size = 95 THEN quantity ELSE 0 END) AS size_95,
    SUM(CASE WHEN size = 100 THEN quantity ELSE 0 END) AS size_100,
    SUM(CASE WHEN size = 105 THEN quantity ELSE 0 END) AS size_105,
    SUM(CASE WHEN size = 110 THEN quantity ELSE 0 END) AS size_110,
    SUM(CASE WHEN size = 120 THEN quantity ELSE 0 END) AS size_120,
    SUM(CASE WHEN size = 130 THEN quantity ELSE 0 END) AS size_130,
    SUM(CASE WHEN size = 140 THEN quantity ELSE 0 END) AS size_140,
    SUM(CASE WHEN size = 150 THEN quantity ELSE 0 END) AS size_150,
    SUM(CASE WHEN size = 160 THEN quantity ELSE 0 END) AS size_160,
    SUM(CASE WHEN size = 170 THEN quantity ELSE 0 END) AS size_170,
    SUM(CASE WHEN size = 180 THEN quantity ELSE 0 END) AS size_180
  FROM return_records GROUP BY sale_id
) r ON r.sale_id = i.sale_id;

-- ============================================================
-- 3. 网页下单 RPC 函数（P3-6）
-- 在数据库事务中完成库存校验 + 订单创建 + 售卖记录插入
-- 解决 web-orders 并发竞态超卖问题
-- ============================================================

CREATE OR REPLACE FUNCTION create_web_order(
  p_member_id UUID,
  p_sale_id TEXT,
  p_size INT,
  p_quantity INT,
  p_sell_price NUMERIC,
  p_customer TEXT DEFAULT '',
  p_address TEXT DEFAULT '',
  p_recipient TEXT DEFAULT '',
  p_recipient_phone TEXT DEFAULT ''
)
RETURNS TABLE(order_id UUID, success BOOLEAN, error_msg TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inbound_qty INT;
  v_sold_qty INT;
  v_returned_qty INT;
  v_stock INT;
  v_order_id UUID;
  v_total_price NUMERIC;
BEGIN
  -- 计算当前库存（加行锁防止并发超卖）
  SELECT COALESCE(size_80,0) + COALESCE(size_90,0) + COALESCE(size_95,0) +
         COALESCE(size_100,0) + COALESCE(size_105,0) + COALESCE(size_110,0) +
         COALESCE(size_120,0) + COALESCE(size_130,0) + COALESCE(size_140,0) +
         COALESCE(size_150,0) + COALESCE(size_160,0) + COALESCE(size_170,0) +
         COALESCE(size_180,0)
  INTO v_inbound_qty
  FROM inbound_records
  WHERE sale_id = p_sale_id
  FOR UPDATE; -- 行锁

  SELECT COALESCE(SUM(quantity), 0) INTO v_sold_qty
  FROM sales_records WHERE sale_id = p_sale_id AND size = p_size;

  SELECT COALESCE(SUM(quantity), 0) INTO v_returned_qty
  FROM return_records WHERE sale_id = p_sale_id AND size = p_size;

  v_stock := COALESCE(v_inbound_qty, 0) - v_sold_qty + v_returned_qty;

  IF v_stock < p_quantity THEN
    RETURN QUERY SELECT NULL::UUID, FALSE, '库存不足（剩余 ' || v_stock || ' 件）';
    RETURN;
  END IF;

  -- 创建订单
  v_total_price := p_sell_price * p_quantity;
  INSERT INTO web_orders (member_id, sale_id, size, quantity, sell_price, total_price, customer, address, recipient, recipient_phone, order_time, status)
  VALUES (p_member_id, p_sale_id, p_size, p_quantity, p_sell_price, v_total_price, p_customer, p_address, p_recipient, p_recipient_phone, NOW(), 'pending')
  RETURNING id INTO v_order_id;

  RETURN QUERY SELECT v_order_id, TRUE, NULL::TEXT;
END;
$$;

-- ============================================================
-- 4. 获取表列表 RPC 函数（P2-4 配套）
-- 替代 db-admin 中硬编码的 TABLE_COLUMNS
-- ============================================================

CREATE OR REPLACE FUNCTION get_db_tables()
RETURNS TABLE(table_name TEXT, column_name TEXT, data_type TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    c.rel_name::TEXT AS table_name,
    a.attname::TEXT AS column_name,
    format_type(a.atttypid, a.atttypmod)::TEXT AS data_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid
  WHERE c.relkind = 'r'
    AND n.nspname = 'public'
    AND a.attnum > 0
    AND NOT a.attisdropped
  ORDER BY c.rel_name, a.attnum;
$$;
