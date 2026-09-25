function normalizePermissionRow(row) {
  if (!row) return null;
  return {
    groupId: row.groupId,
    roomId: row.roomId,
    roleId: row.roleId,
    canView: Boolean(row.canView),
    canChat: Boolean(row.canChat),
    canConnect: Boolean(row.canConnect),
    updatedAt: row.updatedAt,
  };
}

export function createGroupRoomPermissionRepository(database) {
  function find(groupId, roomId, roleId) {
    return normalizePermissionRow(database.prepare(`
      SELECT group_id AS groupId, room_id AS roomId, role_id AS roleId,
        can_view AS canView, can_chat AS canChat, can_connect AS canConnect,
        updated_at AS updatedAt
      FROM group_room_permissions
      WHERE group_id = ? AND room_id = ? AND role_id = ?
    `).get(groupId, roomId, roleId));
  }

  function list(groupId, roomId) {
    return database.prepare(`
      SELECT group_id AS groupId, room_id AS roomId, role_id AS roleId,
        can_view AS canView, can_chat AS canChat, can_connect AS canConnect,
        updated_at AS updatedAt
      FROM group_room_permissions WHERE group_id = ? AND room_id = ?
      ORDER BY updated_at DESC
    `).all(groupId, roomId).map(normalizePermissionRow);
  }

  function save({ groupId, roomId, roleId, canView = true, canChat = true, canConnect = true, updatedAt = new Date().toISOString() }) {
    database.prepare(`
      INSERT INTO group_room_permissions (group_id, room_id, role_id, can_view, can_chat, can_connect, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_id, room_id, role_id) DO UPDATE SET
        can_view = excluded.can_view, can_chat = excluded.can_chat,
        can_connect = excluded.can_connect, updated_at = excluded.updated_at
    `).run(groupId, roomId, roleId, canView ? 1 : 0, canChat ? 1 : 0, canConnect ? 1 : 0, updatedAt);
    return find(groupId, roomId, roleId);
  }

  function remove(groupId, roomId, roleId) {
    return database.prepare("DELETE FROM group_room_permissions WHERE group_id = ? AND room_id = ? AND role_id = ?").run(groupId, roomId, roleId).changes > 0;
  }

  function removeForRoom(groupId, roomId) {
    return database.prepare("DELETE FROM group_room_permissions WHERE group_id = ? AND room_id = ?").run(groupId, roomId).changes;
  }

  return { find, list, save, remove, removeForRoom };
}

export function createPostgresGroupRoomPermissionRepository(database) {
  async function find(groupId, roomId, roleId) {
    const result = await database.query(`
      SELECT group_id AS "groupId", room_id AS "roomId", role_id AS "roleId",
        can_view AS "canView", can_chat AS "canChat", can_connect AS "canConnect",
        updated_at AS "updatedAt"
      FROM group_room_permissions
      WHERE group_id = $1 AND room_id = $2 AND role_id = $3
    `, [groupId, roomId, roleId]);
    return normalizePermissionRow(result.rows[0]);
  }

  async function list(groupId, roomId) {
    const result = await database.query(`
      SELECT group_id AS "groupId", room_id AS "roomId", role_id AS "roleId",
        can_view AS "canView", can_chat AS "canChat", can_connect AS "canConnect",
        updated_at AS "updatedAt"
      FROM group_room_permissions WHERE group_id = $1 AND room_id = $2
      ORDER BY updated_at DESC
    `, [groupId, roomId]);
    return result.rows.map(normalizePermissionRow);
  }

  async function save({ groupId, roomId, roleId, canView = true, canChat = true, canConnect = true, updatedAt = new Date().toISOString() }) {
    await database.query(`
      INSERT INTO group_room_permissions (group_id, room_id, role_id, can_view, can_chat, can_connect, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(group_id, room_id, role_id) DO UPDATE SET
        can_view = EXCLUDED.can_view, can_chat = EXCLUDED.can_chat,
        can_connect = EXCLUDED.can_connect, updated_at = EXCLUDED.updated_at
    `, [groupId, roomId, roleId, canView ? 1 : 0, canChat ? 1 : 0, canConnect ? 1 : 0, updatedAt]);
    return find(groupId, roomId, roleId);
  }

  async function remove(groupId, roomId, roleId) {
    const result = await database.query("DELETE FROM group_room_permissions WHERE group_id = $1 AND room_id = $2 AND role_id = $3", [groupId, roomId, roleId]);
    return result.rowCount > 0;
  }

  async function removeForRoom(groupId, roomId) {
    const result = await database.query("DELETE FROM group_room_permissions WHERE group_id = $1 AND room_id = $2", [groupId, roomId]);
    return result.rowCount;
  }

  return { find, list, save, remove, removeForRoom };
}
