-- A reusable directory of customers ("umbrellas") for the job-creation
-- picker — pick an existing one instead of retyping, or add a new one on
-- the fly. Decoupled from jobs (no FK): jobs.customer_name stays the
-- simple free-text field every existing query already reads, this is
-- just where that name comes from when creating a job through the app.
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
