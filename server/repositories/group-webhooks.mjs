import { randomUUID } from "node:crypto";

function mapWebhook(row) {
  if (!row) return null;
  return {
    id: row.id,
    groupId: row.groupId,
    roomId: row.roomId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt || null,
  };
}

const SQLITE_SELECT = `
  SELECT id, group_id AS groupId, room_id AS roomId, name,
    created_by AS createdBy, created_at AS createdAt, last_used_at AS lastUsedAt
  FROM group_webhooks
`;

const POSTGRES_SELECT = `
  SELECT id, group_id AS "groupId", room_id AS "roomId", name,
    created_by AS "createdBy", created_at AS "createdAt", last_used_at AS "lastUsedAt"
  FROM group_webhooks
`;

export function createGroupWebhookRepository(database, { createId = randomUUID } = {}) {
  function create({ groupId, roomId, name, tokenHash, createdBy, createdAt = new Date().toISOString(), id = createId() }) {
    database.prepare("INSERT INTO group_webhooks (id, group_id, room_id, name, token_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, groupId, roomId, name, tokenHash, createdBy, createdAt);
    return { id, groupId, roomId, name, createdBy, createdAt, lastUsedAt: null };
  }

  function list(groupId) {
    return database.prepare(`${SQLITE_SELECT} WHERE group_id = ? ORDER BY created_at DESC, id DESC`).all(groupId).map(mapWebhook);
  }

  function find(groupId, webhookId) {
    return mapWebhook(database.prepare(`${SQLITE_SELECT} WHERE group_id = ? AND id = ?`).get(groupId, webhookId));
  }

  function findByTokenHash(tokenHash) {
    return database.prepare(`
      SELECT id, group_id AS groupId, room_id AS roomId, name, token_hash AS tokenHash,
        created_by AS createdBy, created_at AS createdAt, last_used_at AS lastUsedAt
      FROM group_webhooks WHERE token_hash = ?
    `).get(tokenHash) || null;
  }

  function touch(webhookId, lastUsedAt = new Date().toISOString()) {
    database.prepare("UPDATE group_webhooks SET last_used_at = ? WHERE id = ?").run(lastUsedAt, webhookId);
  }

  function remove(groupId, webhookId) {
    return database.prepare("DELETE FROM group_webhooks WHERE group_id = ? AND id = ?").run(groupId, webhookId).changes > 0;
  }

  return { create, list, find, findByTokenHash, touch, remove };
}

export function createPostgresGroupWebhookRepository(database, { createId = randomUUID } = {}) {
  async function create({ groupId, roomId, name, tokenHash, createdBy, createdAt = new Date().toISOString(), id = createId() }) {
    await database.query("INSERT INTO group_webhooks (id, group_id, room_id, name, token_hash, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [id, groupId, roomId, name, tokenHash, createdBy, createdAt]);
    return { id, groupId, roomId, name, createdBy, createdAt, lastUsedAt: null };
  }

  async function list(groupId) {
    return (await database.query(`${POSTGRES_SELECT} WHERE group_id = $1 ORDER BY created_at DESC, id DESC`, [groupId])).rows.map(mapWebhook);
  }

  async function find(groupId, webhookId) {
    return mapWebhook((await database.query(`${POSTGRES_SELECT} WHERE group_id = $1 AND id = $2`, [groupId, webhookId])).rows[0]);
  }

  async function findByTokenHash(tokenHash) {
    return (await database.query(`
      SELECT id, group_id AS "groupId", room_id AS "roomId", name, token_hash AS "tokenHash",
        created_by AS "createdBy", created_at AS "createdAt", last_used_at AS "lastUsedAt"
      FROM group_webhooks WHERE token_hash = $1
    `, [tokenHash])).rows[0] || null;
  }

  async function touch(webhookId, lastUsedAt = new Date().toISOString()) {
    await database.query("UPDATE group_webhooks SET last_used_at = $1 WHERE id = $2", [lastUsedAt, webhookId]);
  }

  async function remove(groupId, webhookId) {
    return (await database.query("DELETE FROM group_webhooks WHERE group_id = $1 AND id = $2", [groupId, webhookId])).rowCount > 0;
  }

  return { create, list, find, findByTokenHash, touch, remove };
}
