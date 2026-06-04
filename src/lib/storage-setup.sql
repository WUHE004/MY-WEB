-- Supabase Storage 设置
-- 请在 Supabase Dashboard → SQL Editor 中执行此文件

-- 1. 创建 product-photos 存储桶（公开访问，用于商品图片）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-photos',
  'product-photos',
  true,
  5242880,  -- 5MB 单文件上限
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- 2. 允许公开读取（任何人可查看图片）
CREATE POLICY "允许公开读取商品图片"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-photos');

-- 3. 允许服务端上传（使用 service_role key）
CREATE POLICY "允许服务端上传"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-photos');

-- 4. 允许服务端删除
CREATE POLICY "允许服务端删除"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-photos');