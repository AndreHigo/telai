ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS author_display_name TEXT;
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS author_username TEXT;

CREATE TABLE IF NOT EXISTS group_webhooks (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES group_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS group_webhooks_group_idx ON group_webhooks(group_id, created_at DESC);
