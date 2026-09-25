export function createUserProfileRepository(database) {
  function findCredentialsByUsername(username) {
    return database.prepare(`
      SELECT id, username, display_name AS displayName, avatar_data AS avatarData, password_hash AS passwordHash
      FROM users WHERE username = ?
    `).get(username) || null;
  }

  function createUser({ id, username, displayName, passwordHash, createdAt }) {
    database.prepare("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, username, displayName, passwordHash, createdAt);
    return { id, username, displayName, avatarData: null };
  }

  function updateProfile(userId, { displayName, avatarData }) {
    database.prepare("UPDATE users SET display_name = ?, avatar_data = ? WHERE id = ?")
      .run(displayName, avatarData, userId);
    return database.prepare("SELECT id, username, display_name AS displayName, avatar_data AS avatarData FROM users WHERE id = ?")
      .get(userId) || null;
  }

  function existsById(userId) {
    return Boolean(database.prepare("SELECT id FROM users WHERE id = ?").get(userId));
  }

  return { findCredentialsByUsername, createUser, updateProfile, existsById };
}

export function createPostgresUserProfileRepository(database) {
  async function findCredentialsByUsername(username) {
    const result = await database.query(`
      SELECT id, username, display_name AS "displayName", avatar_data AS "avatarData", password_hash AS "passwordHash"
      FROM users WHERE username = $1
    `, [username]);
    return result.rows[0] || null;
  }

  async function createUser({ id, username, displayName, passwordHash, createdAt }) {
    await database.query("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)", [id, username, displayName, passwordHash, createdAt]);
    return { id, username, displayName, avatarData: null };
  }

  async function updateProfile(userId, { displayName, avatarData }) {
    await database.query("UPDATE users SET display_name = $1, avatar_data = $2 WHERE id = $3", [displayName, avatarData, userId]);
    const result = await database.query('SELECT id, username, display_name AS "displayName", avatar_data AS "avatarData" FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  }

  async function existsById(userId) {
    const result = await database.query("SELECT id FROM users WHERE id = $1", [userId]);
    return result.rowCount > 0;
  }

  return { findCredentialsByUsername, createUser, updateProfile, existsById };
}
