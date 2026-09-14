-- Support offline-first mobile tracking: each row created on-device carries
-- a client-generated UUID so re-syncing the same action after a dropped
-- connection is a no-op (upsert), not a duplicate.
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE job_segments ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_user_client_id_idx
  ON time_entries (user_id, client_id);
CREATE UNIQUE INDEX IF NOT EXISTS job_segments_user_client_id_idx
  ON job_segments (user_id, client_id);
