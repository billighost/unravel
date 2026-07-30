-- Migration 006: Admin Audit Logs
-- Creates a table to record moderator activities such as hiding creations, restoring them, or updating the daily challenge.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  action_type TEXT NOT NULL,          -- 'hide', 'restore', 'dismiss', 'set_daily'
  creation_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);
