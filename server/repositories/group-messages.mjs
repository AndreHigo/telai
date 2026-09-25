import { randomUUID } from "node:crypto";

export function createGroupMessageRepository(database, { createId = randomUUID } = {}) {
  function listMessages(groupId) {
    return database.prepare(`
      WITH ranked_messages AS (
        SELECT group_messages.id, group_messages.room_id AS roomId, group_messages.user_id AS userId, group_messages.parent_message_id AS parentMessageId, group_messages.body, group_messages.created_at AS createdAt, group_messages.edited_at AS editedAt,
          (SELECT COUNT(*) FROM group_messages replies WHERE replies.parent_message_id = group_messages.id) AS threadCount,
          COALESCE(group_messages.author_display_name, users.display_name) AS displayName,
          COALESCE(group_messages.author_username, users.username) AS username,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(group_messages.room_id, '__general__') ORDER BY group_messages.created_at DESC) AS messageRank
        FROM group_messages JOIN users ON users.id = group_messages.user_id
        WHERE group_messages.group_id = ? AND group_messages.parent_message_id IS NULL
      )
      SELECT id, roomId, userId, parentMessageId, body, createdAt, editedAt, threadCount, displayName, username
      FROM ranked_messages WHERE messageRank <= 80 ORDER BY createdAt ASC
    `).all(groupId).map((message) => ({ ...message, threadCount: Number(message.threadCount || 0) }));
  }

  function findTextRoom(groupId, roomId) {
    if (!roomId) return null;
    return database.prepare("SELECT id, kind FROM group_rooms WHERE id = ? AND group_id = ?").get(roomId, groupId) || null;
  }

  function searchMessages({ groupId, query, roomId = null, limit = 50 }) {
    const normalizedQuery = String(query || "").trim().slice(0, 80);
    if (normalizedQuery.length < 2) return [];
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 50));
    return database.prepare(`
      SELECT group_messages.id, group_messages.group_id AS groupId, group_messages.room_id AS roomId,
        group_messages.user_id AS userId, group_messages.parent_message_id AS parentMessageId, group_messages.body, group_messages.created_at AS createdAt,
        group_messages.edited_at AS editedAt,
        COALESCE(group_messages.author_display_name, users.display_name) AS displayName,
        COALESCE(group_messages.author_username, users.username) AS username
      FROM group_messages JOIN users ON users.id = group_messages.user_id
      WHERE group_messages.group_id = ? AND INSTR(LOWER(group_messages.body), LOWER(?)) > 0
        AND (? IS NULL OR group_messages.room_id = ?)
      ORDER BY group_messages.created_at DESC LIMIT ?
    `).all(groupId, normalizedQuery, roomId, roomId, safeLimit);
  }

  function listThread(groupId, parentMessageId) {
    return database.prepare(`
      SELECT group_messages.id, group_messages.group_id AS groupId, group_messages.room_id AS roomId,
        group_messages.user_id AS userId, group_messages.parent_message_id AS parentMessageId,
        group_messages.body, group_messages.created_at AS createdAt, group_messages.edited_at AS editedAt,
        COALESCE(group_messages.author_display_name, users.display_name) AS displayName,
        COALESCE(group_messages.author_username, users.username) AS username
      FROM group_messages JOIN users ON users.id = group_messages.user_id
      WHERE group_messages.group_id = ? AND group_messages.parent_message_id = ?
      ORDER BY group_messages.created_at ASC LIMIT 100
    `).all(groupId, parentMessageId);
  }

  function createMessage({ groupId, roomId = null, parentMessageId = null, userId, body, displayName, username, authorDisplayName = null, authorUsername = null, createdAt = new Date().toISOString() }) {
    const message = { id: createId(), groupId, roomId, parentMessageId, userId, body, displayName, username, createdAt };
    database.prepare("INSERT INTO group_messages (id, group_id, room_id, user_id, parent_message_id, body, created_at, author_display_name, author_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(message.id, groupId, roomId, userId, parentMessageId, body, createdAt, authorDisplayName, authorUsername);
    return message;
  }

  function findMessage(groupId, messageId) {
    return database.prepare(`
      SELECT group_messages.id, group_messages.group_id AS groupId, group_messages.room_id AS roomId,
        group_messages.user_id AS userId, group_messages.parent_message_id AS parentMessageId, group_messages.body, group_messages.created_at AS createdAt,
        group_messages.edited_at AS editedAt,
        COALESCE(group_messages.author_display_name, users.display_name) AS displayName,
        COALESCE(group_messages.author_username, users.username) AS username
      FROM group_messages JOIN users ON users.id = group_messages.user_id
      WHERE group_messages.group_id = ? AND group_messages.id = ?
    `).get(groupId, messageId) || null;
  }

  function updateMessage({ groupId, messageId, body, editedAt = new Date().toISOString() }) {
    const result = database.prepare("UPDATE group_messages SET body = ?, edited_at = ? WHERE group_id = ? AND id = ?")
      .run(body, editedAt, groupId, messageId);
    return result.changes ? findMessage(groupId, messageId) : null;
  }

  function deleteMessage(groupId, messageId) {
    return database.prepare("DELETE FROM group_messages WHERE group_id = ? AND id = ?").run(groupId, messageId).changes > 0;
  }

  return { listMessages, findTextRoom, searchMessages, listThread, createMessage, findMessage, updateMessage, deleteMessage };
}

