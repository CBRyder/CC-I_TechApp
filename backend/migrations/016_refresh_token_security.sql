-- Session/device metadata required by the rotating 7-day refresh-token model.
-- Existing refresh tokens are invalidated when this migration is applied;
-- users must sign in again rather than carrying forward legacy long-lived
-- tokens.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS family_id TEXT,
  ADD COLUMN IF NOT EXISTS replaced_by_hash TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

UPDATE refresh_tokens
SET revoked_at = COALESCE(revoked_at, now())
WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_token_hash_uidx
  ON refresh_tokens (token_hash);

CREATE INDEX IF NOT EXISTS refresh_tokens_active_device_idx
  ON refresh_tokens (user_id, device_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx
  ON refresh_tokens (user_id, family_id);
