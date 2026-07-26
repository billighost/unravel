-- Migration 001: Initial Schema
-- Creates all tables and indexes for the Unravel backend.

CREATE TABLE IF NOT EXISTS creations (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  grid_data JSONB NOT NULL,
  disturbed_positions JSONB,
  thumbnail_url TEXT NOT NULL,
  source_mode TEXT DEFAULT 'upload',
  parent_creation_id TEXT,
  is_daily_challenge BOOLEAN DEFAULT FALSE,
  report_count INT DEFAULT 0,
  is_hidden BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS daily_challenges (
  id SERIAL PRIMARY KEY,
  creation_id TEXT NOT NULL,
  active_date TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS device_streaks (
  device_id TEXT PRIMARY KEY,
  current_streak INT DEFAULT 0,
  longest_streak INT DEFAULT 0,
  last_completed_date TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  creation_id TEXT NOT NULL,
  reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reason TEXT
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_creations_device_id ON creations(device_id);
CREATE INDEX IF NOT EXISTS idx_creations_parent_creation_id ON creations(parent_creation_id);
CREATE INDEX IF NOT EXISTS idx_creations_created_at ON creations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creations_visible ON creations(created_at DESC) WHERE is_hidden = FALSE AND is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_daily_challenges_active_date ON daily_challenges(active_date);
