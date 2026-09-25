CREATE TABLE IF NOT EXISTS group_moderation (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('ban', 'mute')),
  reason TEXT NOT NULL DEFAULT '',
  expires_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(group_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS group_moderation_active_idx ON group_moderation(group_id, kind, expires_at);
