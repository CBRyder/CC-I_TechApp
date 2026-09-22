-- Security/session hardening: 7-day rotating sliding refresh tokens and device-bound sessions.
-- Existing refresh tokens are revoked once so every installed client must
-- establish a new device-bound session after this migration.

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS family_id TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replaced_by_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

UPDATE refresh_tokens
SET
  device_id = COALESCE(device_id, 'legacy-' || id::text),
  family_id = COALESCE(family_id, 'legacy-' || id::text),
  revoked_at = COALESCE(revoked_at, now())
WHERE device_id IS NULL OR family_id IS NULL OR revoked_at IS NULL;

ALTER TABLE refresh_tokens
  ALTER COLUMN device_id SET NOT NULL,
  ALTER COLUMN family_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx
  ON refresh_tokens (token_hash);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_active_idx
  ON refresh_tokens (user_id, device_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx
  ON refresh_tokens (family_id);

CREATE INDEX IF NOT EXISTS refresh_tokens_device_idx
  ON refresh_tokens (user_id, device_id);
