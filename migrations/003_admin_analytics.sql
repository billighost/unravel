-- Migration 003: Admin Email, Analytics Tables, Email/Username Login
-- Adds email to accounts, dedicated analytics table for max-speed reads,
-- and a pre-aggregated daily_stats materialized summary table.

-- 1. Add email column to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email) WHERE email IS NOT NULL;

-- 2. Add email lookup index (case-insensitive via lower())
CREATE INDEX IF NOT EXISTS idx_accounts_email_lower ON accounts(LOWER(email)) WHERE email IS NOT NULL;

-- 3. Add is_public filter index on daily_challenges joined with creations
-- (for efficient today's picture public-only query)
CREATE INDEX IF NOT EXISTS idx_creations_public_daily 
  ON creations(is_daily_challenge, is_public, is_hidden, created_at DESC) 
  WHERE is_daily_challenge = TRUE AND is_public = TRUE AND is_hidden = FALSE;

-- 4. Analytics summary table — updated by triggers/increment on each event
-- Much faster than COUNT(*) aggregation on large tables at read time.
CREATE TABLE IF NOT EXISTS analytics_counters (
  key TEXT PRIMARY KEY,
  value BIGINT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pre-seed known counter keys with 0
INSERT INTO analytics_counters (key, value) VALUES
  ('total_creations', 0),
  ('total_public', 0),
  ('total_hidden', 0),
  ('total_accounts', 0),
  ('total_challenge_completions', 0),
  ('total_views', 0)
ON CONFLICT (key) DO NOTHING;

-- 5. Daily activity table — one row per UTC day, incremented in real-time
CREATE TABLE IF NOT EXISTS daily_activity (
  date TEXT PRIMARY KEY,              -- YYYY-MM-DD UTC
  creations_count INT DEFAULT 0,
  public_count INT DEFAULT 0,
  challenge_completions INT DEFAULT 0,
  new_accounts INT DEFAULT 0,
  views INT DEFAULT 0
);

-- 6. Sync current counts into analytics_counters from existing data
-- (Run once to bootstrap; idempotent via ON CONFLICT DO UPDATE)
INSERT INTO analytics_counters (key, value)
SELECT 'total_creations', COUNT(*) FROM creations
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO analytics_counters (key, value)
SELECT 'total_public', COUNT(*) FROM creations WHERE is_public = TRUE AND is_hidden = FALSE
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO analytics_counters (key, value)
SELECT 'total_hidden', COUNT(*) FROM creations WHERE is_hidden = TRUE
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO analytics_counters (key, value)
SELECT 'total_accounts', COUNT(*) FROM accounts
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

INSERT INTO analytics_counters (key, value)
SELECT 'total_views', COALESCE(SUM(view_count), 0) FROM creations
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- 7. Backfill daily_activity from existing creations (last 30 days)
INSERT INTO daily_activity (date, creations_count, public_count)
SELECT 
  TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
  COUNT(*) AS creations_count,
  COUNT(*) FILTER (WHERE is_public = TRUE) AS public_count
FROM creations
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ON CONFLICT (date) DO UPDATE 
  SET creations_count = EXCLUDED.creations_count,
      public_count = EXCLUDED.public_count;

-- 8. Source mode breakdown table for fast reads
CREATE TABLE IF NOT EXISTS source_mode_stats (
  source_mode TEXT PRIMARY KEY,
  count BIGINT DEFAULT 0
);

INSERT INTO source_mode_stats (source_mode, count)
SELECT source_mode, COUNT(*) FROM creations GROUP BY source_mode
ON CONFLICT (source_mode) DO UPDATE SET count = EXCLUDED.count;

-- 9. Indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_creations_reports ON creations(report_count DESC) WHERE report_count > 0 AND is_hidden = FALSE;
CREATE INDEX IF NOT EXISTS idx_accounts_created ON accounts(created_at DESC);
