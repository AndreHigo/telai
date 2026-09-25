import { randomUUID } from "node:crypto";

export function createGroupInviteRepository(database, {
  createId = randomUUID,
  hashToken = (value) => value,
  groupSetupRepository,
  ensureGroupPermissionRow,
} = {}) {
  if (!groupSetupRepository) throw new Error("groupSetupRepository is required");
  if (typeof ensureGroupPermissionRow !== "function") throw new Error("ensureGroupPermissionRow is required");

  function findMemberInviteTarget(userId) {
    return database.prepare("SELECT id, username, display_name AS displayName, email, avatar_data AS avatarData FROM users WHERE id = ?").get(userId) || null;
  }

  function findGroup(groupId) {
    return database.prepare("SELECT id, name, owner_id AS ownerId FROM groups WHERE id = ?").get(groupId) || null;
  }

  function hasPendingMemberInvite(groupId, invitedUserId, now) {
    return Boolean(database.prepare("SELECT id FROM group_user_invites WHERE group_id = ? AND invited_user_id = ? AND status = 'pending' AND expires_at > ? LIMIT 1").get(groupId, invitedUserId, now));
  }

  function createMemberInvite({ groupId, invitedUserId, invitedBy, expiresAt, createdAt = new Date().toISOString(), id = createId() }) {
    const invite = { id, groupId, invitedUserId, invitedBy, expiresAt, createdAt };
    database.prepare("INSERT INTO group_user_invites (id, group_id, invited_user_id, invited_by, status, expires_at, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)").run(id, groupId, invitedUserId, invitedBy, expiresAt, createdAt);
    return invite;
  }

  function listGroupInvites(groupId) {
    return database.prepare(`
      SELECT group_invites.token_hash AS tokenHash, group_invites.created_at AS createdAt, group_invites.expires_at AS expiresAt,
        group_invites.max_uses AS maxUses, group_invites.uses, users.display_name AS createdBy
      FROM group_invites JOIN users ON users.id = group_invites.created_by
      WHERE group_invites.group_id = ? ORDER BY group_invites.created_at DESC LIMIT 20
    `).all(groupId);
  }

  function createGroupInvite({ token, groupId, createdBy, expiresAt, maxUses, createdAt = new Date().toISOString() }) {
    database.prepare("INSERT INTO group_invites (token_hash, group_id, created_by, expires_at, max_uses, uses, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
      .run(hashToken(token), groupId, createdBy, expiresAt, maxUses, createdAt);
    return { token, expiresAt, maxUses };
  }

  function deleteGroupInvite(groupId, tokenHash) {
    return database.prepare("DELETE FROM group_invites WHERE group_id = ? AND token_hash = ?").run(groupId, tokenHash).changes > 0;
  }

  function expireMemberInvites(userId, now = new Date().toISOString()) {
    database.prepare("UPDATE group_user_invites SET status = 'expired' WHERE invited_user_id = ? AND status = 'pending' AND expires_at <= ?").run(userId, now);
  }

  function listPendingMemberInvites(userId) {
    return database.prepare(`
      SELECT group_user_invites.id, group_user_invites.group_id AS groupId,
        group_user_invites.expires_at AS expiresAt, group_user_invites.created_at AS createdAt,
        groups.name AS groupName, groups.slug AS groupSlug,
        users.display_name AS invitedBy, users.username AS invitedByUsername
      FROM group_user_invites
      JOIN groups ON groups.id = group_user_invites.group_id
      JOIN users ON users.id = group_user_invites.invited_by
      WHERE group_user_invites.invited_user_id = ? AND group_user_invites.status = 'pending'
      ORDER BY group_user_invites.created_at DESC
    `).all(userId);
  }

  function findMemberInvite(inviteId, userId) {
    return database.prepare("SELECT id, group_id AS groupId, expires_at AS expiresAt, status FROM group_user_invites WHERE id = ? AND invited_user_id = ?").get(inviteId, userId) || null;
  }

  function updateMemberInviteStatus(inviteId, status) {
    database.prepare("UPDATE group_user_invites SET status = ? WHERE id = ?").run(status, inviteId);
  }

  function acceptMemberInvite(inviteId, userId, now = new Date().toISOString()) {
    const invite = findMemberInvite(inviteId, userId);
    if (!invite) return { kind: "not-found" };
    if (invite.status !== "pending") return { kind: "already-answered" };
    if (invite.expiresAt <= now) {
      updateMemberInviteStatus(inviteId, "expired");
      return { kind: "expired" };
    }
    try {
      database.exec("BEGIN");
      const ownerId = findGroup(invite.groupId)?.ownerId;
      const roleId = groupSetupRepository.ensureDefaultGroupRoles(invite.groupId, ownerId);
      database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, role_id, created_at) VALUES (?, ?, 'member', ?, ?)").run(invite.groupId, userId, roleId, now);
      ensureGroupPermissionRow(invite.groupId, userId);
      updateMemberInviteStatus(inviteId, "accepted");
      database.exec("COMMIT");
      return { kind: "accepted", groupId: invite.groupId };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function findGroupInvite(token) {
    return database.prepare("SELECT group_id AS groupId, expires_at AS expiresAt, max_uses AS maxUses, uses FROM group_invites WHERE token_hash = ?").get(hashToken(token)) || null;
  }

  function redeemGroupInvite(token, userId, now = new Date().toISOString()) {
    const invite = findGroupInvite(token);
    if (!invite || invite.expiresAt <= now || invite.uses >= invite.maxUses) return { kind: "unavailable" };
    try {
      database.exec("BEGIN");
      const ownerId = findGroup(invite.groupId)?.ownerId;
      const roleId = groupSetupRepository.ensureDefaultGroupRoles(invite.groupId, ownerId);
      const joined = database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, role_id, created_at) VALUES (?, ?, 'member', ?, ?)").run(invite.groupId, userId, roleId, now);
      if (joined.changes) database.prepare("UPDATE group_invites SET uses = uses + 1 WHERE token_hash = ?").run(hashToken(token));
      ensureGroupPermissionRow(invite.groupId, userId);
      database.exec("COMMIT");
      return { kind: "redeemed", groupId: invite.groupId };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return {
    findMemberInviteTarget,
    findGroup,
    hasPendingMemberInvite,
    createMemberInvite,
    listGroupInvites,
    createGroupInvite,
    deleteGroupInvite,
    expireMemberInvites,
    listPendingMemberInvites,
    findMemberInvite,
    updateMemberInviteStatus,
    acceptMemberInvite,
    findGroupInvite,
    redeemGroupInvite,
  };
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

export function createPostgresGroupInviteRepository(database, {
  createId = randomUUID,
  hashToken = (value) => value,
  groupSetupRepository,
  ensureGroupPermissionRow,
  transactionClient = false,
} = {}) {
  if (!groupSetupRepository) throw new Error("groupSetupRepository is required");
  if (typeof ensureGroupPermissionRow !== "function") throw new Error("ensureGroupPermissionRow is required");

  async function findMemberInviteTarget(userId, queryDatabase = database) {
    const result = await queryDatabase.query('SELECT id, username, display_name AS "displayName", email, avatar_data AS "avatarData" FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  }

  async function findGroup(groupId, queryDatabase = database) {
    const result = await queryDatabase.query('SELECT id, name, owner_id AS "ownerId" FROM groups WHERE id = $1', [groupId]);
    return result.rows[0] || null;
  }

  async function hasPendingMemberInvite(groupId, invitedUserId, now, queryDatabase = database) {
    const result = await queryDatabase.query("SELECT id FROM group_user_invites WHERE group_id = $1 AND invited_user_id = $2 AND status = 'pending' AND expires_at > $3 LIMIT 1", [groupId, invitedUserId, now]);
    return result.rowCount > 0;
  }

  async function createMemberInvite({ groupId, invitedUserId, invitedBy, expiresAt, createdAt = new Date().toISOString(), id = createId() }) {
    await database.query("INSERT INTO group_user_invites (id, group_id, invited_user_id, invited_by, status, expires_at, created_at) VALUES ($1, $2, $3, $4, 'pending', $5, $6)", [id, groupId, invitedUserId, invitedBy, expiresAt, createdAt]);
    return { id, groupId, invitedUserId, invitedBy, expiresAt, createdAt };
  }

  async function listGroupInvites(groupId) {
    const result = await database.query(`
      SELECT group_invites.token_hash AS "tokenHash", group_invites.created_at AS "createdAt", group_invites.expires_at AS "expiresAt",
        group_invites.max_uses AS "maxUses", group_invites.uses, users.display_name AS "createdBy"
      FROM group_invites JOIN users ON users.id = group_invites.created_by
      WHERE group_invites.group_id = $1 ORDER BY group_invites.created_at DESC LIMIT 20
    `, [groupId]);
    return result.rows;
  }

  async function createGroupInvite({ token, groupId, createdBy, expiresAt, maxUses, createdAt = new Date().toISOString() }) {
    await database.query("INSERT INTO group_invites (token_hash, group_id, created_by, expires_at, max_uses, uses, created_at) VALUES ($1, $2, $3, $4, $5, 0, $6)", [hashToken(token), groupId, createdBy, expiresAt, maxUses, createdAt]);
    return { token, expiresAt, maxUses };
  }

  async function deleteGroupInvite(groupId, tokenHash) {
    const result = await database.query("DELETE FROM group_invites WHERE group_id = $1 AND token_hash = $2", [groupId, tokenHash]);
    return result.rowCount > 0;
  }

  async function expireMemberInvites(userId, now = new Date().toISOString()) {
    await database.query("UPDATE group_user_invites SET status = 'expired' WHERE invited_user_id = $1 AND status = 'pending' AND expires_at <= $2", [userId, now]);
  }

  async function listPendingMemberInvites(userId) {
    const result = await database.query(`
      SELECT group_user_invites.id, group_user_invites.group_id AS "groupId",
        group_user_invites.expires_at AS "expiresAt", group_user_invites.created_at AS "createdAt",
        groups.name AS "groupName", groups.slug AS "groupSlug",
        users.display_name AS "invitedBy", users.username AS "invitedByUsername"
      FROM group_user_invites JOIN groups ON groups.id = group_user_invites.group_id JOIN users ON users.id = group_user_invites.invited_by
      WHERE group_user_invites.invited_user_id = $1 AND group_user_invites.status = 'pending'
      ORDER BY group_user_invites.created_at DESC
    `, [userId]);
    return result.rows;
  }

  async function findMemberInvite(inviteId, userId, queryDatabase = database) {
    const result = await queryDatabase.query('SELECT id, group_id AS "groupId", expires_at AS "expiresAt", status FROM group_user_invites WHERE id = $1 AND invited_user_id = $2', [inviteId, userId]);
    return result.rows[0] || null;
  }

  async function updateMemberInviteStatus(inviteId, status, queryDatabase = database) {
    await queryDatabase.query("UPDATE group_user_invites SET status = $1 WHERE id = $2", [status, inviteId]);
  }

  async function acceptMemberInvite(inviteId, userId, now = new Date().toISOString()) {
    const invite = await findMemberInvite(inviteId, userId);
    if (!invite) return { kind: "not-found" };
    if (invite.status !== "pending") return { kind: "already-answered" };
    if (invite.expiresAt <= now) {
      await updateMemberInviteStatus(inviteId, "expired");
      return { kind: "expired" };
    }
    return withPostgresTransaction(database, async (client) => {
      const lockedInvite = await findMemberInvite(inviteId, userId, client);
      if (!lockedInvite || lockedInvite.status !== "pending") return { kind: "already-answered" };
      const group = await findGroup(lockedInvite.groupId, client);
      const roleId = await groupSetupRepository.ensureDefaultGroupRoles(lockedInvite.groupId, group?.ownerId);
      await client.query("INSERT INTO group_members (group_id, user_id, role, role_id, created_at) VALUES ($1, $2, 'member', $3, $4) ON CONFLICT (group_id, user_id) DO NOTHING", [lockedInvite.groupId, userId, roleId, now]);
      await ensureGroupPermissionRow(lockedInvite.groupId, userId, client);
      await updateMemberInviteStatus(inviteId, "accepted", client);
      return { kind: "accepted", groupId: lockedInvite.groupId };
    }, transactionClient);
  }

  async function findGroupInvite(token, queryDatabase = database) {
    const result = await queryDatabase.query('SELECT group_id AS "groupId", expires_at AS "expiresAt", max_uses AS "maxUses", uses FROM group_invites WHERE token_hash = $1', [hashToken(token)]);
    return result.rows[0] || null;
  }

  async function redeemGroupInvite(token, userId, now = new Date().toISOString()) {
    const invite = await findGroupInvite(token);
    if (!invite || invite.expiresAt <= now || Number(invite.uses) >= Number(invite.maxUses)) return { kind: "unavailable" };
    return withPostgresTransaction(database, async (client) => {
      const lockedInvite = await findGroupInvite(token, client);
      if (!lockedInvite || lockedInvite.expiresAt <= now || Number(lockedInvite.uses) >= Number(lockedInvite.maxUses)) return { kind: "unavailable" };
      const group = await findGroup(lockedInvite.groupId, client);
      const roleId = await groupSetupRepository.ensureDefaultGroupRoles(lockedInvite.groupId, group?.ownerId);
      const joined = await client.query("INSERT INTO group_members (group_id, user_id, role, role_id, created_at) VALUES ($1, $2, 'member', $3, $4) ON CONFLICT (group_id, user_id) DO NOTHING", [lockedInvite.groupId, userId, roleId, now]);
      if (joined.rowCount) await client.query("UPDATE group_invites SET uses = uses + 1 WHERE token_hash = $1", [hashToken(token)]);
      await ensureGroupPermissionRow(lockedInvite.groupId, userId, client);
      return { kind: "redeemed", groupId: lockedInvite.groupId };
    }, transactionClient);
  }

  return {
    findMemberInviteTarget,
    findGroup,
    hasPendingMemberInvite,
    createMemberInvite,
    listGroupInvites,
    createGroupInvite,
    deleteGroupInvite,
    expireMemberInvites,
    listPendingMemberInvites,
    findMemberInvite,
    updateMemberInviteStatus,
    acceptMemberInvite,
    findGroupInvite,
    redeemGroupInvite,
  };
}
