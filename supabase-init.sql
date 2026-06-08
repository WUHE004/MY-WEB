-- 模特库表
CREATE TABLE IF NOT EXISTS model_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建 Storage bucket（需在 Supabase Dashboard → Storage 中手动创建名为 model-photos 的 bucket，权限设为 public）