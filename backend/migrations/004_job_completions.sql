-- Parts catalog: deliberately generic names (techs know "20A Breaker", not
-- a manufacturer SKU) grouped into categories for a browse-then-filter
-- picker on the mobile side.
CREATE TABLE IF NOT EXISTS parts_catalog (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'each',
  status TEXT NOT NULL DEFAULT 'active'
);

-- One completion record per finished job_segment (i.e. per "Finish" press).
-- The time marker itself (job_segments.ended_at) is already recorded the
-- instant the tech taps Finish, offline or not — this is the supplementary
-- detail (photos/summary/parts) that gets filled in and synced separately,
-- on its own schedule.
CREATE TABLE IF NOT EXISTS job_completions (
  id SERIAL PRIMARY KEY,
  job_segment_id INTEGER NOT NULL REFERENCES job_segments(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  client_id TEXT NOT NULL,
  visit_summary TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_completions_user_client_id_idx
  ON job_completions (user_id, client_id);

CREATE TABLE IF NOT EXISTS job_completion_parts (
  id SERIAL PRIMARY KEY,
  job_completion_id INTEGER NOT NULL REFERENCES job_completions(id),
  part_id INTEGER NOT NULL REFERENCES parts_catalog(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  client_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS job_completion_parts_user_client_id_idx
  ON job_completion_parts (user_id, client_id);

-- r2_key is set as soon as an upload URL is issued; uploaded_at stays null
-- until the device confirms the direct-to-R2 upload actually succeeded, so
-- a dropped upload is easy to tell apart from a finished one.
CREATE TABLE IF NOT EXISTS job_completion_photos (
  id SERIAL PRIMARY KEY,
  job_completion_id INTEGER NOT NULL REFERENCES job_completions(id),
  kind TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_completion_photos_user_client_id_idx
  ON job_completion_photos (user_id, client_id);
