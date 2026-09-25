function mapMember(member, compactAvatarData = (value) => value) {
  return {
    ...member,
    avatarData: compactAvatarData(member.avatarData),
    roleName: member.role === "owner" ? "Dono" : member.roleName || "Membro",
    roleColor: member.roleColor || "#5865f2",
    roleSortOrder: member.roleSortOrder === null || member.roleSortOrder === undefined ? null : Number(member.roleSortOrder),
    canMoveMembers: member.role === "owner" || Boolean(member.canMoveMembers),
    canModerateMembers: member.role === "owner" || Boolean(member.canModerateMembers),
    canChat: member.role === "owner" || Boolean(member.canChat),
    canStream: member.role === "owner" || Boolean(member.canStream),
    canInvite: member.role === "owner" || Boolean(member.canInvite),
    canViewVoiceMembers: member.role === "owner" || Boolean(member.canViewVoiceMembers),
  };
}

export function createGroupMemberRepository(database, { compactAvatarData = (value) => value } = {}) {
  function find(groupId, userId) {
    return database.prepare(`
      SELECT group_members.role, group_members.role_id AS roleId, group_roles.sort_order AS roleSortOrder
      FROM group_members
      LEFT JOIN group_roles ON group_roles.id = group_members.role_id AND group_roles.group_id = group_members.group_id
      WHERE group_members.group_id = ? AND group_members.user_id = ?
    `).get(groupId, userId) || null;
  }

  function listMembers(groupId) {
    return database.prepare(`
      SELECT users.id, users.display_name AS displayName, users.username, group_members.role,
        group_members.role_id AS roleId, group_roles.name AS roleName, group_roles.color AS roleColor,
        group_roles.sort_order AS roleSortOrder,
        COALESCE(group_roles.can_chat, group_member_permissions.can_chat, 1) AS canChat,
        COALESCE(group_roles.can_stream, group_member_permissions.can_stream, 1) AS canStream,
        COALESCE(group_roles.can_invite, group_member_permissions.can_invite, 1) AS canInvite,
        COALESCE(group_roles.can_view_voice_members, group_member_permissions.can_view_voice_members, 1) AS canViewVoiceMembers,
        COALESCE(group_roles.can_move_members, 0) AS canMoveMembers,
        COALESCE(group_roles.can_moderate_members, 0) AS canModerateMembers, users.avatar_data AS avatarData
      FROM group_members JOIN users ON users.id = group_members.user_id
      LEFT JOIN group_roles ON group_roles.id = group_members.role_id AND group_roles.group_id = group_members.group_id
      LEFT JOIN group_member_permissions ON group_member_permissions.group_id = group_members.group_id AND group_member_permissions.user_id = group_members.user_id
      WHERE group_members.group_id = ?
      ORDER BY CASE WHEN group_members.role = 'owner' THEN 0 ELSE 1 END, COALESCE(group_roles.sort_order, 2147483647), users.display_name COLLATE NOCASE
    `).all(groupId).map((member) => mapMember(member, compactAvatarData));
  }

  function listMemberIds(groupId) {
    return database.prepare("SELECT user_id AS userId FROM group_members WHERE group_id = ? ORDER BY user_id").all(groupId).map(({ userId }) => userId);
  }

  function leaveGroup(groupId, userId) {
    try {
      database.exec("BEGIN");
      database.prepare("DELETE FROM group_member_permissions WHERE group_id = ? AND user_id = ?").run(groupId, userId);
      const result = database.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, userId);
      database.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { find, listMembers, listMemberIds, leaveGroup };
}

async function withPostgresTransaction(database, callback, useProvidedClient = false) {
  const client = useProvidedClient ? database : (typeof database.connect === "function" ? await database.connect() : database);
  const ownsClient = client !== database;
  try {
    if (!useProvidedClient) await client.query("BEGIN");
    const result = await callback(client);
    if (!useProvidedClient) await client.query("COMMIT");
    return result;
  } catch (error) {
    if (!useProvidedClient) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

export function createPostgresGroupMemberRepository(database, { compactAvatarData = (value) => value, transactionClient = false } = {}) {
  async function find(groupId, userId) {
    const result = await database.query(`
      SELECT group_members.role, group_members.role_id AS "roleId", group_roles.sort_order AS "roleSortOrder"
      FROM group_members
      LEFT JOIN group_roles ON group_roles.id = group_members.role_id AND group_roles.group_id = group_members.group_id
      WHERE group_members.group_id = $1 AND group_members.user_id = $2
    `, [groupId, userId]);
    return result.rows[0] || null;
  }

  async function listMembers(groupId) {
    const result = await database.query(`
      SELECT users.id, users.display_name AS "displayName", users.username, group_members.role,
        group_members.role_id AS "roleId", group_roles.name AS "roleName", group_roles.color AS "roleColor",
        group_roles.sort_order AS "roleSortOrder",
        COALESCE(group_roles.can_chat, group_member_permissions.can_chat, 1) AS "canChat",
        COALESCE(group_roles.can_stream, group_member_permissions.can_stream, 1) AS "canStream",
        COALESCE(group_roles.can_invite, group_member_permissions.can_invite, 1) AS "canInvite",
        COALESCE(group_roles.can_view_voice_members, group_member_permissions.can_view_voice_members, 1) AS "canViewVoiceMembers",
        COALESCE(group_roles.can_move_members, 0) AS "canMoveMembers",
        COALESCE(group_roles.can_moderate_members, 0) AS "canModerateMembers", users.avatar_data AS "avatarData"
      FROM group_members JOIN users ON users.id = group_members.user_id
      LEFT JOIN group_roles ON group_roles.id = group_members.role_id AND group_roles.group_id = group_members.group_id
      LEFT JOIN group_member_permissions ON group_member_permissions.group_id = group_members.group_id AND group_member_permissions.user_id = group_members.user_id
      WHERE group_members.group_id = $1
      ORDER BY CASE WHEN group_members.role = 'owner' THEN 0 ELSE 1 END, COALESCE(group_roles.sort_order, 2147483647), LOWER(users.display_name)
    `, [groupId]);
    return result.rows.map((member) => mapMember(member, compactAvatarData));
  }

  async function listMemberIds(groupId) {
    const result = await database.query("SELECT user_id AS \"userId\" FROM group_members WHERE group_id = $1 ORDER BY user_id", [groupId]);
    return result.rows.map(({ userId }) => userId);
  }

  async function leaveGroup(groupId, userId) {
    return withPostgresTransaction(database, async (client) => {
      await client.query("DELETE FROM group_member_permissions WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
      const result = await client.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
      return result.rowCount > 0;
    }, transactionClient);
  }

  return { find, listMembers, listMemberIds, leaveGroup };
}
