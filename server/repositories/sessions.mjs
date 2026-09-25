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

export function createPostgresSessionRepository(database, { hashSessionToken }) {
  if (typeof hashSessionToken !== "function") throw new Error("hashSessionToken is required");

  async function findUserByToken(token, now = new Date().toISOString()) {
    if (!token) return null;
    const result = await database.query(`
      SELECT users.id, users.username, users.display_name AS "displayName", users.avatar_data AS "avatarData"
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = $1 AND sessions.expires_at > $2
    `, [hashSessionToken(token), now]);
    return result.rows[0] || null;
  }

  async function create({ userId, token, expiresAt, createdAt = new Date().toISOString() }) {
    await database.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)",
      [hashSessionToken(token), userId, expiresAt, createdAt],
    );
  }

  return { findUserByToken, create };
}
