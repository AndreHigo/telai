import { randomUUID } from "node:crypto";

function mapAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    groupId: row.groupId,
    messageId: row.messageId,
    name: row.name,
    mimeType: row.mimeType,
    byteSize: Number(row.byteSize || 0),
    storageKey: row.storageKey,
    createdAt: row.createdAt,
  };
}

export function createGroupAttachmentRepository(database, { createId = randomUUID } = {}) {
  function createAttachments({ groupId, messageId, attachments, createdAt = new Date().toISOString() }) {
    const rows = attachments.map((attachment) => ({
      id: attachment.id || createId(), groupId, messageId, name: attachment.name, mimeType: attachment.mimeType,
      byteSize: attachment.byteSize, storageKey: attachment.storageKey, createdAt,
    }));
    const insert = database.prepare(`
      INSERT INTO group_message_attachments (id, group_id, message_id, original_name, mime_type, byte_size, storage_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      database.exec("BEGIN");
      rows.forEach((row) => insert.run(row.id, row.groupId, row.messageId, row.name, row.mimeType, row.byteSize, row.storageKey, row.createdAt));
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
    return rows.map(mapAttachment);
  }

  function listForMessage(groupId, messageId) {
    return database.prepare(`
      SELECT id, group_id AS groupId, message_id AS messageId, original_name AS name,
        mime_type AS mimeType, byte_size AS byteSize, storage_key AS storageKey, created_at AS createdAt
      FROM group_message_attachments WHERE group_id = ? AND message_id = ? ORDER BY created_at, id
    `).all(groupId, messageId).map(mapAttachment);
  }

  function attachToMessages(groupId, messages) {
    if (!messages.length) return messages;
    const ids = new Set(messages.map((message) => message.id));
    const rows = database.prepare(`
      SELECT id, group_id AS groupId, message_id AS messageId, original_name AS name,
        mime_type AS mimeType, byte_size AS byteSize, storage_key AS storageKey, created_at AS createdAt
      FROM group_message_attachments WHERE group_id = ? AND message_id IN (${[...ids].map(() => "?").join(",")})
      ORDER BY created_at, id
    `).all(groupId, ...ids).map(mapAttachment);
    const byMessage = new Map();
    rows.forEach((row) => byMessage.set(row.messageId, [...(byMessage.get(row.messageId) || []), row]));
    return messages.map((message) => ({ ...message, attachments: byMessage.get(message.id) || [] }));
  }

  function find(groupId, attachmentId) {
    return mapAttachment(database.prepare(`
      SELECT id, group_id AS groupId, message_id AS messageId, original_name AS name,
        mime_type AS mimeType, byte_size AS byteSize, storage_key AS storageKey, created_at AS createdAt
      FROM group_message_attachments WHERE group_id = ? AND id = ?
    `).get(groupId, attachmentId));
  }

  function listForGroup(groupId) {
    return database.prepare(`
      SELECT id, group_id AS groupId, message_id AS messageId, original_name AS name,
        mime_type AS mimeType, byte_size AS byteSize, storage_key AS storageKey, created_at AS createdAt
      FROM group_message_attachments WHERE group_id = ? ORDER BY created_at, id
    `).all(groupId).map(mapAttachment);
  }

  return { createAttachments, listForMessage, attachToMessages, find, listForGroup };
}

export function createPostgresGroupAttachmentRepository(database, { createId = randomUUID } = {}) {
  async function createAttachments({ groupId, messageId, attachments, createdAt = new Date().toISOString() }) {
    const rows = [];
    for (const attachment of attachments) {
      const row = { id: attachment.id || createId(), groupId, messageId, name: attachment.name, mimeType: attachment.mimeType, byteSize: attachment.byteSize, storageKey: attachment.storageKey, createdAt };
      await database.query(`
        INSERT INTO group_message_attachments (id, group_id, message_id, original_name, mime_type, byte_size, storage_key, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [row.id, row.groupId, row.messageId, row.name, row.mimeType, row.byteSize, row.storageKey, row.createdAt]);
      rows.push(row);
    }
    return rows.map(mapAttachment);
  }

  async function listForMessage(groupId, messageId) {
    const result = await database.query(`
      SELECT id, group_id AS "groupId", message_id AS "messageId", original_name AS name,
        mime_type AS "mimeType", byte_size AS "byteSize", storage_key AS "storageKey", created_at AS "createdAt"
      FROM group_message_attachments WHERE group_id = $1 AND message_id = $2 ORDER BY created_at, id
    `, [groupId, messageId]);
    return result.rows.map(mapAttachment);
  }

  async function attachToMessages(groupId, messages) {
    if (!messages.length) return messages;
    const result = await database.query(`
      SELECT id, group_id AS "groupId", message_id AS "messageId", original_name AS name,
        mime_type AS "mimeType", byte_size AS "byteSize", storage_key AS "storageKey", created_at AS "createdAt"
      FROM group_message_attachments WHERE group_id = $1 AND message_id = ANY($2::text[])
      ORDER BY created_at, id
    `, [groupId, messages.map((message) => message.id)]);
    const byMessage = new Map();
    result.rows.map(mapAttachment).forEach((row) => byMessage.set(row.messageId, [...(byMessage.get(row.messageId) || []), row]));
    return messages.map((message) => ({ ...message, attachments: byMessage.get(message.id) || [] }));
  }

  async function find(groupId, attachmentId) {
    const result = await database.query(`
      SELECT id, group_id AS "groupId", message_id AS "messageId", original_name AS name,
        mime_type AS "mimeType", byte_size AS "byteSize", storage_key AS "storageKey", created_at AS "createdAt"
      FROM group_message_attachments WHERE group_id = $1 AND id = $2
    `, [groupId, attachmentId]);
    return mapAttachment(result.rows[0]);
  }

  async function listForGroup(groupId) {
    const result = await database.query(`
      SELECT id, group_id AS "groupId", message_id AS "messageId", original_name AS name,
        mime_type AS "mimeType", byte_size AS "byteSize", storage_key AS "storageKey", created_at AS "createdAt"
      FROM group_message_attachments WHERE group_id = $1 ORDER BY created_at, id
    `, [groupId]);
    return result.rows.map(mapAttachment);
  }

  return { createAttachments, listForMessage, attachToMessages, find, listForGroup };
}
