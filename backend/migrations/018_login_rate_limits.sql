-- Login abuse protection. Rows are intentionally retained briefly so
-- repeated attempts can be rate-limited independently by account, IP, and
-- device. A later audit/retention job can purge old rows.

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  identifier_hash TEXT NOT NULL,
  ip_address INET,
  device_id TEXT,
  succeeded BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_login_attempts_identifier_time_idx
  ON auth_login_attempts (identifier_hash, attempted_at DESC);

CREATE INDEX IF NOT EXISTS auth_login_attempts_ip_time_idx
  ON auth_login_attempts (ip_address, attempted_at DESC);

CREATE INDEX IF NOT EXISTS auth_login_attempts_device_time_idx
  ON auth_login_attempts (device_id, attempted_at DESC);
