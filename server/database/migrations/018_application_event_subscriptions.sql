ALTER TABLE application_group_installations ADD COLUMN IF NOT EXISTS event_subscriptions_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT
);
CREATE INDEX IF NOT EXISTS application_events_claim_idx ON application_events(application_id, claimed_at, expires_at, created_at);
