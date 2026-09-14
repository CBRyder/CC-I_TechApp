-- Which jobs a tech is assigned to on a given date — what "today's jobs"
-- on the mobile Home screen actually reads from. No dispatcher/admin UI
-- exists yet to assign jobs to *other* people, so for now a tech assigns
-- jobs to themselves (POST /jobs/:jobId/assign) — a real dispatch flow can
-- write to this same table later without changing the mobile read side.
CREATE TABLE IF NOT EXISTS job_assignments (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  assigned_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS job_assignments_unique_idx
  ON job_assignments (job_id, user_id, assigned_date);
