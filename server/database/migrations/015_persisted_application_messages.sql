ALTER TABLE group_messages
  ADD COLUMN IF NOT EXISTS application_interaction_id TEXT REFERENCES application_interactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS group_messages_application_interaction_idx
  ON group_messages(application_interaction_id);
