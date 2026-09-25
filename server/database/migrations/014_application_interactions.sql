CREATE TABLE IF NOT EXISTS application_interactions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES group_rooms(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_id TEXT REFERENCES application_commands(id) ON DELETE SET NULL,
  parent_interaction_id TEXT REFERENCES application_interactions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK(kind IN ('command', 'component', 'modal')),
  command_name TEXT,
  custom_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'claimed', 'responded', 'expired')),
  response_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS application_interactions_pending_idx ON application_interactions(application_id, status, created_at);
CREATE INDEX IF NOT EXISTS application_interactions_user_idx ON application_interactions(user_id, created_at DESC);
