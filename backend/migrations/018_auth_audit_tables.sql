-- Complete the tables used by the authentication audit/throttling code.
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id INTEGER,
  actor_display_name TEXT,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  resource_type TEXT,
  resource_id TEXT,
  ip_address INET,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_events_occurred_idx
  ON audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON audit_events (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_target_idx
  ON audit_events (target_user_id, occurred_at DESC);

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
