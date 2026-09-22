-- Registration/login now runs on full_name + username + password, with
-- email optional (used for nothing yet — just retained for later, e.g.
-- password reset). username becomes the required unique identifier;
-- existing rows are backfilled from their email's local-part.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

DO $$
DECLARE
  r RECORD;
  base TEXT;
  candidate TEXT;
  n INTEGER;
BEGIN
  FOR r IN SELECT id, email FROM users WHERE username IS NULL LOOP
    base := lower(regexp_replace(split_part(coalesce(r.email, ''), '@', 1), '[^a-z0-9_]', '', 'g'));
    IF base = '' THEN base := 'user' || r.id; END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM users WHERE username = candidate AND id != r.id) LOOP
      n := n + 1;
      candidate := base || n::text;
    END LOOP;
    UPDATE users SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
