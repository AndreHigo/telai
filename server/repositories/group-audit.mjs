import { randomUUID } from "node:crypto";

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function mapAuditEntry(entry) {
  if (!entry) return null;
  return { ...entry, metadata: parseMetadata(entry.metadata) };
}

export function createGroupAuditRepository(database, { createId = randomUUID } = {}) {
  function record({ groupId, actorUserId, action, targetType, targetId = null, metadata = {}, createdAt = new Date().toISOString(), id = createId() }) {
    database.prepare(`
      INSERT INTO group_audit_logs (id, group_id, actor_user_id, action, target_type, target_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, groupId, actorUserId, action, targetType, targetId, JSON.stringify(metadata || {}), createdAt);
    return mapAuditEntry(database.prepare(`
      SELECT logs.id, logs.group_id AS groupId, logs.actor_user_id AS actorUserId,
        logs.action, logs.target_type AS targetType, logs.target_id AS targetId,
        logs.metadata, logs.created_at AS createdAt,
        COALESCE(users.display_name, users.username) AS actorDisplayName,
        users.username AS actorUsername
      FROM group_audit_logs logs JOIN users ON users.id = logs.actor_user_id
      WHERE logs.id = ?
    `).get(id));
  }

  function list(groupId, { limit = 50, before = null } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    const rows = before
      ? database.prepare(`
        SELECT logs.id, logs.group_id AS groupId, logs.actor_user_id AS actorUserId,
          logs.action, logs.target_type AS targetType, logs.target_id AS targetId,
          logs.metadata, logs.created_at AS createdAt,
          COALESCE(users.display_name, users.username) AS actorDisplayName,
          users.username AS actorUsername
        FROM group_audit_logs logs JOIN users ON users.id = logs.actor_user_id
        WHERE logs.group_id = ? AND logs.created_at < ?
        ORDER BY logs.created_at DESC, logs.id DESC LIMIT ?
      `).all(groupId, before, safeLimit + 1)
      : database.prepare(`
        SELECT logs.id, logs.group_id AS groupId, logs.actor_user_id AS actorUserId,
          logs.action, logs.target_type AS targetType, logs.target_id AS targetId,
          logs.metadata, logs.created_at AS createdAt,
          COALESCE(users.display_name, users.username) AS actorDisplayName,
          users.username AS actorUsername
        FROM group_audit_logs logs JOIN users ON users.id = logs.actor_user_id
        WHERE logs.group_id = ?
        ORDER BY logs.created_at DESC, logs.id DESC LIMIT ?
      `).all(groupId, safeLimit + 1);
    const hasMore = rows.length > safeLimit;
    const entries = rows.slice(0, safeLimit).map(mapAuditEntry);
    return { entries, nextBefore: hasMore ? entries.at(-1)?.createdAt || null : null };
  }

  return { record, list };
}

export function createPostgresGroupAuditRepository(database, { createId = randomUUID } = {}) {
  async function record({ groupId, actorUserId, action, targetType, targetId = null, metadata = {}, createdAt = new Date().toISOString(), id = createId() }) {
    await database.query(`
      INSERT INTO group_audit_logs (id, group_id, actor_user_id, action, target_type, target_id, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, groupId, actorUserId, action, targetType, targetId, JSON.stringify(metadata || {}), createdAt]);
    const result = await database.query(`
      SELECT logs.id, logs.group_id AS "groupId", logs.actor_user_id AS "actorUserId",
        logs.action, logs.target_type AS "targetType", logs.target_id AS "targetId",
        logs.metadata, logs.created_at AS "createdAt",
        COALESCE(users.display_name, users.username) AS "actorDisplayName",
        users.username AS "actorUsername"
      FROM group_audit_logs logs JOIN users ON users.id = logs.actor_user_id
      WHERE logs.id = $1
    `, [id]);
    return mapAuditEntry(result.rows[0]);
  }

  async function list(groupId, { limit = 50, before = null } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    const result = await database.query(`
      SELECT logs.id, logs.group_id AS "groupId", logs.actor_user_id AS "actorUserId",
        logs.action, logs.target_type AS "targetType", logs.target_id AS "targetId",
        logs.metadata, logs.created_at AS "createdAt",
        COALESCE(users.display_name, users.username) AS "actorDisplayName",
        users.username AS "actorUsername"
      FROM group_audit_logs logs JOIN users ON users.id = logs.actor_user_id
      WHERE logs.group_id = $1 AND ($2::text IS NULL OR logs.created_at < $2)
      ORDER BY logs.created_at DESC, logs.id DESC LIMIT $3
    `, [groupId, before, safeLimit + 1]);
    const hasMore = result.rows.length > safeLimit;
    const entries = result.rows.slice(0, safeLimit).map(mapAuditEntry);
    return { entries, nextBefore: hasMore ? entries.at(-1)?.createdAt || null : null };
  }

  return { record, list };
}
