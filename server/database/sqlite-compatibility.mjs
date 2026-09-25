// Ajustes idempotentes mantidos fora do schema inicial para bancos SQLite
// criados por versões anteriores do Telai.
export function ensureCompatibilityIndexes(database) {
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email) WHERE email IS NOT NULL AND email <> '';
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS stream_chat_messages_stream_idx ON stream_chat_messages(stream_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS group_messages_room_idx ON group_messages(group_id, room_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON direct_messages(sender_id, created_at DESC);
  `);
}
