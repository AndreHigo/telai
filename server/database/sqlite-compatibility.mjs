import { ensureColumn } from "../repositories/sqlite.mjs";

// Ajustes idempotentes mantidos fora do schema inicial para bancos SQLite
// criados por versões anteriores do Telai.
export function ensureCompatibilityColumns(database) {
  ensureColumn(database, "group_messages", "room_id", "TEXT REFERENCES group_rooms(id) ON DELETE CASCADE");
  ensureColumn(database, "group_messages", "parent_message_id", "TEXT REFERENCES group_messages(id) ON DELETE CASCADE");
  ensureColumn(database, "group_messages", "edited_at", "TEXT");
  ensureColumn(database, "group_messages", "author_display_name", "TEXT");
  ensureColumn(database, "group_messages", "author_username", "TEXT");
  ensureColumn(database, "streams", "room_id", "TEXT REFERENCES group_rooms(id) ON DELETE SET NULL");
  // Salas de voz ficam em uma tabela separada dos canais de transmissão.
  // Guardamos o vínculo em uma coluna própria para manter compatibilidade com
  // os bancos antigos e não apontar a FK para a tabela errada.
  ensureColumn(database, "streams", "voice_room_id", "TEXT");
  ensureColumn(database, "group_members", "role_id", "TEXT");
  ensureColumn(database, "group_roles", "can_chat", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "group_roles", "can_stream", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "group_roles", "can_invite", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "group_roles", "can_view_voice_members", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "group_roles", "can_move_members", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "group_roles", "can_moderate_members", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "group_roles", "sort_order", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "group_member_permissions", "can_view_voice_members", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(database, "group_voice_rooms", "max_participants", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(database, "users", "email", "TEXT");
  ensureColumn(database, "users", "avatar_data", "TEXT");
  ensureColumn(database, "users", "is_bot", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "user_preferences", "button_color", "TEXT");
  ensureColumn(database, "user_preferences", "input_background_color", "TEXT");
  ensureColumn(database, "user_preferences", "background_color", "TEXT");
  ensureColumn(database, "user_preferences", "push_to_talk_key", "TEXT");
  ensureColumn(database, "user_preferences", "mute_shortcut", "TEXT");
  ensureColumn(database, "user_preferences", "live_notification_scope", "TEXT NOT NULL DEFAULT 'related'");
  ensureColumn(database, "user_preferences", "voice_microphone_volume", "REAL NOT NULL DEFAULT 1");
  ensureColumn(database, "user_preferences", "voice_output_volume", "REAL NOT NULL DEFAULT 1");
  ensureColumn(database, "user_preferences", "preferred_input_device_id", "TEXT");
  ensureColumn(database, "user_preferences", "preferred_output_device_id", "TEXT");
  database.exec(`
    CREATE TABLE IF NOT EXISTS group_room_reads (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_key TEXT NOT NULL,
      room_id TEXT REFERENCES group_rooms(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL,
      PRIMARY KEY (group_id, user_id, room_key)
    );
    CREATE INDEX IF NOT EXISTS group_room_reads_user_idx ON group_room_reads(group_id, user_id, read_at DESC);
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
    CREATE TABLE IF NOT EXISTS application_commands (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(application_id, name)
    );
    CREATE INDEX IF NOT EXISTS application_commands_application_idx ON application_commands(application_id, name COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS application_group_installations (
      application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      installed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (application_id, group_id)
    );
    CREATE INDEX IF NOT EXISTS application_group_installations_group_idx ON application_group_installations(group_id, created_at DESC);
  `);
}

export function ensureCompatibilityIndexes(database) {
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email) WHERE email IS NOT NULL AND email <> '';
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS stream_chat_messages_stream_idx ON stream_chat_messages(stream_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS group_messages_room_idx ON group_messages(group_id, room_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS group_messages_thread_idx ON group_messages(parent_message_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON direct_messages(sender_id, created_at DESC);
  `);
}
