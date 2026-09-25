import { randomUUID } from "node:crypto";

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function publicInteraction(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.applicationId,
    groupId: row.groupId,
    roomId: row.roomId || null,
    userId: row.userId,
    user: row.username ? { id: row.userId, username: row.username, displayName: row.displayName } : null,
    commandId: row.commandId || null,
    parentInteractionId: row.parentInteractionId || null,
    kind: row.kind,
    commandName: row.commandName || null,
    customId: row.customId || null,
    payload: parseJson(row.payloadJson, {}),
    status: row.status,
    response: row.responseJson ? parseJson(row.responseJson, null) : null,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    claimedAt: row.claimedAt || null,
    respondedAt: row.respondedAt || null,
  };
}

function commandRow(row) {
  if (!row) return null;
  return {
    id: row.commandId,
    applicationId: row.applicationId,
    name: row.commandName,
    description: row.commandDescription,
    options: parseJson(row.commandOptionsJson, []),
  };
}

const interactionSelect = `
  SELECT application_interactions.id,
    application_interactions.application_id AS applicationId,
    application_interactions.group_id AS groupId,
    application_interactions.room_id AS roomId,
    application_interactions.user_id AS userId,
    users.username, users.display_name AS displayName,
    application_interactions.command_id AS commandId,
    application_interactions.parent_interaction_id AS parentInteractionId,
    application_interactions.kind, application_interactions.command_name AS commandName,
    application_interactions.custom_id AS customId,
    application_interactions.payload_json AS payloadJson,
    application_interactions.status,
    application_interactions.response_json AS responseJson,
    application_interactions.created_at AS createdAt,
    application_interactions.expires_at AS expiresAt,
    application_interactions.claimed_at AS claimedAt,
    application_interactions.responded_at AS respondedAt
  FROM application_interactions
  JOIN users ON users.id = application_interactions.user_id
`;

const postgresInteractionSelect = `
  SELECT application_interactions.id,
    application_interactions.application_id AS "applicationId",
    application_interactions.group_id AS "groupId",
    application_interactions.room_id AS "roomId",
    application_interactions.user_id AS "userId",
    users.username, users.display_name AS "displayName",
    application_interactions.command_id AS "commandId",
    application_interactions.parent_interaction_id AS "parentInteractionId",
    application_interactions.kind, application_interactions.command_name AS "commandName",
    application_interactions.custom_id AS "customId",
    application_interactions.payload_json AS "payloadJson",
    application_interactions.status,
    application_interactions.response_json AS "responseJson",
    application_interactions.created_at AS "createdAt",
    application_interactions.expires_at AS "expiresAt",
    application_interactions.claimed_at AS "claimedAt",
    application_interactions.responded_at AS "respondedAt"
  FROM application_interactions
  JOIN users ON users.id = application_interactions.user_id
`;

