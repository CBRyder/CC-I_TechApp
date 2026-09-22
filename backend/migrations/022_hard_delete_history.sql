-- Historical employee identity retention for hard account deletion.
-- Business records keep First Name + Last Initial after the account row is
-- removed. User foreign keys become nullable so the account can actually be
-- deleted without orphaning or losing the historical row.

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_segments ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_completions ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_completion_parts ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_completion_photos ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS employee_tech_types TEXT[];

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    WHERE con.contype = 'f'
      AND a.attname = 'user_id'
      AND c.relname IN (
        'time_entries',
        'job_segments',
        'timesheets',
        'job_completions',
        'job_completion_parts',
        'job_completion_photos',
        'job_assignments',
        'user_preferences',
        'user_roles'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.schema_name, r.table_name, r.constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE time_entries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_segments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE timesheets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_completions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_completion_parts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_completion_photos ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_assignments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE user_preferences ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE time_entries
  ADD CONSTRAINT time_entries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE job_segments
  ADD CONSTRAINT job_segments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE timesheets
  ADD CONSTRAINT timesheets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE job_completions
  ADD CONSTRAINT job_completions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE job_completion_parts
  ADD CONSTRAINT job_completion_parts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE job_completion_photos
  ADD CONSTRAINT job_completion_photos_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE job_assignments
  ADD CONSTRAINT job_assignments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
