CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tech',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  job_number TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  clock_in_at TIMESTAMPTZ NOT NULL,
  clock_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_segments (
  id SERIAL PRIMARY KEY,
  time_entry_id INTEGER NOT NULL REFERENCES time_entries(id),
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  state TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS timesheets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id SERIAL PRIMARY KEY,
  timesheet_id INTEGER NOT NULL REFERENCES timesheets(id),
  job_segment_id INTEGER NOT NULL REFERENCES job_segments(id)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  value TEXT
);
