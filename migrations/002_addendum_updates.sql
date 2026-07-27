-- Migration 002: Addendum Updates
-- Add columns and tables for view count and accounts schema.

ALTER TABLE creations ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;
ALTER TABLE creations ADD COLUMN IF NOT EXISTS username TEXT;
CREATE INDEX IF NOT EXISTS idx_creations_username ON creations(username);

ALTER TABLE device_streaks ADD COLUMN IF NOT EXISTS username TEXT;
CREATE INDEX IF NOT EXISTS idx_device_streaks_username ON device_streaks(username);

CREATE TABLE IF NOT EXISTS accounts (
  username TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_sessions (
  device_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  associated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (username) REFERENCES accounts(username) ON DELETE CASCADE
);
