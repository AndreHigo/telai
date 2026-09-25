import { randomUUID } from "node:crypto";

export function createGroupSetupRepository(database, { createId = randomUUID } = {}) {
  function ensureDefaultGroupRooms(groupId, ownerId) {
    const now = new Date().toISOString();
    database.prepare("INSERT OR IGNORE INTO group_rooms (id, group_id, name, slug, kind, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(createId(), groupId, "Geral", "geral", "text", ownerId, now);
  }

  function migrateLegacyGroupMemberRoles(groupId, ownerId, defaultRoleId) {
    const legacyMembers = database.prepare(`
      SELECT group_members.user_id AS userId,
        group_member_permissions.can_chat AS canChat,
        group_member_permissions.can_stream AS canStream,
        group_member_permissions.can_invite AS canInvite,
        group_member_permissions.can_view_voice_members AS canViewVoiceMembers
      FROM group_members
      LEFT JOIN group_member_permissions
        ON group_member_permissions.group_id = group_members.group_id
        AND group_member_permissions.user_id = group_members.user_id
      WHERE group_members.group_id = ? AND group_members.role = 'member' AND group_members.role_id IS NULL
    `).all(groupId);
    const roleCache = new Map();
    for (const member of legacyMembers) {
      const hasLegacyRow = [member.canChat, member.canStream, member.canInvite, member.canViewVoiceMembers]
        .some((value) => value !== null && value !== undefined);
      const permissions = {
        canChat: hasLegacyRow ? member.canChat !== 0 : true,
        canStream: hasLegacyRow ? member.canStream !== 0 : true,
        canInvite: hasLegacyRow ? member.canInvite !== 0 : true,
        canViewVoiceMembers: hasLegacyRow ? member.canViewVoiceMembers !== 0 : true,
      };
      const isDefault = Object.values(permissions).every(Boolean);
      let roleId = defaultRoleId;
      if (!isDefault) {
        const signature = Object.values(permissions).map((value) => (value ? 1 : 0)).join("");
        roleId = roleCache.get(signature);
        if (!roleId) {
          const existing = database.prepare(`
            SELECT id FROM group_roles
            WHERE group_id = ? AND can_chat = ? AND can_stream = ? AND can_invite = ?
              AND can_view_voice_members = ? AND can_move_members = 0
            LIMIT 1
          `).get(groupId, permissions.canChat ? 1 : 0, permissions.canStream ? 1 : 0, permissions.canInvite ? 1 : 0, permissions.canViewVoiceMembers ? 1 : 0);
          if (existing) roleId = existing.id;
          else {
            const baseName = "Membro migrado";
            let name = baseName;
            let suffix = 2;
            while (database.prepare("SELECT 1 FROM group_roles WHERE group_id = ? AND name = ? LIMIT 1").get(groupId, name)) name = `${baseName} ${suffix++}`;
            roleId = createId();
            database.prepare(`
              INSERT INTO group_roles (id, group_id, name, color, can_chat, can_stream, can_invite,
                can_view_voice_members, can_move_members, is_default, created_by, created_at)
              VALUES (?, ?, ?, '#5865f2', ?, ?, ?, ?, 0, 0, ?, ?)
            `).run(roleId, groupId, name, permissions.canChat ? 1 : 0, permissions.canStream ? 1 : 0, permissions.canInvite ? 1 : 0, permissions.canViewVoiceMembers ? 1 : 0, ownerId, new Date().toISOString());
          }
          roleCache.set(signature, roleId);
        }
      }
      database.prepare("UPDATE group_members SET role_id = ? WHERE group_id = ? AND user_id = ? AND role_id IS NULL").run(roleId, groupId, member.userId);
    }
  }

  function ensureDefaultGroupRoles(groupId, ownerId) {
    let role = database.prepare("SELECT id FROM group_roles WHERE group_id = ? AND is_default = 1 LIMIT 1").get(groupId);
    if (!role) {
      const roleId = createId();
      database.prepare("INSERT INTO group_roles (id, group_id, name, color, is_default, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)")
        .run(roleId, groupId, "Membro", "#5865f2", ownerId, new Date().toISOString());
      role = { id: roleId };
    }
    migrateLegacyGroupMemberRoles(groupId, ownerId, role.id);
    return role.id;
  }

  function ensureGroupRolePositions(groupId) {
    const roles = database.prepare(`
      SELECT id, sort_order AS sortOrder, is_default AS isDefault, name
      FROM group_roles WHERE group_id = ? ORDER BY is_default DESC, name COLLATE NOCASE
    `).all(groupId);
    if (roles.length <= 1 || roles.some((role) => Number(role.sortOrder) !== 0)) return;
    database.exec("BEGIN");
    try {
      const update = database.prepare("UPDATE group_roles SET sort_order = ? WHERE id = ? AND group_id = ?");
      roles.forEach((role, index) => update.run(index, role.id, groupId));
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { ensureDefaultGroupRooms, migrateLegacyGroupMemberRoles, ensureDefaultGroupRoles, ensureGroupRolePositions };
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

export function createPostgresGroupSetupRepository(database, { createId = randomUUID, transactionClient = false } = {}) {
  async function ensureDefaultGroupRooms(groupId, ownerId, queryDatabase = database) {
    await queryDatabase.query(`
      INSERT INTO group_rooms (id, group_id, name, slug, kind, created_by, created_at)
      VALUES ($1, $2, 'Geral', 'geral', 'text', $3, $4)
      ON CONFLICT (group_id, slug) DO NOTHING
    `, [createId(), groupId, ownerId, new Date().toISOString()]);
  }

  async function migrateLegacyGroupMemberRoles(groupId, ownerId, defaultRoleId, queryDatabase = database) {
    const result = await queryDatabase.query(`
      SELECT group_members.user_id AS "userId", group_member_permissions.can_chat AS "canChat",
        group_member_permissions.can_stream AS "canStream", group_member_permissions.can_invite AS "canInvite",
        group_member_permissions.can_view_voice_members AS "canViewVoiceMembers"
      FROM group_members LEFT JOIN group_member_permissions
        ON group_member_permissions.group_id = group_members.group_id AND group_member_permissions.user_id = group_members.user_id
      WHERE group_members.group_id = $1 AND group_members.role = 'member' AND group_members.role_id IS NULL
    `, [groupId]);
    const roleCache = new Map();
    for (const member of result.rows) {
      const hasLegacyRow = [member.canChat, member.canStream, member.canInvite, member.canViewVoiceMembers].some((value) => value !== null && value !== undefined);
      const permissions = {
        canChat: hasLegacyRow ? Number(member.canChat) !== 0 : true,
        canStream: hasLegacyRow ? Number(member.canStream) !== 0 : true,
        canInvite: hasLegacyRow ? Number(member.canInvite) !== 0 : true,
        canViewVoiceMembers: hasLegacyRow ? Number(member.canViewVoiceMembers) !== 0 : true,
      };
      let roleId = defaultRoleId;
      if (!Object.values(permissions).every(Boolean)) {
        const signature = Object.values(permissions).map((value) => (value ? 1 : 0)).join("");
        roleId = roleCache.get(signature);
        if (!roleId) {
          const existingResult = await queryDatabase.query(`
            SELECT id FROM group_roles WHERE group_id = $1 AND can_chat = $2 AND can_stream = $3 AND can_invite = $4
              AND can_view_voice_members = $5 AND can_move_members = 0 LIMIT 1
          `, [groupId, permissions.canChat ? 1 : 0, permissions.canStream ? 1 : 0, permissions.canInvite ? 1 : 0, permissions.canViewVoiceMembers ? 1 : 0]);
          roleId = existingResult.rows[0]?.id;
          if (!roleId) {
            const baseName = "Membro migrado";
            let name = baseName;
            let suffix = 2;
            while ((await queryDatabase.query("SELECT 1 FROM group_roles WHERE group_id = $1 AND name = $2 LIMIT 1", [groupId, name])).rowCount) name = `${baseName} ${suffix++}`;
            roleId = createId();
            await queryDatabase.query(`
              INSERT INTO group_roles (id, group_id, name, color, can_chat, can_stream, can_invite, can_view_voice_members, can_move_members, is_default, created_by, created_at)
              VALUES ($1, $2, $3, '#5865f2', $4, $5, $6, $7, 0, 0, $8, $9)
            `, [roleId, groupId, name, permissions.canChat ? 1 : 0, permissions.canStream ? 1 : 0, permissions.canInvite ? 1 : 0, permissions.canViewVoiceMembers ? 1 : 0, ownerId, new Date().toISOString()]);
          }
          roleCache.set(signature, roleId);
        }
      }
      await queryDatabase.query("UPDATE group_members SET role_id = $1 WHERE group_id = $2 AND user_id = $3 AND role_id IS NULL", [roleId, groupId, member.userId]);
    }
  }

  async function ensureDefaultGroupRoles(groupId, ownerId, queryDatabase = database) {
    let roleResult = await queryDatabase.query("SELECT id FROM group_roles WHERE group_id = $1 AND is_default = 1 LIMIT 1", [groupId]);
    let roleId = roleResult.rows[0]?.id;
    if (!roleId) {
      roleId = createId();
      await queryDatabase.query("INSERT INTO group_roles (id, group_id, name, color, is_default, created_by, created_at) VALUES ($1, $2, 'Membro', '#5865f2', 1, $3, $4)", [roleId, groupId, ownerId, new Date().toISOString()]);
    }
    await migrateLegacyGroupMemberRoles(groupId, ownerId, roleId, queryDatabase);
    return roleId;
  }

  async function ensureGroupRolePositions(groupId) {
    const result = await database.query('SELECT id, sort_order AS "sortOrder", is_default AS "isDefault", name FROM group_roles WHERE group_id = $1 ORDER BY is_default DESC, LOWER(name)', [groupId]);
    if (result.rows.length <= 1 || result.rows.some((role) => Number(role.sortOrder) !== 0)) return;
    await withPostgresTransaction(database, async (client) => {
      for (const [index, role] of result.rows.entries()) await client.query("UPDATE group_roles SET sort_order = $1 WHERE id = $2 AND group_id = $3", [index, role.id, groupId]);
    }, transactionClient);
  }

  return { ensureDefaultGroupRooms, migrateLegacyGroupMemberRoles, ensureDefaultGroupRoles, ensureGroupRolePositions };
}
