-- Telai PostgreSQL baseline.
-- Keep identifiers and integer flags compatible with the current API while
-- removing SQLite-only PRAGMA, COLLATE NOCASE and INSERT OR IGNORE assumptions.

CREATE TABLE IF NOT EXISTS telai_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_data TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  email TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_nocase_idx ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email) WHERE email IS NOT NULL AND email <> '';

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS groups_slug_nocase_idx ON groups (LOWER(slug));

CREATE TABLE IF NOT EXISTS group_rooms (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('text', 'live')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(group_id, slug)
);
CREATE INDEX IF NOT EXISTS group_rooms_group_idx ON group_rooms(group_id, created_at);

CREATE TABLE IF NOT EXISTS group_voice_rooms (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  max_participants INTEGER NOT NULL DEFAULT 8,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(group_id, slug)
);
CREATE INDEX IF NOT EXISTS group_voice_rooms_group_idx ON group_voice_rooms(group_id, created_at);

CREATE TABLE IF NOT EXISTS user_consents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK(consent_type IN ('terms', 'privacy')),
  policy_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  UNIQUE(user_id, consent_type, policy_version)
);
CREATE INDEX IF NOT EXISTS user_consents_user_idx ON user_consents(user_id, consent_type, accepted_at DESC);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK(theme IN ('dark', 'light')),
  default_quality TEXT NOT NULL DEFAULT 'balanced' CHECK(default_quality IN ('economy', 'balanced', 'high')),
  default_audio TEXT NOT NULL DEFAULT 'source' CHECK(default_audio IN ('source', 'system')),
  button_color TEXT,
  input_background_color TEXT,
  background_color TEXT,
  push_to_talk_key TEXT,
  mute_shortcut TEXT,
  live_notification_scope TEXT NOT NULL DEFAULT 'related' CHECK(live_notification_scope IN ('related', 'all')),
  voice_microphone_volume REAL NOT NULL DEFAULT 1,
  voice_output_volume REAL NOT NULL DEFAULT 1,
  preferred_input_device_id TEXT,
  preferred_output_device_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_voice_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  volume REAL NOT NULL DEFAULT 1 CHECK(volume >= 0 AND volume <= 1),
  locally_muted INTEGER NOT NULL DEFAULT 0 CHECK(locally_muted IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, target_user_id)
);
CREATE INDEX IF NOT EXISTS user_voice_preferences_target_idx ON user_voice_preferences(target_user_id);

CREATE TABLE IF NOT EXISTS channel_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_data TEXT,
  games TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS oauth_accounts_user_idx ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'member')),
  role_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_roles (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#5865f2',
  can_chat INTEGER NOT NULL DEFAULT 1,
  can_stream INTEGER NOT NULL DEFAULT 1,
  can_invite INTEGER NOT NULL DEFAULT 1,
  can_view_voice_members INTEGER NOT NULL DEFAULT 1,
  can_move_members INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(group_id, name)
);
CREATE INDEX IF NOT EXISTS group_roles_group_idx ON group_roles(group_id, is_default, name);

CREATE TABLE IF NOT EXISTS group_member_permissions (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_chat INTEGER NOT NULL DEFAULT 1,
  can_stream INTEGER NOT NULL DEFAULT 1,
  can_invite INTEGER NOT NULL DEFAULT 1,
  can_view_voice_members INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_invites (
  token_hash TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_user_invites (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS group_user_invites_recipient_idx ON group_user_invites(invited_user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS group_user_invites_group_idx ON group_user_invites(group_id, status, created_at);

CREATE TABLE IF NOT EXISTS group_join_requests (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_join_requests_group_idx ON group_join_requests(group_id, status, updated_at);
CREATE INDEX IF NOT EXISTS group_join_requests_user_idx ON group_join_requests(user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE(user_id, type, entity_id)
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_notices (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS maintenance_notices_active_idx ON maintenance_notices(expires_at, starts_at DESC);

CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  room_name TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('public', 'private')),
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES group_rooms(id) ON DELETE SET NULL,
  voice_room_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS streams_live_idx ON streams(ended_at, visibility);

CREATE TABLE IF NOT EXISTS stream_chat_messages (
  id TEXT PRIMARY KEY,
  channel_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_id TEXT REFERENCES streams(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stream_chat_messages_channel_idx ON stream_chat_messages(channel_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stream_chat_messages_stream_idx ON stream_chat_messages(stream_id, created_at DESC);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, followed_id),
  CHECK(follower_id <> followed_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, friend_id),
  CHECK(user_id <> friend_id)
);
CREATE INDEX IF NOT EXISTS friendships_user_idx ON friendships(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS friendships_friend_idx ON friendships(friend_id, created_at DESC);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'canceled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_recipient_idx ON friend_requests(recipient_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS friend_requests_sender_idx ON friend_requests(sender_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_pair_idx ON friend_requests(sender_id, recipient_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS group_messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES group_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS group_messages_recent_idx ON group_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS group_messages_room_idx ON group_messages(group_id, room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS direct_conversations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS direct_conversation_members (
  conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS direct_conversation_members_user_idx ON direct_conversation_members(user_id, conversation_id);

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS direct_messages_conversation_idx ON direct_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON direct_messages(sender_id, created_at DESC);
