-- 004: Supabase 用量仪表盘 RPC
-- 在 Supabase SQL Editor 中执行（Dashboard → SQL Editor → 粘贴运行）
-- 创建日期：2026-09-28
--
-- 目的：为桌面端 数据库管理 → 用量仪表盘 提供"数据库空间"真实用量
-- (pg_database_size 无法通过 PostgREST 直接查询, 需封装为 SECURITY DEFINER 函数)

CREATE OR REPLACE FUNCTION public.get_db_usage()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT json_build_object(
    'db_size', pg_database_size(current_database())
  );
$$;

-- 仅允许 service_role(db-admin API)调用, 不暴露给前台用户
REVOKE ALL ON FUNCTION public.get_db_usage() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_usage() TO service_role;