export function createApplicationInteractionRepository(database, { createId = randomUUID } = {}) {
  function findById(id) {
    return publicInteraction(database.prepare(`${interactionSelect} WHERE application_interactions.id = ?`).get(id));
  }

  function findForUser(id, userId) {
    return publicInteraction(database.prepare(`${interactionSelect} WHERE application_interactions.id = ? AND application_interactions.user_id = ?`).get(id, userId));
  }

  function createInteraction({ applicationId, groupId, roomId = null, userId, commandId = null, parentInteractionId = null, kind, commandName = null, customId = null, payload = {}, createdAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 5 * 60_000).toISOString() }) {
    const id = createId();
    database.prepare(`
      INSERT INTO application_interactions (id, application_id, group_id, room_id, user_id, command_id, parent_interaction_id, kind, command_name, custom_id, payload_json, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, applicationId, groupId, roomId, userId, commandId, parentInteractionId, kind, commandName, customId, JSON.stringify(payload), createdAt, expiresAt);
    return findById(id);
  }

  function claimPending(applicationId, limit = 25, claimedAt = new Date().toISOString()) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 25));
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("UPDATE application_interactions SET status = 'expired' WHERE application_id = ? AND status IN ('pending', 'claimed') AND expires_at <= ?").run(applicationId, claimedAt);
      const rows = database.prepare("SELECT id FROM application_interactions WHERE application_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at ASC LIMIT ?").all(applicationId, claimedAt, safeLimit);
      for (const row of rows) database.prepare("UPDATE application_interactions SET status = 'claimed', claimed_at = ? WHERE id = ? AND status = 'pending'").run(claimedAt, row.id);
      const result = rows.map((row) => findById(row.id));
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function respond(applicationId, interactionId, response, respondedAt = new Date().toISOString()) {
    const result = database.prepare("UPDATE application_interactions SET status = 'responded', response_json = ?, responded_at = ? WHERE application_id = ? AND id = ? AND status = 'claimed' AND expires_at > ?")
      .run(JSON.stringify(response), respondedAt, applicationId, interactionId, respondedAt);
    return result.changes ? findById(interactionId) : null;
  }

  function expire(interactionId, userId, now = new Date().toISOString()) {
    const result = database.prepare("UPDATE application_interactions SET status = 'expired' WHERE id = ? AND user_id = ? AND status IN ('pending', 'claimed') AND expires_at <= ?").run(interactionId, userId, now);
    return result.changes > 0;
  }

  return { findById, findForUser, createInteraction, claimPending, respond, expire };
}

async function withPostgresTransaction(database, callback) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createPostgresApplicationInteractionRepository(database, { createId = randomUUID } = {}) {
  async function findById(id, client = database) {
    const result = await client.query(`${postgresInteractionSelect} WHERE application_interactions.id = $1`, [id]);
    return publicInteraction(result.rows[0]);
  }

  async function findForUser(id, userId) {
    const result = await database.query(`${postgresInteractionSelect} WHERE application_interactions.id = $1 AND application_interactions.user_id = $2`, [id, userId]);
    return publicInteraction(result.rows[0]);
  }

  async function createInteraction({ applicationId, groupId, roomId = null, userId, commandId = null, parentInteractionId = null, kind, commandName = null, customId = null, payload = {}, createdAt = new Date().toISOString(), expiresAt = new Date(Date.now() + 5 * 60_000).toISOString() }) {
    const id = createId();
    await database.query("INSERT INTO application_interactions (id, application_id, group_id, room_id, user_id, command_id, parent_interaction_id, kind, command_name, custom_id, payload_json, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)", [id, applicationId, groupId, roomId, userId, commandId, parentInteractionId, kind, commandName, customId, JSON.stringify(payload), createdAt, expiresAt]);
    return findById(id);
  }

  async function claimPending(applicationId, limit = 25, claimedAt = new Date().toISOString()) {
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 25));
    return withPostgresTransaction(database, async (client) => {
      await client.query("UPDATE application_interactions SET status = 'expired' WHERE application_id = $1 AND status IN ('pending', 'claimed') AND expires_at <= $2", [applicationId, claimedAt]);
      const pending = await client.query("SELECT id FROM application_interactions WHERE application_id = $1 AND status = 'pending' AND expires_at > $2 ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT $3", [applicationId, claimedAt, safeLimit]);
      const claimed = [];
      for (const row of pending.rows) {
        await client.query("UPDATE application_interactions SET status = 'claimed', claimed_at = $1 WHERE id = $2", [claimedAt, row.id]);
        claimed.push(await findById(row.id, client));
      }
      return claimed;
    });
  }

  async function respond(applicationId, interactionId, response, respondedAt = new Date().toISOString()) {
    const result = await database.query("UPDATE application_interactions SET status = 'responded', response_json = $1, responded_at = $2 WHERE application_id = $3 AND id = $4 AND status = 'claimed' AND expires_at > $2", [JSON.stringify(response), respondedAt, applicationId, interactionId]);
    return result.rowCount ? findById(interactionId) : null;
  }

  async function expire(interactionId, userId, now = new Date().toISOString()) {
    const result = await database.query("UPDATE application_interactions SET status = 'expired' WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'claimed') AND expires_at <= $3", [interactionId, userId, now]);
    return result.rowCount > 0;
  }

  return { findById, findForUser, createInteraction, claimPending, respond, expire };
}

export { commandRow };
