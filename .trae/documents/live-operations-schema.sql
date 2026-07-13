-- 直播运营操作台数据库表 DDL
-- 在 Supabase Dashboard → SQL Editor 中执行此文件

-- ========== 表1：live_track_news（赛道资讯，每日覆盖） ==========
CREATE TABLE IF NOT EXISTS live_track_news (
  id BIGSERIAL PRIMARY KEY,
  date TEXT UNIQUE NOT NULL,
  hot_topics JSONB,
  top_anchors JSONB,
  douyin_hashtags JSONB,
  category_insights TEXT,
  raw_search_results JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 表2：douyin_oauth_tokens（抖音授权令牌） ==========
CREATE TABLE IF NOT EXISTS douyin_oauth_tokens (
  id BIGSERIAL PRIMARY KEY,
  open_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 表3：douyin_live_sessions（直播场次，保留最近 3 场） ==========
CREATE TABLE IF NOT EXISTS douyin_live_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  open_id TEXT NOT NULL,
  title TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration INT,
  total_viewers INT,
  peak_viewers INT,
  avg_stay_duration INT,
  orders_count INT,
  gmv NUMERIC,
  top_products JSONB,
  retention_curve JSONB,
  script_notes TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dls_openid ON douyin_live_sessions(open_id);

-- ========== 表4：live_shoot_scripts（拍摄脚本历史，可选） ==========
CREATE TABLE IF NOT EXISTS live_shoot_scripts (
  id BIGSERIAL PRIMARY KEY,
  user_idea TEXT,
  script_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 完成提示
SELECT 'live-operations tables created successfully' AS message;
