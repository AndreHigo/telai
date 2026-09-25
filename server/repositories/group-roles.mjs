import { randomUUID } from "node:crypto";

function mapRole(role) {
  if (!role) return null;
  return {
    ...role,
    sortOrder: Number(role.sortOrder || 0),
    canChat: Boolean(role.canChat),
    canStream: Boolean(role.canStream),
    canInvite: Boolean(role.canInvite),
    canViewVoiceMembers: Boolean(role.canViewVoiceMembers),
    canMoveMembers: Boolean(role.canMoveMembers),
    isDefault: Boolean(role.isDefault),
  };
}

export function createGroupRoleRepository(database, { createId = randomUUID } = {}) {
  function listRoles(groupId) {
    return database.prepare(`
      SELECT id, name, color, can_chat AS canChat, can_stream AS canStream,
        can_invite AS canInvite, can_view_voice_members AS canViewVoiceMembers,
        can_move_members AS canMoveMembers, is_default AS isDefault, sort_order AS sortOrder
      FROM group_roles WHERE group_id = ? ORDER BY sort_order ASC, name COLLATE NOCASE
    `).all(groupId).map(mapRole);
  }

  function listRoleIds(groupId) {
    return database.prepare("SELECT id FROM group_roles WHERE group_id = ?").all(groupId).map((role) => role.id);
  }

  function nextSortOrder(groupId) {
    return Number(database.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS sortOrder FROM group_roles WHERE group_id = ?").get(groupId)?.sortOrder || 0);
  }

  function createRole({ groupId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers, createdBy, createdAt = new Date().toISOString(), id = createId(), sortOrder = nextSortOrder(groupId) }) {
    const role = { id, groupId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers, isDefault: false, sortOrder };
    database.prepare(`
      INSERT INTO group_roles (id, group_id, name, color, can_chat, can_stream, can_invite,
        can_view_voice_members, can_move_members, is_default, sort_order, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(id, groupId, name, color, canChat ? 1 : 0, canStream ? 1 : 0, canInvite ? 1 : 0, canViewVoiceMembers ? 1 : 0, canMoveMembers ? 1 : 0, sortOrder, createdBy, createdAt);
    return role;
  }

  function reorderRoles(groupId, roleIds) {
    try {
      database.exec("BEGIN");
      const update = database.prepare("UPDATE group_roles SET sort_order = ? WHERE id = ? AND group_id = ?");
      roleIds.forEach((roleId, index) => update.run(index, roleId, groupId));
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
    return listRoles(groupId);
  }

  function findRole(groupId, roleId) {
    return mapRole(database.prepare(`
      SELECT id, name, color, can_chat AS canChat, can_stream AS canStream,
        can_invite AS canInvite, can_view_voice_members AS canViewVoiceMembers,
        can_move_members AS canMoveMembers, is_default AS isDefault, sort_order AS sortOrder
      FROM group_roles WHERE id = ? AND group_id = ?
    `).get(roleId, groupId));
  }

  function defaultRole(groupId) {
    return database.prepare("SELECT id FROM group_roles WHERE group_id = ? AND is_default = 1 LIMIT 1").get(groupId) || null;
  }

  function deleteRole(groupId, roleId, fallbackRoleId) {
    try {
      database.exec("BEGIN");
      database.prepare("UPDATE group_members SET role_id = ? WHERE group_id = ? AND role_id = ?").run(fallbackRoleId, groupId, roleId);
      const deleted = database.prepare("DELETE FROM group_roles WHERE id = ? AND group_id = ?").run(roleId, groupId).changes > 0;
      database.exec("COMMIT");
      return deleted;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function updateRole({ groupId, roleId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers }) {
    database.prepare(`
      UPDATE group_roles SET name = ?, color = ?, can_chat = ?, can_stream = ?, can_invite = ?,
        can_view_voice_members = ?, can_move_members = ? WHERE id = ? AND group_id = ?
    `).run(name, color, canChat ? 1 : 0, canStream ? 1 : 0, canInvite ? 1 : 0, canViewVoiceMembers ? 1 : 0, canMoveMembers ? 1 : 0, roleId, groupId);
    return { ...findRole(groupId, roleId), name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers };
  }

  function member(groupId, userId) {
    return database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, userId) || null;
  }

  function roleBelongs(groupId, roleId) {
    return Boolean(database.prepare("SELECT 1 FROM group_roles WHERE id = ? AND group_id = ?").get(roleId, groupId));
  }

  function assignMemberRole(groupId, userId, roleId) {
    database.prepare("UPDATE group_members SET role_id = ? WHERE group_id = ? AND user_id = ?").run(roleId || null, groupId, userId);
  }

  return { listRoles, listRoleIds, nextSortOrder, createRole, reorderRoles, findRole, defaultRole, deleteRole, updateRole, member, roleBelongs, assignMemberRole };
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

export function createPostgresGroupRoleRepository(database, { createId = randomUUID, transactionClient = false } = {}) {
  async function listRoles(groupId) {
    const result = await database.query(`
      SELECT id, name, color, can_chat AS "canChat", can_stream AS "canStream",
        can_invite AS "canInvite", can_view_voice_members AS "canViewVoiceMembers",
        can_move_members AS "canMoveMembers", is_default AS "isDefault", sort_order AS "sortOrder"
      FROM group_roles WHERE group_id = $1 ORDER BY sort_order ASC, LOWER(name)
    `, [groupId]);
    return result.rows.map(mapRole);
  }

  async function listRoleIds(groupId) {
    const result = await database.query("SELECT id FROM group_roles WHERE group_id = $1", [groupId]);
    return result.rows.map((role) => role.id);
  }

  async function nextSortOrder(groupId, queryDatabase = database) {
    const result = await queryDatabase.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS \"sortOrder\" FROM group_roles WHERE group_id = $1", [groupId]);
    return Number(result.rows[0]?.sortOrder || 0);
  }

  async function createRole({ groupId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers, createdBy, createdAt = new Date().toISOString(), id = createId(), sortOrder }) {
    const resolvedSortOrder = sortOrder ?? await nextSortOrder(groupId);
    const role = { id, groupId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers, isDefault: false, sortOrder: resolvedSortOrder };
    await database.query(`
      INSERT INTO group_roles (id, group_id, name, color, can_chat, can_stream, can_invite,
        can_view_voice_members, can_move_members, is_default, sort_order, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12)
    `, [id, groupId, name, color, canChat ? 1 : 0, canStream ? 1 : 0, canInvite ? 1 : 0, canViewVoiceMembers ? 1 : 0, canMoveMembers ? 1 : 0, resolvedSortOrder, createdBy, createdAt]);
    return role;
  }

  async function reorderRoles(groupId, roleIds) {
    return withPostgresTransaction(database, async (client) => {
      for (const [index, roleId] of roleIds.entries()) await client.query("UPDATE group_roles SET sort_order = $1 WHERE id = $2 AND group_id = $3", [index, roleId, groupId]);
      const result = await client.query(`
        SELECT id, name, color, can_chat AS "canChat", can_stream AS "canStream", can_invite AS "canInvite",
          can_view_voice_members AS "canViewVoiceMembers", can_move_members AS "canMoveMembers", is_default AS "isDefault", sort_order AS "sortOrder"
        FROM group_roles WHERE group_id = $1 ORDER BY sort_order ASC, LOWER(name)
      `, [groupId]);
      return result.rows.map(mapRole);
    }, transactionClient);
  }

  async function findRole(groupId, roleId, queryDatabase = database) {
    const result = await queryDatabase.query(`
      SELECT id, name, color, can_chat AS "canChat", can_stream AS "canStream", can_invite AS "canInvite",
        can_view_voice_members AS "canViewVoiceMembers", can_move_members AS "canMoveMembers", is_default AS "isDefault", sort_order AS "sortOrder"
      FROM group_roles WHERE id = $1 AND group_id = $2
    `, [roleId, groupId]);
    return mapRole(result.rows[0]);
  }

  async function defaultRole(groupId, queryDatabase = database) {
    const result = await queryDatabase.query("SELECT id FROM group_roles WHERE group_id = $1 AND is_default = 1 LIMIT 1", [groupId]);
    return result.rows[0] || null;
  }

  async function deleteRole(groupId, roleId, fallbackRoleId) {
    return withPostgresTransaction(database, async (client) => {
      await client.query("UPDATE group_members SET role_id = $1 WHERE group_id = $2 AND role_id = $3", [fallbackRoleId, groupId, roleId]);
      const result = await client.query("DELETE FROM group_roles WHERE id = $1 AND group_id = $2", [roleId, groupId]);
      return result.rowCount > 0;
    }, transactionClient);
  }

  async function updateRole({ groupId, roleId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers }) {
    await database.query(`
      UPDATE group_roles SET name = $1, color = $2, can_chat = $3, can_stream = $4, can_invite = $5,
        can_view_voice_members = $6, can_move_members = $7 WHERE id = $8 AND group_id = $9
    `, [name, color, canChat ? 1 : 0, canStream ? 1 : 0, canInvite ? 1 : 0, canViewVoiceMembers ? 1 : 0, canMoveMembers ? 1 : 0, roleId, groupId]);
    return { ...(await findRole(groupId, roleId)), name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers };
  }

  async function member(groupId, userId, queryDatabase = database) {
    const result = await queryDatabase.query("SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
    return result.rows[0] || null;
  }

  async function roleBelongs(groupId, roleId, queryDatabase = database) {
    const result = await queryDatabase.query("SELECT 1 FROM group_roles WHERE id = $1 AND group_id = $2", [roleId, groupId]);
    return result.rowCount > 0;
  }

  async function assignMemberRole(groupId, userId, roleId) {
    await database.query("UPDATE group_members SET role_id = $1 WHERE group_id = $2 AND user_id = $3", [roleId || null, groupId, userId]);
  }

  return { listRoles, listRoleIds, nextSortOrder, createRole, reorderRoles, findRole, defaultRole, deleteRole, updateRole, member, roleBelongs, assignMemberRole };
}
