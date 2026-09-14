-- A user can hold more than one role at once (e.g. an owner who's also a
-- field tech), so a single users.role column can't express that. This
-- table is the real source of authorization truth going forward; users.role
-- stays as-is for now (used only as the default role at registration).
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);

-- Backfill: every existing user keeps the single role they already had.
INSERT INTO user_roles (user_id, role)
SELECT id, role FROM users
ON CONFLICT (user_id, role) DO NOTHING;