export function createPostgresGroupMessageRepository(database, { createId = randomUUID } = {}) {
  async function listMessages(groupId) {
    const result = await database.query(`
      WITH ranked_messages AS (
          SELECT group_messages.id, group_messages.room_id AS "roomId", group_messages.user_id AS "userId", group_messages.parent_message_id AS "parentMessageId", group_messages.body, group_messages.created_at AS "createdAt", group_messages.edited_at AS "editedAt",
          (SELECT COUNT(*) FROM group_messages replies WHERE replies.parent_message_id = group_messages.id) AS "threadCount",
          COALESCE(group_messages.author_display_name, users.display_name) AS "displayName",
          COALESCE(group_messages.author_username, users.username) AS username,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(group_messages.room_id, '__general__') ORDER BY group_messages.created_at DESC) AS "messageRank"
        FROM group_messages JOIN users ON users.id = group_messages.user_id
        WHERE group_messages.group_id = $1 AND group_messages.parent_message_id IS NULL
      )
      SELECT id, "roomId", "userId", "parentMessageId", body, "createdAt", "editedAt", "threadCount", "displayName", username
      FROM ranked_messages WHERE "messageRank" <= 80 ORDER BY "createdAt" ASC
    `, [groupId]);
    return result.rows.map((message) => ({ ...message, threadCount: Number(message.threadCount || 0) }));
  }

  async function findTextRoom(groupId, roomId) {
    if (!roomId) return null;
    const result = await database.query('SELECT id, kind FROM group_rooms WHERE id = $1 AND group_id = $2', [roomId, groupId]);
    return result.rows[0] || null;
  }

  async function searchMessages({ groupId, query, roomId = null, limit = 50 }) {
    const normalizedQuery = String(query || "").trim().slice(0, 80);
    if (normalizedQuery.length < 2) return [];
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 50));
    const result = await database.query(`
      SELECT group_messages.id, group_messages.group_id AS "groupId", group_messages.room_id AS "roomId",
        group_messages.user_id AS "userId", group_messages.parent_message_id AS "parentMessageId", group_messages.body, group_messages.created_at AS "createdAt",
        group_messages.edited_at AS "editedAt",
        COALESCE(group_messages.author_display_name, users.display_name) AS "displayName",
        COALESCE(group_messages.author_username, users.username) AS username
      FROM group_messages JOIN users ON users.id = group_messages.user_id
      WHERE group_messages.group_id = $1 AND POSITION(LOWER($2) IN LOWER(group_messages.body)) > 0
        AND ($3::text IS NULL OR group_messages.room_id = $3)
      ORDER BY group_messages.created_at DESC LIMIT $4
    `, [groupId, normalizedQuery, roomId, safeLimit]);
    return result.rows;
  }

  async function listThread(groupId, parentMessageId) {
    const result = await database.query(`
      SELECT group_messages.id, group_messages.group_id AS "groupId", group_messages.room_id AS "roomId",
        group_messages.user_id AS "userId", group_messages.parent_message_id AS "parentMessageId",
        group_messages.body, group_messages.created_at AS "createdAt", group_messages.edited_at AS "editedAt",
        COALESCE(group_messages.author_display_name, users.display_name) AS "displayName",
        COALESCE(group_messages.author_username, users.username) AS username
      FROM group_messages JOIN users ON users.id = group_messages.user_id
      WHERE group_messages.group_id = $1 AND group_messages.parent_message_id = $2
      ORDER BY group_messages.created_at ASC LIMIT 100
    `, [groupId, parentMessageId]);
    return result.rows;
  }

  async function createMessage({ groupId, roomId = null, parentMessageId = null, userId, body, displayName, username, authorDisplayName = null, authorUsername = null, createdAt = new Date().toISOString() }) {
    const message = { id: createId(), groupId, roomId, parentMessageId, userId, body, displayName, username, createdAt };
    await database.query("INSERT INTO group_messages (id, group_id, room_id, user_id, parent_message_id, body, created_at, author_display_name, author_username) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [message.id, groupId, roomId, userId, parentMessageId, body, createdAt, authorDisplayName, authorUsername]);
    return message;
  }

  async function findMessage(groupId, messageId) {
    const result = await database.query(`
      SELECT group_messages.id, group_messages.group_id AS "groupId", group_messages.room_id AS "roomId",
        group_messages.user_id AS "userId", group_messages.parent_message_id AS "parentMessageId", group_messages.body, group_messages.created_at AS "createdAt",
        group_messages.edited_at AS "editedAt",
        COALESCE(group_messages.author_display_name, users.display_name) AS "displayName",
        COALESCE(group_messages.author_username, users.username) AS username
      FROM group_messages JOIN users ON users.id = group_messages.user_id
      WHERE group_messages.group_id = $1 AND group_messages.id = $2
    `, [groupId, messageId]);
    return result.rows[0] || null;
  }

  async function updateMessage({ groupId, messageId, body, editedAt = new Date().toISOString() }) {
    const result = await database.query("UPDATE group_messages SET body = $1, edited_at = $2 WHERE group_id = $3 AND id = $4 RETURNING id", [body, editedAt, groupId, messageId]);
    return result.rowCount ? findMessage(groupId, messageId) : null;
  }

  async function deleteMessage(groupId, messageId) {
    const result = await database.query("DELETE FROM group_messages WHERE group_id = $1 AND id = $2", [groupId, messageId]);
    return result.rowCount > 0;
  }

  return { listMessages, findTextRoom, searchMessages, listThread, createMessage, findMessage, updateMessage, deleteMessage };
}
