-- Preserve business history while allowing employee accounts to be hard-deleted.
-- Historical rows keep only "First Name + Last Initial" and no longer depend
-- on the users table for that identity.

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_segments ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_completions ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_completion_parts ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_completion_photos ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS employee_display_name TEXT;
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS employee_tech_types TEXT[];

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'time_entries',
    'job_segments',
    'timesheets',
    'job_completions',
    'job_completion_parts',
    'job_completion_photos',
    'job_assignments'
  ] LOOP
    EXECUTE format($f$
      UPDATE %I t
      SET employee_display_name =
        CASE
          WHEN position(' ' IN trim(u.full_name)) > 0 THEN
            split_part(trim(u.full_name), ' ', 1) || ' ' ||
            upper(right(split_part(trim(u.full_name), ' ', array_length(string_to_array(trim(u.full_name), ' '), 1)), 1)) || '.'
          ELSE trim(u.full_name)
        END
      FROM users u
      WHERE t.user_id = u.id
        AND t.employee_display_name IS NULL
    $f$, tbl);
  END LOOP;
END $$;

UPDATE job_assignments ja
SET employee_tech_types = u.tech_types
FROM users u
WHERE ja.user_id = u.id
  AND ja.employee_tech_types IS NULL;

ALTER TABLE time_entries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_segments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE timesheets ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_completions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_completion_parts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_completion_photos ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE job_assignments ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_user_id_fkey;
ALTER TABLE job_segments DROP CONSTRAINT IF EXISTS job_segments_user_id_fkey;
ALTER TABLE timesheets DROP CONSTRAINT IF EXISTS timesheets_user_id_fkey;
ALTER TABLE job_completions DROP CONSTRAINT IF EXISTS job_completions_user_id_fkey;
ALTER TABLE job_completion_parts DROP CONSTRAINT IF EXISTS job_completion_parts_user_id_fkey;
ALTER TABLE job_completion_photos DROP CONSTRAINT IF EXISTS job_completion_photos_user_id_fkey;
ALTER TABLE job_assignments DROP CONSTRAINT IF EXISTS job_assignments_user_id_fkey;
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey;
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_user_id_fkey;

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

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
