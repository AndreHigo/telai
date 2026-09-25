ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS parent_message_id TEXT REFERENCES group_messages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS group_messages_thread_idx ON group_messages(parent_message_id, created_at ASC);
