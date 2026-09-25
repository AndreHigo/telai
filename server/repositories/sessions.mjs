export function createSessionRepository(database, { hashSessionToken }) {
  if (typeof hashSessionToken !== "function") throw new Error("hashSessionToken is required");

  function findUserByToken(token, now = new Date().toISOString()) {
    if (!token) return null;
    return database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashSessionToken(token), now) || null;
  }

  function create({ userId, token, expiresAt, createdAt = new Date().toISOString() }) {
    database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .run(hashSessionToken(token), userId, expiresAt, createdAt);
  }

  return { findUserByToken, create };
}
