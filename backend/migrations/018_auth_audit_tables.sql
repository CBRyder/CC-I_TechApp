-- Complete the tables used by the authentication audit/throttling code.
--
-- NOTE: this file originally also defined `audit_events` here with an
-- `occurred_at` column. That collided with migration 019_audit_events.sql,
-- which defines the SAME table (so its own CREATE TABLE IF NOT EXISTS was a
-- no-op) with a `created_at` column instead — the one the app code (see
-- admin.js's GET /audit, and audit.js) actually queries. Since this file
-- runs first alphabetically, its version was winning and every deploy would
-- fail on 019's `CREATE INDEX ... (created_at ...)` the moment it hit a
-- fresh database. Removed here; 019_audit_events.sql is the authoritative
-- definition now.
CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  identifier_hash TEXT NOT NULL,
  ip_address INET,
  device_id TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS auth_login_attempts_identifier_idx
  ON auth_login_attempts (identifier_hash, attempted_at DESC);
CREATE INDEX IF NOT EXISTS auth_login_attempts_ip_idx
  ON auth_login_attempts (ip_address, attempted_at DESC);
CREATE INDEX IF NOT EXISTS auth_login_attempts_device_idx
  ON auth_login_attempts (device_id, attempted_at DESC);
