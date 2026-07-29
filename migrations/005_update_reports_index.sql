-- Migration 005: Update Reports Index
-- Optimizes the reports query to fetch both hidden and unhidden creations with report_count > 0.
CREATE INDEX IF NOT EXISTS idx_creations_reports_all 
  ON creations(report_count DESC) 
  WHERE report_count > 0;
