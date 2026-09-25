import { randomUUID } from "node:crypto";

export function createGroupMessageRepository(database, { createId = randomUUID } = {}) {
  function listMessages(groupId) {
    return database.prepare(`
      WITH ranked_messages AS (
        SELECT group_messages.id, group_messages.room_id AS roomId, group_messages.user_id AS userId, group_messages.body, group_messages.created_at AS createdAt,
          users.display_name AS displayName, users.username,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(group_messages.room_id, '__general__') ORDER BY group_messages.created_at DESC) AS messageRank
        FROM group_messages JOIN users ON users.id = group_messages.user_id
        WHERE group_messages.group_id = ?
      )
      SELECT id, roomId, userId, body, createdAt, displayName, username
      FROM ranked_messages WHERE messageRank <= 80 ORDER BY createdAt ASC
    `).all(groupId);
  }

  function findTextRoom(groupId, roomId) {
    if (!roomId) return null;
    return database.prepare("SELECT id, kind FROM group_rooms WHERE id = ? AND group_id = ?").get(roomId, groupId) || null;
  }

  function createMessage({ groupId, roomId = null, userId, body, displayName, username, createdAt = new Date().toISOString() }) {
    const message = { id: createId(), groupId, roomId, userId, body, displayName, username, createdAt };
    database.prepare("INSERT INTO group_messages (id, group_id, room_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(message.id, groupId, roomId, userId, body, createdAt);
    return message;
  }

  return { listMessages, findTextRoom, createMessage };
}

export function createPostgresGroupMessageRepository(database, { createId = randomUUID } = {}) {
  async function listMessages(groupId) {
    const result = await database.query(`
      WITH ranked_messages AS (
        SELECT group_messages.id, group_messages.room_id AS "roomId", group_messages.user_id AS "userId", group_messages.body, group_messages.created_at AS "createdAt",
          users.display_name AS "displayName", users.username,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(group_messages.room_id, '__general__') ORDER BY group_messages.created_at DESC) AS "messageRank"
        FROM group_messages JOIN users ON users.id = group_messages.user_id
        WHERE group_messages.group_id = $1
      )
      SELECT id, "roomId", "userId", body, "createdAt", "displayName", username
      FROM ranked_messages WHERE "messageRank" <= 80 ORDER BY "createdAt" ASC
    `, [groupId]);
    return result.rows;
  }

  async function findTextRoom(groupId, roomId) {
    if (!roomId) return null;
    const result = await database.query('SELECT id, kind FROM group_rooms WHERE id = $1 AND group_id = $2', [roomId, groupId]);
    return result.rows[0] || null;
  }

  async function createMessage({ groupId, roomId = null, userId, body, displayName, username, createdAt = new Date().toISOString() }) {
    const message = { id: createId(), groupId, roomId, userId, body, displayName, username, createdAt };
    await database.query("INSERT INTO group_messages (id, group_id, room_id, user_id, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [message.id, groupId, roomId, userId, body, createdAt]);
    return message;
  }

  return { listMessages, findTextRoom, createMessage };
}
