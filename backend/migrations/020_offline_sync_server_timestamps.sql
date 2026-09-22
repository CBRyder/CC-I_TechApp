-- Preserve both the device-recorded event time and the server receipt time.
-- Client timestamps remain useful for offline chronology, but receipt times
-- are authoritative for when the backend accepted the record.

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

ALTER TABLE job_segments
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

ALTER TABLE job_completions
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

ALTER TABLE job_completion_parts
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

ALTER TABLE job_completion_photos
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS time_entries_synced_at_idx ON time_entries (synced_at);
CREATE INDEX IF NOT EXISTS job_segments_synced_at_idx ON job_segments (synced_at);
CREATE INDEX IF NOT EXISTS job_completions_synced_at_idx ON job_completions (synced_at);
