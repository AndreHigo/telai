ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_owner_idx ON applications(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS application_tokens (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS application_tokens_application_idx ON application_tokens(application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS application_group_installations (
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  installed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (application_id, group_id)
);
CREATE INDEX IF NOT EXISTS application_group_installations_group_idx ON application_group_installations(group_id, created_at DESC);
