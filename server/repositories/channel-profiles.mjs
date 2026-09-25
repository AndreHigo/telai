export function createChannelProfileRepository(database, { compactAvatarData, parseChannelGames } = {}) {
  function channelProfileForUser(userId) {
    const row = database.prepare("SELECT channel_profiles.user_id AS userId, channel_profiles.display_name AS displayName, channel_profiles.avatar_data AS avatarData, channel_profiles.games FROM channel_profiles WHERE channel_profiles.user_id = ?").get(userId);
    if (row) return { userId: row.userId, displayName: row.displayName, avatarData: compactAvatarData(row.avatarData), games: parseChannelGames(row.games) };
    const user = database.prepare("SELECT id AS userId, display_name AS displayName, avatar_data AS avatarData FROM users WHERE id = ?").get(userId);
    return user ? { userId: user.userId, displayName: user.displayName, avatarData: compactAvatarData(user.avatarData), games: [] } : null;
  }

  function saveChannelProfile(userId, { displayName, avatarData = null, games = [], updatedAt = new Date().toISOString() }) {
    database.prepare(`
      INSERT INTO channel_profiles (user_id, display_name, avatar_data, games, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, avatar_data = excluded.avatar_data, games = excluded.games, updated_at = excluded.updated_at
    `).run(userId, displayName, avatarData, JSON.stringify(games), updatedAt);
    return channelProfileForUser(userId);
  }

  function listDirectory() {
    return database.prepare(`
      SELECT users.id, users.username,
        COALESCE(channel_profiles.display_name, users.display_name) AS channelName,
        COALESCE(channel_profiles.avatar_data, users.avatar_data) AS channelAvatarData,
        channel_profiles.games AS channelGames
      FROM users LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id
    `).all().map((item) => ({
      ...item,
      channelAvatarData: compactAvatarData(item.channelAvatarData),
      channelGames: parseChannelGames(item.channelGames),
    }));
  }

  return { channelProfileForUser, saveChannelProfile, listDirectory };
}

export function createPostgresChannelProfileRepository(database, { compactAvatarData = (value) => value, parseChannelGames = (value) => JSON.parse(value || "[]") } = {}) {
  async function channelProfileForUser(userId) {
    const profileResult = await database.query(`
      SELECT channel_profiles.user_id AS "userId", channel_profiles.display_name AS "displayName",
        channel_profiles.avatar_data AS "avatarData", channel_profiles.games
      FROM channel_profiles WHERE channel_profiles.user_id = $1
    `, [userId]);
    const row = profileResult.rows[0];
    if (row) return { userId: row.userId, displayName: row.displayName, avatarData: compactAvatarData(row.avatarData), games: parseChannelGames(row.games) };
    const userResult = await database.query(
      'SELECT id AS "userId", display_name AS "displayName", avatar_data AS "avatarData" FROM users WHERE id = $1',
      [userId],
    );
    const user = userResult.rows[0];
    return user ? { userId: user.userId, displayName: user.displayName, avatarData: compactAvatarData(user.avatarData), games: [] } : null;
  }

  async function saveChannelProfile(userId, { displayName, avatarData = null, games = [], updatedAt = new Date().toISOString() }) {
    await database.query(`
      INSERT INTO channel_profiles (user_id, display_name, avatar_data, games, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(user_id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_data = EXCLUDED.avatar_data, games = EXCLUDED.games, updated_at = EXCLUDED.updated_at
    `, [userId, displayName, avatarData, JSON.stringify(games), updatedAt]);
    return channelProfileForUser(userId);
  }

  async function listDirectory() {
    const result = await database.query(`
      SELECT users.id, users.username,
        COALESCE(channel_profiles.display_name, users.display_name) AS "channelName",
        COALESCE(channel_profiles.avatar_data, users.avatar_data) AS "channelAvatarData",
        channel_profiles.games AS "channelGames"
      FROM users LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id
    `);
    return result.rows.map((item) => ({
      ...item,
      channelAvatarData: compactAvatarData(item.channelAvatarData),
      channelGames: parseChannelGames(item.channelGames),
    }));
  }

  return { channelProfileForUser, saveChannelProfile, listDirectory };
}
