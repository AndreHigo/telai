import { ensureColumn } from "../repositories/sqlite.mjs";

// Ajustes idempotentes mantidos fora do schema inicial para bancos SQLite
// criados por versões anteriores do Telai.
export function ensureCompatibilityColumns(database) {
  ensureColumn(database, "group_messages", "room_id", "TEXT REFERENCES group_rooms(id) ON DELETE CASCADE");
  ensureColumn(database, "group_messages", "edited_at", "TEXT");
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
  `);
}

export function ensureCompatibilityIndexes(database) {
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email) WHERE email IS NOT NULL AND email <> '';
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS stream_chat_messages_stream_idx ON stream_chat_messages(stream_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS group_messages_room_idx ON group_messages(group_id, room_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON direct_messages(sender_id, created_at DESC);
  `);
}
