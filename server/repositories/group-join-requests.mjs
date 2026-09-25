import { randomUUID } from "node:crypto";

export function createGroupJoinRequestRepository(database, {
  createId = randomUUID,
  groupSetupRepository,
  ensureGroupPermissionRow,
  compactAvatarData = (value) => value,
} = {}) {
  if (!groupSetupRepository) throw new Error("groupSetupRepository is required");
  if (typeof ensureGroupPermissionRow !== "function") throw new Error("ensureGroupPermissionRow is required");

  function findGroup(groupId) {
    return database.prepare("SELECT id, name, owner_id AS ownerId FROM groups WHERE id = ?").get(groupId) || null;
  }

  function listPending(groupId) {
    return database.prepare(`
      SELECT group_join_requests.id, group_join_requests.status, group_join_requests.created_at AS createdAt,
        group_join_requests.updated_at AS updatedAt, users.id AS userId, users.display_name AS displayName,
        users.username, users.avatar_data AS avatarData
      FROM group_join_requests JOIN users ON users.id = group_join_requests.user_id
      WHERE group_join_requests.group_id = ? AND group_join_requests.status = 'pending'
      ORDER BY group_join_requests.created_at ASC
    `).all(groupId).map((item) => ({ ...item, avatarData: compactAvatarData(item.avatarData) }));
  }

  function findForUser(groupId, userId) {
    return database.prepare("SELECT id, status FROM group_join_requests WHERE group_id = ? AND user_id = ?").get(groupId, userId) || null;
  }

  function reopen(requestId, groupId, createdAt) {
    database.prepare("UPDATE group_join_requests SET status = 'pending', updated_at = ?, decided_at = NULL, decided_by = NULL WHERE id = ? AND group_id = ?").run(createdAt, requestId, groupId);
    return { id: requestId, groupId, status: "pending", createdAt, updatedAt: createdAt };
  }

  function create({ groupId, userId, createdAt = new Date().toISOString(), id = createId() }) {
    const joinRequest = { id, groupId, userId, status: "pending", createdAt, updatedAt: createdAt };
    database.prepare("INSERT INTO group_join_requests (id, group_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)").run(id, groupId, userId, createdAt, createdAt);
    return joinRequest;
  }

  function find(requestId, groupId) {
    return database.prepare("SELECT id, group_id AS groupId, user_id AS userId, status FROM group_join_requests WHERE id = ? AND group_id = ?").get(requestId, groupId) || null;
  }

  function decide({ groupId, requestId, decidedBy, status, groupOwnerId, now = new Date().toISOString(), createNotification }) {
    const joinRequest = find(requestId, groupId);
    if (!joinRequest) return { kind: "not-found" };
    if (joinRequest.status !== "pending") return { kind: "already-answered" };
    try {
      database.exec("BEGIN");
      if (status === "approved") {
        const roleId = groupSetupRepository.ensureDefaultGroupRoles(groupId, groupOwnerId);
        database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, role_id, created_at) VALUES (?, ?, 'member', ?, ?)").run(groupId, joinRequest.userId, roleId, now);
        ensureGroupPermissionRow(groupId, joinRequest.userId);
      }
      database.prepare("UPDATE group_join_requests SET status = ?, updated_at = ?, decided_at = ?, decided_by = ? WHERE id = ?").run(status, now, now, decidedBy, requestId);
      const groupName = findGroup(groupId)?.name || "o grupo";
      createNotification?.({
        userId: joinRequest.userId,
        type: "group_join_decision",
        entityId: requestId,
        groupId,
        title: status === "approved" ? `Entrada aprovada em ${groupName}` : `Solicitação recusada em ${groupName}`,
        body: status === "approved" ? "Agora você já pode acessar este grupo." : "O administrador recusou sua solicitação de entrada.",
        createdAt: now,
      });
      database.exec("COMMIT");
      return { kind: "decided", request: { ...joinRequest, status, updatedAt: now, decidedAt: now, decidedBy } };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { findGroup, listPending, findForUser, reopen, create, find, decide };
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

export function createPostgresGroupJoinRequestRepository(database, {
  createId = randomUUID,
  groupSetupRepository,
  ensureGroupPermissionRow,
  compactAvatarData = (value) => value,
  transactionClient = false,
} = {}) {
  if (!groupSetupRepository) throw new Error("groupSetupRepository is required");
  if (typeof ensureGroupPermissionRow !== "function") throw new Error("ensureGroupPermissionRow is required");

  async function findGroup(groupId, queryDatabase = database) {
    const result = await queryDatabase.query('SELECT id, name, owner_id AS "ownerId" FROM groups WHERE id = $1', [groupId]);
    return result.rows[0] || null;
  }

  async function listPending(groupId) {
    const result = await database.query(`
      SELECT group_join_requests.id, group_join_requests.status, group_join_requests.created_at AS "createdAt",
        group_join_requests.updated_at AS "updatedAt", users.id AS "userId", users.display_name AS "displayName",
        users.username, users.avatar_data AS "avatarData"
      FROM group_join_requests JOIN users ON users.id = group_join_requests.user_id
      WHERE group_join_requests.group_id = $1 AND group_join_requests.status = 'pending'
      ORDER BY group_join_requests.created_at ASC
    `, [groupId]);
    return result.rows.map((item) => ({ ...item, avatarData: compactAvatarData(item.avatarData) }));
  }

  async function findForUser(groupId, userId, queryDatabase = database) {
    const result = await queryDatabase.query("SELECT id, status FROM group_join_requests WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
    return result.rows[0] || null;
  }

  async function reopen(requestId, groupId, createdAt = new Date().toISOString()) {
    await database.query("UPDATE group_join_requests SET status = 'pending', updated_at = $1, decided_at = NULL, decided_by = NULL WHERE id = $2 AND group_id = $3", [createdAt, requestId, groupId]);
    return { id: requestId, groupId, status: "pending", createdAt, updatedAt: createdAt };
  }

  async function create({ groupId, userId, createdAt = new Date().toISOString(), id = createId() }) {
    const joinRequest = { id, groupId, userId, status: "pending", createdAt, updatedAt: createdAt };
    await database.query("INSERT INTO group_join_requests (id, group_id, user_id, status, created_at, updated_at) VALUES ($1, $2, $3, 'pending', $4, $4)", [id, groupId, userId, createdAt]);
    return joinRequest;
  }

  async function find(requestId, groupId, queryDatabase = database) {
    const result = await queryDatabase.query('SELECT id, group_id AS "groupId", user_id AS "userId", status FROM group_join_requests WHERE id = $1 AND group_id = $2', [requestId, groupId]);
    return result.rows[0] || null;
  }

  async function decide({ groupId, requestId, decidedBy, status, groupOwnerId, now = new Date().toISOString(), createNotification }) {
    const joinRequest = await find(requestId, groupId);
    if (!joinRequest) return { kind: "not-found" };
    if (joinRequest.status !== "pending") return { kind: "already-answered" };
    return withPostgresTransaction(database, async (client) => {
      const lockedRequest = await find(requestId, groupId, client);
      if (!lockedRequest || lockedRequest.status !== "pending") return { kind: "already-answered" };
      if (status === "approved") {
        const roleId = await groupSetupRepository.ensureDefaultGroupRoles(groupId, groupOwnerId, client);
        await client.query("INSERT INTO group_members (group_id, user_id, role, role_id, created_at) VALUES ($1, $2, 'member', $3, $4) ON CONFLICT (group_id, user_id) DO NOTHING", [groupId, lockedRequest.userId, roleId, now]);
        await ensureGroupPermissionRow(groupId, lockedRequest.userId, client);
      }
      await client.query("UPDATE group_join_requests SET status = $1, updated_at = $2, decided_at = $2, decided_by = $3 WHERE id = $4", [status, now, decidedBy, requestId]);
      const groupName = (await findGroup(groupId, client))?.name || "o grupo";
      if (createNotification) await createNotification({
        userId: lockedRequest.userId,
        type: "group_join_decision",
        entityId: requestId,
        groupId,
        title: status === "approved" ? `Entrada aprovada em ${groupName}` : `Solicitação recusada em ${groupName}`,
        body: status === "approved" ? "Agora você já pode acessar este grupo." : "O administrador recusou sua solicitação de entrada.",
        createdAt: now,
      });
      return { kind: "decided", request: { ...lockedRequest, status, updatedAt: now, decidedAt: now, decidedBy } };
    }, transactionClient);
  }

  return { findGroup, listPending, findForUser, reopen, create, find, decide };
}
