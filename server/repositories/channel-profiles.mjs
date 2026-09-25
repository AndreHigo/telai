export function createChannelProfileRepository(database, { compactAvatarData, parseChannelGames } = {}) {
  function channelProfileForUser(userId) {
    const row = database.prepare("SELECT channel_profiles.user_id AS userId, channel_profiles.display_name AS displayName, channel_profiles.avatar_data AS avatarData, channel_profiles.games FROM channel_profiles WHERE channel_profiles.user_id = ?").get(userId);
    if (row) return { userId: row.userId, displayName: row.displayName, avatarData: compactAvatarData(row.avatarData), games: parseChannelGames(row.games) };
    const user = database.prepare("SELECT id AS userId, display_name AS displayName, avatar_data AS avatarData FROM users WHERE id = ?").get(userId);
    return user ? { userId: user.userId, displayName: user.displayName, avatarData: compactAvatarData(user.avatarData), games: [] } : null;
  }

  return { channelProfileForUser };
}
