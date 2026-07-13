-- 运营操作台数据库表 DDL
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

-- ========== 表2：live_sessions_news（直播资讯，每日覆盖） ==========
CREATE TABLE IF NOT EXISTS live_sessions_news (
  id BIGSERIAL PRIMARY KEY,
  date TEXT UNIQUE NOT NULL,
  hot_techniques JSONB,
  hot_rooms JSONB,
  retention_tips JSONB,
  scripts JSONB,
  category_insights TEXT,
  raw_search_results JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 表3：live_shoot_scripts（拍摄脚本历史，可选） ==========
CREATE TABLE IF NOT EXISTS live_shoot_scripts (
  id BIGSERIAL PRIMARY KEY,
  user_idea TEXT,
  script_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 完成提示
SELECT 'live-operations tables created successfully' AS message;
