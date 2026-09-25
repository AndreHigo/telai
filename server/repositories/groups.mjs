export function createGroupAccessRepository(database) {
  function isGroupMember(userId, groupId) {
    return Boolean(database.prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId));
  }

  function ensureGroupPermissionRow(groupId, userId) {
    database.prepare(`
      INSERT OR IGNORE INTO group_member_permissions (group_id, user_id, can_chat, can_stream, can_invite, can_view_voice_members, updated_at)
      VALUES (?, ?, 1, 1, 1, 1, ?)
    `).run(groupId, userId, new Date().toISOString());
  }

  function groupPermissions(groupId, userId) {
    const member = database.prepare("SELECT role, role_id AS roleId FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId);
    if (!member) return null;
    if (member.role === "owner") return { canChat: true, canStream: true, canInvite: true, canViewVoiceMembers: true, canMoveMembers: true };
    ensureGroupPermissionRow(groupId, userId);
    const permissions = database.prepare(`
      SELECT can_chat AS canChat, can_stream AS canStream, can_invite AS canInvite,
        can_view_voice_members AS canViewVoiceMembers
      FROM group_member_permissions WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId);
    const role = member.roleId
      ? database.prepare(`
        SELECT can_chat AS canChat, can_stream AS canStream, can_invite AS canInvite,
          can_view_voice_members AS canViewVoiceMembers, can_move_members AS canMoveMembers
        FROM group_roles WHERE id = ? AND group_id = ?
      `).get(member.roleId, groupId)
      : null;
    if (role) return {
      canChat: Boolean(role.canChat),
      canStream: Boolean(role.canStream),
      canInvite: Boolean(role.canInvite),
      canViewVoiceMembers: Boolean(role.canViewVoiceMembers),
      canMoveMembers: Boolean(role.canMoveMembers),
    };
    return {
      canChat: Boolean(permissions?.canChat),
      canStream: Boolean(permissions?.canStream),
      canInvite: Boolean(permissions?.canInvite),
      canViewVoiceMembers: Boolean(permissions?.canViewVoiceMembers),
      canMoveMembers: false,
    };
  }

  function canGroupAction(userId, groupId, action) {
    return Boolean(groupPermissions(groupId, userId)?.[action]);
  }

  return { isGroupMember, ensureGroupPermissionRow, groupPermissions, canGroupAction };
}

export function createPostgresGroupAccessRepository(database) {
  async function isGroupMember(userId, groupId) {
    const result = await database.query(
      "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2",
      [groupId, userId],
    );
    return result.rowCount > 0;
  }

  async function ensureGroupPermissionRow(groupId, userId) {
    await database.query(`
      INSERT INTO group_member_permissions (group_id, user_id, can_chat, can_stream, can_invite, can_view_voice_members, updated_at)
      VALUES ($1, $2, 1, 1, 1, 1, $3)
      ON CONFLICT (group_id, user_id) DO NOTHING
    `, [groupId, userId, new Date().toISOString()]);
  }

  async function groupPermissions(groupId, userId) {
    const memberResult = await database.query(
      'SELECT role, role_id AS "roleId" FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
    );
    const member = memberResult.rows[0];
    if (!member) return null;
    if (member.role === "owner") return { canChat: true, canStream: true, canInvite: true, canViewVoiceMembers: true, canMoveMembers: true };

    await ensureGroupPermissionRow(groupId, userId);
    const permissionsResult = await database.query(`
      SELECT can_chat AS "canChat", can_stream AS "canStream", can_invite AS "canInvite",
        can_view_voice_members AS "canViewVoiceMembers"
      FROM group_member_permissions WHERE group_id = $1 AND user_id = $2
    `, [groupId, userId]);
    const permissions = permissionsResult.rows[0];
    const roleResult = member.roleId
      ? await database.query(`
        SELECT can_chat AS "canChat", can_stream AS "canStream", can_invite AS "canInvite",
          can_view_voice_members AS "canViewVoiceMembers", can_move_members AS "canMoveMembers"
        FROM group_roles WHERE id = $1 AND group_id = $2
      `, [member.roleId, groupId])
      : { rows: [] };
    const role = roleResult.rows[0];
    if (role) return {
      canChat: Boolean(role.canChat),
      canStream: Boolean(role.canStream),
      canInvite: Boolean(role.canInvite),
      canViewVoiceMembers: Boolean(role.canViewVoiceMembers),
      canMoveMembers: Boolean(role.canMoveMembers),
    };
    return {
      canChat: Boolean(permissions?.canChat),
      canStream: Boolean(permissions?.canStream),
      canInvite: Boolean(permissions?.canInvite),
      canViewVoiceMembers: Boolean(permissions?.canViewVoiceMembers),
      canMoveMembers: false,
    };
  }

  async function canGroupAction(userId, groupId, action) {
    const permissions = await groupPermissions(groupId, userId);
    return Boolean(permissions?.[action]);
  }

  return { isGroupMember, ensureGroupPermissionRow, groupPermissions, canGroupAction };
}
