-- Server-controlled photo access metadata.
-- Uploads remain private in R2; the API will only issue a short-lived
-- download URL after checking the caller's authorization to the completion.

ALTER TABLE job_completion_photos
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  ADD COLUMN IF NOT EXISTS byte_size BIGINT,
  ADD COLUMN IF NOT EXISTS sha256 TEXT;

CREATE INDEX IF NOT EXISTS job_completion_photos_completion_idx
  ON job_completion_photos (job_completion_id);
