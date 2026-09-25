export function createGroupPermissionRepository(database) {
  function member(groupId, userId) {
    return database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId) || null;
  }

  function ensure(groupId, userId) {
    database.prepare(`
      INSERT OR IGNORE INTO group_member_permissions (group_id, user_id, can_chat, can_stream, can_invite, can_view_voice_members, updated_at)
      VALUES (?, ?, 1, 1, 1, 1, ?)
    `).run(groupId, userId, new Date().toISOString());
  }

  function current(groupId, userId) {
    return database.prepare("SELECT can_view_voice_members AS canViewVoiceMembers FROM group_member_permissions WHERE group_id = ? AND user_id = ?").get(groupId, userId) || null;
  }

  function update({ groupId, userId, canChat, canStream, canInvite, canViewVoiceMembers, updatedAt = new Date().toISOString() }) {
    database.prepare(`
      UPDATE group_member_permissions SET can_chat = ?, can_stream = ?, can_invite = ?, can_view_voice_members = ?, updated_at = ?
      WHERE group_id = ? AND user_id = ?
    `).run(canChat ? 1 : 0, canStream ? 1 : 0, canInvite ? 1 : 0, canViewVoiceMembers ? 1 : 0, updatedAt, groupId, userId);
    return { userId, canChat: Boolean(canChat), canStream: Boolean(canStream), canInvite: Boolean(canInvite), canViewVoiceMembers: Boolean(canViewVoiceMembers) };
  }

  return { member, ensure, current, update };
}

export function createPostgresGroupPermissionRepository(database) {
  async function member(groupId, userId) {
    const result = await database.query("SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
    return result.rows[0] || null;
  }

  async function ensure(groupId, userId, queryDatabase = database) {
    await queryDatabase.query(`
      INSERT INTO group_member_permissions (group_id, user_id, can_chat, can_stream, can_invite, can_view_voice_members, updated_at)
      VALUES ($1, $2, 1, 1, 1, 1, $3) ON CONFLICT (group_id, user_id) DO NOTHING
    `, [groupId, userId, new Date().toISOString()]);
  }

  async function current(groupId, userId) {
    const result = await database.query('SELECT can_view_voice_members AS "canViewVoiceMembers" FROM group_member_permissions WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    return result.rows[0] || null;
  }

  async function update({ groupId, userId, canChat, canStream, canInvite, canViewVoiceMembers, updatedAt = new Date().toISOString() }) {
    await database.query(`
      UPDATE group_member_permissions SET can_chat = $1, can_stream = $2, can_invite = $3, can_view_voice_members = $4, updated_at = $5
      WHERE group_id = $6 AND user_id = $7
    `, [canChat ? 1 : 0, canStream ? 1 : 0, canInvite ? 1 : 0, canViewVoiceMembers ? 1 : 0, updatedAt, groupId, userId]);
    return { userId, canChat: Boolean(canChat), canStream: Boolean(canStream), canInvite: Boolean(canInvite), canViewVoiceMembers: Boolean(canViewVoiceMembers) };
  }

  return { member, ensure, current, update };
}
