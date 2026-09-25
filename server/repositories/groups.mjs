export function createGroupAccessRepository(database, { roomPermissionRepository = null } = {}) {
  function baseRoomPermission(permissions, action) {
    if (action === "canView") return true;
    if (action === "canConnect") return Boolean(permissions.canChat);
    return Boolean(permissions[action]);
  }

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

  function canGroupRoomAction(userId, groupId, roomId, action) {
    const permissions = groupPermissions(groupId, userId);
    if (!permissions) return false;
    if (!roomId || !roomPermissionRepository) return baseRoomPermission(permissions, action);
    const member = database.prepare("SELECT role, role_id AS roleId FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId);
    if (member?.role === "owner") return true;
    const override = member?.roleId ? roomPermissionRepository.find(groupId, roomId, member.roleId) : null;
    if (!override) return baseRoomPermission(permissions, action);
    return Boolean(override[action]);
  }

  return { isGroupMember, ensureGroupPermissionRow, groupPermissions, canGroupAction, canGroupRoomAction };
}

export function createPostgresGroupAccessRepository(database, { roomPermissionRepository = null } = {}) {
  function baseRoomPermission(permissions, action) {
    if (action === "canView") return true;
    if (action === "canConnect") return Boolean(permissions.canChat);
    return Boolean(permissions[action]);
  }

  async function isGroupMember(userId, groupId, queryDatabase = database) {
    const result = await queryDatabase.query(
      "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2",
      [groupId, userId],
    );
    return result.rowCount > 0;
  }

  async function ensureGroupPermissionRow(groupId, userId, queryDatabase = database) {
    await queryDatabase.query(`
      INSERT INTO group_member_permissions (group_id, user_id, can_chat, can_stream, can_invite, can_view_voice_members, updated_at)
      VALUES ($1, $2, 1, 1, 1, 1, $3)
      ON CONFLICT (group_id, user_id) DO NOTHING
    `, [groupId, userId, new Date().toISOString()]);
  }

  async function groupPermissions(groupId, userId, queryDatabase = database) {
    const memberResult = await queryDatabase.query(
      'SELECT role, role_id AS "roleId" FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
    );
    const member = memberResult.rows[0];
    if (!member) return null;
    if (member.role === "owner") return { canChat: true, canStream: true, canInvite: true, canViewVoiceMembers: true, canMoveMembers: true };

    await ensureGroupPermissionRow(groupId, userId, queryDatabase);
    const permissionsResult = await queryDatabase.query(`
      SELECT can_chat AS "canChat", can_stream AS "canStream", can_invite AS "canInvite",
        can_view_voice_members AS "canViewVoiceMembers"
      FROM group_member_permissions WHERE group_id = $1 AND user_id = $2
    `, [groupId, userId]);
    const permissions = permissionsResult.rows[0];
    const roleResult = member.roleId
      ? await queryDatabase.query(`
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

  async function canGroupRoomAction(userId, groupId, roomId, action) {
    const permissions = await groupPermissions(groupId, userId);
    if (!permissions) return false;
    if (!roomId || !roomPermissionRepository) return baseRoomPermission(permissions, action);
    const memberResult = await database.query("SELECT role, role_id AS \"roleId\" FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
    const member = memberResult.rows[0];
    if (member?.role === "owner") return true;
    const override = member?.roleId ? await roomPermissionRepository.find(groupId, roomId, member.roleId) : null;
    if (!override) return baseRoomPermission(permissions, action);
    return Boolean(override[action]);
  }

  return { isGroupMember, ensureGroupPermissionRow, groupPermissions, canGroupAction, canGroupRoomAction };
}

export function createGroupRepository(database, { createId, groupSetupRepository } = {}) {
  if (typeof createId !== "function") throw new Error("createId is required");
  if (!groupSetupRepository) throw new Error("groupSetupRepository is required");

  function listGroups(userId) {
    return database.prepare(`
      SELECT groups.id, groups.name, groups.slug, group_members.role,
        (SELECT COUNT(*) FROM group_members members WHERE members.group_id = groups.id) AS memberCount
      FROM group_members JOIN groups ON groups.id = group_members.group_id
      WHERE group_members.user_id = ? ORDER BY groups.name COLLATE NOCASE
    `).all(userId);
  }

  function searchGroups(userId, query) {
    const like = `%${query}%`;
    return database.prepare(`
      SELECT groups.id, groups.name, groups.slug, groups.owner_id AS ownerId,
        COALESCE(users.display_name, users.username) AS ownerName,
        (SELECT COUNT(*) FROM group_members members WHERE members.group_id = groups.id) AS memberCount,
        CASE WHEN joined.user_id IS NOT NULL THEN 'member'
          WHEN requests.status IS NOT NULL THEN requests.status ELSE 'none' END AS requestStatus
      FROM groups
      JOIN users ON users.id = groups.owner_id
      LEFT JOIN group_members joined ON joined.group_id = groups.id AND joined.user_id = ?
      LEFT JOIN group_join_requests requests ON requests.group_id = groups.id AND requests.user_id = ?
      WHERE (groups.name LIKE ? COLLATE NOCASE OR groups.slug LIKE ? COLLATE NOCASE)
        AND joined.user_id IS NULL
      ORDER BY CASE WHEN groups.name = ? COLLATE NOCASE THEN 0 ELSE 1 END, groups.name COLLATE NOCASE
      LIMIT 30
    `).all(userId, userId, like, like, query);
  }

  function createGroup({ name, slug, ownerId, createdAt = new Date().toISOString() }) {
    const group = { id: createId(), name, slug, role: "owner" };
    try {
      database.exec("BEGIN");
      database.prepare("INSERT INTO groups (id, name, slug, owner_id, created_at) VALUES (?, ?, ?, ?, ?)").run(group.id, name, slug, ownerId, createdAt);
      database.prepare("INSERT INTO group_members (group_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(group.id, ownerId, createdAt);
      groupSetupRepository.ensureDefaultGroupRooms(group.id, ownerId);
      groupSetupRepository.ensureDefaultGroupRoles(group.id, ownerId);
      database.exec("COMMIT");
      return group;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { listGroups, searchGroups, createGroup };
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

export function createPostgresGroupRepository(database, { createId, groupSetupRepository, transactionClient = false } = {}) {
  if (typeof createId !== "function") throw new Error("createId is required");
  if (!groupSetupRepository) throw new Error("groupSetupRepository is required");

  async function listGroups(userId) {
    const result = await database.query(`
      SELECT groups.id, groups.name, groups.slug, group_members.role,
        (SELECT COUNT(*) FROM group_members members WHERE members.group_id = groups.id) AS "memberCount"
      FROM group_members JOIN groups ON groups.id = group_members.group_id
      WHERE group_members.user_id = $1 ORDER BY LOWER(groups.name)
    `, [userId]);
    return result.rows;
  }

  async function searchGroups(userId, query) {
    const like = `%${query}%`;
    const result = await database.query(`
      SELECT groups.id, groups.name, groups.slug, groups.owner_id AS "ownerId",
        COALESCE(users.display_name, users.username) AS "ownerName",
        (SELECT COUNT(*) FROM group_members members WHERE members.group_id = groups.id) AS "memberCount",
        CASE WHEN joined.user_id IS NOT NULL THEN 'member' WHEN requests.status IS NOT NULL THEN requests.status ELSE 'none' END AS "requestStatus"
      FROM groups JOIN users ON users.id = groups.owner_id
      LEFT JOIN group_members joined ON joined.group_id = groups.id AND joined.user_id = $1
      LEFT JOIN group_join_requests requests ON requests.group_id = groups.id AND requests.user_id = $1
      WHERE (groups.name ILIKE $2 OR groups.slug ILIKE $2) AND joined.user_id IS NULL
      ORDER BY CASE WHEN LOWER(groups.name) = LOWER($3) THEN 0 ELSE 1 END, LOWER(groups.name)
      LIMIT 30
    `, [userId, like, query]);
    return result.rows;
  }

  async function createGroup({ name, slug, ownerId, createdAt = new Date().toISOString() }) {
    const group = { id: createId(), name, slug, role: "owner" };
    return withPostgresTransaction(database, async (client) => {
      await client.query("INSERT INTO groups (id, name, slug, owner_id, created_at) VALUES ($1, $2, $3, $4, $5)", [group.id, name, slug, ownerId, createdAt]);
      await client.query("INSERT INTO group_members (group_id, user_id, role, created_at) VALUES ($1, $2, 'owner', $3)", [group.id, ownerId, createdAt]);
      await groupSetupRepository.ensureDefaultGroupRooms(group.id, ownerId);
      await groupSetupRepository.ensureDefaultGroupRoles(group.id, ownerId);
      return group;
    }, transactionClient);
  }

  return { listGroups, searchGroups, createGroup };
}
