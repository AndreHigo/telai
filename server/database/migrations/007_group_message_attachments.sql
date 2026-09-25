CREATE TABLE IF NOT EXISTS group_message_attachments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS group_message_attachments_message_idx ON group_message_attachments(group_id, message_id, created_at, id);
