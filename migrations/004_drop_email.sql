-- Drop email column from accounts since we are moving back to username-only auth + admin gating
ALTER TABLE accounts DROP COLUMN IF EXISTS email;
