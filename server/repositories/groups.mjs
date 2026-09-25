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
