import { randomUUID } from "node:crypto";

function normalizeDurationMinutes(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return fallback;
  return Math.max(1, Math.min(Math.round(minutes), 43_200));
}

function expiresAtFor(durationMinutes, now) {
  const minutes = normalizeDurationMinutes(durationMinutes);
  return minutes ? new Date(Date.parse(now) + minutes * 60_000).toISOString() : null;
}

export function createGroupModerationRepository(database, { createId = randomUUID } = {}) {
  function active(groupId, userId, kind, now = new Date().toISOString()) {
    const row = database.prepare(`
      SELECT group_id AS groupId, user_id AS userId, kind, reason,
        expires_at AS expiresAt, created_by AS createdBy, created_at AS createdAt
      FROM group_moderation WHERE group_id = ? AND user_id = ? AND kind = ?
    `).get(groupId, userId, kind) || null;
    if (row?.expiresAt && row.expiresAt <= now) {
      database.prepare("DELETE FROM group_moderation WHERE group_id = ? AND user_id = ? AND kind = ?").run(groupId, userId, kind);
      return null;
    }
    return row;
  }

  function isBanned(groupId, userId, now) { return Boolean(active(groupId, userId, "ban", now)); }
  function isMuted(groupId, userId, now) { return Boolean(active(groupId, userId, "mute", now)); }

  function apply({ groupId, actorUserId, userId, action, reason = "", durationMinutes = null, now = new Date().toISOString() }) {
    const expiresAt = expiresAtFor(durationMinutes, now);
    const id = createId();
    try {
      database.exec("BEGIN");
      if (action === "kick" || action === "ban") {
        if (action === "ban") database.prepare(`
          INSERT INTO group_moderation (id, group_id, user_id, kind, reason, expires_at, created_by, created_at)
          VALUES (?, ?, ?, 'ban', ?, ?, ?, ?)
          ON CONFLICT(group_id, user_id, kind) DO UPDATE SET reason = excluded.reason, expires_at = excluded.expires_at, created_by = excluded.created_by, created_at = excluded.created_at
        `).run(id, groupId, userId, reason, expiresAt, actorUserId, now);
        database.prepare("DELETE FROM group_member_permissions WHERE group_id = ? AND user_id = ?").run(groupId, userId);
        database.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, userId);
      } else if (action === "mute") {
        database.prepare(`
          INSERT INTO group_moderation (id, group_id, user_id, kind, reason, expires_at, created_by, created_at)
          VALUES (?, ?, ?, 'mute', ?, ?, ?, ?)
          ON CONFLICT(group_id, user_id, kind) DO UPDATE SET reason = excluded.reason, expires_at = excluded.expires_at, created_by = excluded.created_by, created_at = excluded.created_at
        `).run(id, groupId, userId, reason, expiresAt, actorUserId, now);
      } else if (action === "unmute" || action === "unban") {
        const kind = action === "unmute" ? "mute" : "ban";
        database.prepare("DELETE FROM group_moderation WHERE group_id = ? AND user_id = ? AND kind = ?").run(groupId, userId, kind);
      } else {
        throw new Error("unsupported-moderation-action");
      }
      database.exec("COMMIT");
      return { action, userId, expiresAt };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { active, isBanned, isMuted, apply, expiresAtFor };
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

export function createPostgresGroupModerationRepository(database, { createId = randomUUID, transactionClient = false } = {}) {
  async function active(groupId, userId, kind, now = new Date().toISOString(), queryDatabase = database) {
    const result = await queryDatabase.query(`
      SELECT group_id AS "groupId", user_id AS "userId", kind, reason,
        expires_at AS "expiresAt", created_by AS "createdBy", created_at AS "createdAt"
      FROM group_moderation WHERE group_id = $1 AND user_id = $2 AND kind = $3
    `, [groupId, userId, kind]);
    const row = result.rows[0] || null;
    if (row?.expiresAt && row.expiresAt <= now) {
      await queryDatabase.query("DELETE FROM group_moderation WHERE group_id = $1 AND user_id = $2 AND kind = $3", [groupId, userId, kind]);
      return null;
    }
    return row;
  }

  async function isBanned(groupId, userId, now) { return Boolean(await active(groupId, userId, "ban", now)); }
  async function isMuted(groupId, userId, now) { return Boolean(await active(groupId, userId, "mute", now)); }

  async function apply({ groupId, actorUserId, userId, action, reason = "", durationMinutes = null, now = new Date().toISOString() }) {
    const expiresAt = expiresAtFor(durationMinutes, now);
    return withPostgresTransaction(database, async (client) => {
      const id = createId();
      if (action === "kick" || action === "ban") {
        if (action === "ban") await client.query(`
          INSERT INTO group_moderation (id, group_id, user_id, kind, reason, expires_at, created_by, created_at)
          VALUES ($1, $2, $3, 'ban', $4, $5, $6, $7)
          ON CONFLICT (group_id, user_id, kind) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at, created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at
        `, [id, groupId, userId, reason, expiresAt, actorUserId, now]);
        await client.query("DELETE FROM group_member_permissions WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
        await client.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
      } else if (action === "mute") {
        await client.query(`
          INSERT INTO group_moderation (id, group_id, user_id, kind, reason, expires_at, created_by, created_at)
          VALUES ($1, $2, $3, 'mute', $4, $5, $6, $7)
          ON CONFLICT (group_id, user_id, kind) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at, created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at
        `, [id, groupId, userId, reason, expiresAt, actorUserId, now]);
      } else if (action === "unmute" || action === "unban") {
        await client.query("DELETE FROM group_moderation WHERE group_id = $1 AND user_id = $2 AND kind = $3", [groupId, userId, action === "unmute" ? "mute" : "ban"]);
      } else {
        throw new Error("unsupported-moderation-action");
      }
      return { action, userId, expiresAt };
    }, transactionClient);
  }

  return { active, isBanned, isMuted, apply, expiresAtFor };
}
