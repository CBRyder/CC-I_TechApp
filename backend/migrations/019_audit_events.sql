-- Security audit trail. Do not store passwords, access tokens, refresh tokens,
-- photo URLs, or other bearer credentials here.
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id INTEGER,
  actor_display_name TEXT,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  resource_type TEXT,
  resource_id TEXT,
  ip_address INET,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_created_at_idx
  ON audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON audit_events (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_target_idx
  ON audit_events (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_action_idx
  ON audit_events (action, created_at DESC);
