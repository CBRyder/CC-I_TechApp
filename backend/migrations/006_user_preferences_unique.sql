-- One row per (user, key) so preference writes can be a clean upsert.
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_key_idx
  ON user_preferences (user_id, key);
