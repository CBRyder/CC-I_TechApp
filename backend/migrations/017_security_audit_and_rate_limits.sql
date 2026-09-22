-- Security audit trail. This table intentionally stores security events,
-- not passwords, access tokens, refresh tokens, or full request bodies.
CREATE TABLE IF NOT EXISTS security_audit_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id INTEGER,
  session_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS security_audit_log_actor_idx
  ON security_audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_log_action_idx
  ON security_audit_log (action, occurred_at DESC);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  UNIQUE(key_hash)
);
