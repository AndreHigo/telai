import { randomUUID } from "node:crypto";

export function createDirectConversationRepository(database, { compactUserSummary = (user) => user, createId = randomUUID } = {}) {
  function directConversationForUser(conversationId, userId) {
    return database.prepare(`
      SELECT direct_conversations.id, direct_conversations.created_at AS createdAt,
        direct_conversations.updated_at AS updatedAt
      FROM direct_conversations
      JOIN direct_conversation_members ON direct_conversation_members.conversation_id = direct_conversations.id
      WHERE direct_conversations.id = ? AND direct_conversation_members.user_id = ?
    `).get(conversationId, userId) || null;
  }

  function directConversationPayload(conversationId, userId) {
    const conversation = directConversationForUser(conversationId, userId);
    if (!conversation) return null;
    const otherUser = database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData
      FROM direct_conversation_members
      JOIN users ON users.id = direct_conversation_members.user_id
      WHERE direct_conversation_members.conversation_id = ? AND direct_conversation_members.user_id <> ?
      LIMIT 1
    `).get(conversationId, userId);
    if (!otherUser) return null;
    return { ...conversation, otherUser: compactUserSummary(otherUser) };
  }

  function listConversationsForUser(userId) {
    return database.prepare(`
      SELECT conversations.id, conversations.created_at AS createdAt, conversations.updated_at AS updatedAt,
        other.id AS userId, other.username, other.display_name AS displayName, other.avatar_data AS avatarData,
        (SELECT body FROM direct_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS lastBody,
        (SELECT created_at FROM direct_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS lastMessageAt,
        (SELECT COUNT(*) FROM direct_messages unread_messages
          WHERE unread_messages.conversation_id = conversations.id
            AND unread_messages.sender_id <> ? AND unread_messages.read_at IS NULL) AS unreadCount
      FROM direct_conversations conversations
      JOIN direct_conversation_members mine ON mine.conversation_id = conversations.id AND mine.user_id = ?
      JOIN direct_conversation_members other_member ON other_member.conversation_id = conversations.id AND other_member.user_id <> ?
      JOIN users other ON other.id = other_member.user_id
      ORDER BY conversations.updated_at DESC
    `).all(userId, userId, userId).map((conversation) => ({
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      otherUser: compactUserSummary({ id: conversation.userId, username: conversation.username, displayName: conversation.displayName, avatarData: conversation.avatarData }),
      lastBody: conversation.lastBody || "",
      lastMessageAt: conversation.lastMessageAt || null,
      unreadCount: Number(conversation.unreadCount || 0),
    }));
  }

  function findUser(userId) {
    return database.prepare("SELECT id, username, display_name AS displayName, avatar_data AS avatarData FROM users WHERE id = ?").get(userId) || null;
  }

  function findExistingConversation(userId, targetUserId) {
    return database.prepare(`
      SELECT conversations.id FROM direct_conversations conversations
      JOIN direct_conversation_members mine ON mine.conversation_id = conversations.id AND mine.user_id = ?
      JOIN direct_conversation_members other ON other.conversation_id = conversations.id AND other.user_id = ?
      WHERE (SELECT COUNT(*) FROM direct_conversation_members members WHERE members.conversation_id = conversations.id) = 2
      LIMIT 1
    `).get(userId, targetUserId)?.id || null;
  }

  function createConversation(userId, targetUserId, createdAt = new Date().toISOString()) {
    const existingId = findExistingConversation(userId, targetUserId);
    if (existingId) return existingId;
    const conversationId = createId();
    try {
      database.exec("BEGIN");
      database.prepare("INSERT INTO direct_conversations (id, created_at, updated_at) VALUES (?, ?, ?)").run(conversationId, createdAt, createdAt);
      database.prepare("INSERT INTO direct_conversation_members (conversation_id, user_id, created_at) VALUES (?, ?, ?), (?, ?, ?)").run(conversationId, userId, createdAt, conversationId, targetUserId, createdAt);
      database.exec("COMMIT");
      return conversationId;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function markRead(conversationId, userId, readAt = new Date().toISOString()) {
    database.prepare("UPDATE direct_messages SET read_at = COALESCE(read_at, ?) WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL").run(readAt, conversationId, userId);
    database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND type = 'direct_message' AND entity_id IN (SELECT id FROM direct_messages WHERE conversation_id = ?)").run(readAt, userId, conversationId);
  }

  function listMessages(conversationId, userId, includeConversationAvatar, readAt = new Date().toISOString()) {
    markRead(conversationId, userId, readAt);
    const messages = database.prepare(`
      SELECT direct_messages.id, direct_messages.conversation_id AS conversationId,
        direct_messages.sender_id AS senderId, direct_messages.body,
        direct_messages.created_at AS createdAt, direct_messages.read_at AS readAt,
        users.display_name AS displayName, users.username
      FROM direct_messages JOIN users ON users.id = direct_messages.sender_id
      WHERE direct_messages.conversation_id = ?
      ORDER BY direct_messages.created_at ASC LIMIT 200
    `).all(conversationId);
    return { messages, includeConversationAvatar };
  }

  function recipientForMessage(conversationId, userId) {
    return database.prepare(`
      SELECT users.id FROM direct_conversation_members
      JOIN users ON users.id = direct_conversation_members.user_id
      WHERE direct_conversation_members.conversation_id = ? AND direct_conversation_members.user_id <> ?
      LIMIT 1
    `).get(conversationId, userId) || null;
  }

  function createMessage({ conversationId, senderId, body, displayName, username, createdAt = new Date().toISOString(), createNotification }) {
    const recipient = recipientForMessage(conversationId, senderId);
    if (!recipient) throw new Error("conversation-recipient-missing");
    const message = { id: createId(), conversationId, senderId, body, createdAt, readAt: null, displayName, username };
    try {
      database.exec("BEGIN");
      database.prepare("INSERT INTO direct_messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)").run(message.id, conversationId, senderId, body, createdAt);
      database.prepare("UPDATE direct_conversations SET updated_at = ? WHERE id = ?").run(createdAt, conversationId);
      createNotification?.({ userId: recipient.id, type: "direct_message", entityId: message.id, title: `${displayName} enviou uma mensagem`, body: body.slice(0, 160), createdAt });
      database.exec("COMMIT");
      return message;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { directConversationForUser, directConversationPayload, listConversationsForUser, findUser, findExistingConversation, createConversation, markRead, listMessages, recipientForMessage, createMessage };
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

export function createPostgresDirectConversationRepository(database, { compactUserSummary = (user) => user, createId = randomUUID, transactionClient = false } = {}) {
  async function directConversationForUser(conversationId, userId) {
    const result = await database.query(`
      SELECT direct_conversations.id, direct_conversations.created_at AS "createdAt",
        direct_conversations.updated_at AS "updatedAt"
      FROM direct_conversations
      JOIN direct_conversation_members ON direct_conversation_members.conversation_id = direct_conversations.id
      WHERE direct_conversations.id = $1 AND direct_conversation_members.user_id = $2
    `, [conversationId, userId]);
    return result.rows[0] || null;
  }

  async function directConversationPayload(conversationId, userId) {
    const conversation = await directConversationForUser(conversationId, userId);
    if (!conversation) return null;
    const result = await database.query(`
      SELECT users.id, users.username, users.display_name AS "displayName", users.avatar_data AS "avatarData"
      FROM direct_conversation_members
      JOIN users ON users.id = direct_conversation_members.user_id
      WHERE direct_conversation_members.conversation_id = $1 AND direct_conversation_members.user_id <> $2
      LIMIT 1
    `, [conversationId, userId]);
    const otherUser = result.rows[0];
    if (!otherUser) return null;
    return { ...conversation, otherUser: compactUserSummary(otherUser) };
  }

  async function listConversationsForUser(userId) {
    const result = await database.query(`
      SELECT conversations.id, conversations.created_at AS "createdAt", conversations.updated_at AS "updatedAt",
        other.id AS "userId", other.username, other.display_name AS "displayName", other.avatar_data AS "avatarData",
        (SELECT body FROM direct_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS "lastBody",
        (SELECT created_at FROM direct_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS "lastMessageAt",
        (SELECT COUNT(*) FROM direct_messages unread_messages WHERE unread_messages.conversation_id = conversations.id
          AND unread_messages.sender_id <> $1 AND unread_messages.read_at IS NULL) AS "unreadCount"
      FROM direct_conversations conversations
      JOIN direct_conversation_members mine ON mine.conversation_id = conversations.id AND mine.user_id = $1
      JOIN direct_conversation_members other_member ON other_member.conversation_id = conversations.id AND other_member.user_id <> $1
      JOIN users other ON other.id = other_member.user_id
      ORDER BY conversations.updated_at DESC
    `, [userId]);
    return result.rows.map((conversation) => ({
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      otherUser: compactUserSummary({ id: conversation.userId, username: conversation.username, displayName: conversation.displayName, avatarData: conversation.avatarData }),
      lastBody: conversation.lastBody || "",
      lastMessageAt: conversation.lastMessageAt || null,
      unreadCount: Number(conversation.unreadCount || 0),
    }));
  }

  async function findUser(userId) {
    const result = await database.query('SELECT id, username, display_name AS "displayName", avatar_data AS "avatarData" FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  }

  async function findExistingConversation(userId, targetUserId, queryDatabase = database) {
    const result = await queryDatabase.query(`
      SELECT conversations.id FROM direct_conversations conversations
      JOIN direct_conversation_members mine ON mine.conversation_id = conversations.id AND mine.user_id = $1
      JOIN direct_conversation_members other ON other.conversation_id = conversations.id AND other.user_id = $2
      WHERE (SELECT COUNT(*) FROM direct_conversation_members members WHERE members.conversation_id = conversations.id) = 2
      LIMIT 1
    `, [userId, targetUserId]);
    return result.rows[0]?.id || null;
  }

  async function createConversation(userId, targetUserId, createdAt = new Date().toISOString()) {
    const existingId = await findExistingConversation(userId, targetUserId);
    if (existingId) return existingId;
    return withPostgresTransaction(database, async (client) => {
      const concurrentId = await findExistingConversation(userId, targetUserId, client);
      if (concurrentId) return concurrentId;
      const conversationId = createId();
      await client.query("INSERT INTO direct_conversations (id, created_at, updated_at) VALUES ($1, $2, $2)", [conversationId, createdAt]);
      await client.query("INSERT INTO direct_conversation_members (conversation_id, user_id, created_at) VALUES ($1, $2, $3), ($1, $4, $3)", [conversationId, userId, createdAt, targetUserId]);
      return conversationId;
    }, transactionClient);
  }

  async function markRead(conversationId, userId, readAt = new Date().toISOString(), queryDatabase = database) {
    await queryDatabase.query("UPDATE direct_messages SET read_at = COALESCE($1, read_at) WHERE conversation_id = $2 AND sender_id <> $3 AND read_at IS NULL", [readAt, conversationId, userId]);
    await queryDatabase.query("UPDATE notifications SET read_at = COALESCE($1, read_at) WHERE user_id = $2 AND type = 'direct_message' AND entity_id IN (SELECT id FROM direct_messages WHERE conversation_id = $3)", [readAt, userId, conversationId]);
  }

  async function listMessages(conversationId, userId, includeConversationAvatar, readAt = new Date().toISOString()) {
    await markRead(conversationId, userId, readAt);
    const result = await database.query(`
      SELECT direct_messages.id, direct_messages.conversation_id AS "conversationId", direct_messages.sender_id AS "senderId",
        direct_messages.body, direct_messages.created_at AS "createdAt", direct_messages.read_at AS "readAt",
        users.display_name AS "displayName", users.username
      FROM direct_messages JOIN users ON users.id = direct_messages.sender_id
      WHERE direct_messages.conversation_id = $1 ORDER BY direct_messages.created_at ASC LIMIT 200
    `, [conversationId]);
    return { messages: result.rows, includeConversationAvatar };
  }

  async function recipientForMessage(conversationId, userId, queryDatabase = database) {
    const result = await queryDatabase.query(`
      SELECT users.id FROM direct_conversation_members JOIN users ON users.id = direct_conversation_members.user_id
      WHERE direct_conversation_members.conversation_id = $1 AND direct_conversation_members.user_id <> $2 LIMIT 1
    `, [conversationId, userId]);
    return result.rows[0] || null;
  }

  async function createMessage({ conversationId, senderId, body, displayName, username, createdAt = new Date().toISOString(), createNotification }) {
    return withPostgresTransaction(database, async (client) => {
      const recipient = await recipientForMessage(conversationId, senderId, client);
      if (!recipient) throw new Error("conversation-recipient-missing");
      const message = { id: createId(), conversationId, senderId, body, createdAt, readAt: null, displayName, username };
      await client.query("INSERT INTO direct_messages (id, conversation_id, sender_id, body, created_at) VALUES ($1, $2, $3, $4, $5)", [message.id, conversationId, senderId, body, createdAt]);
      await client.query("UPDATE direct_conversations SET updated_at = $1 WHERE id = $2", [createdAt, conversationId]);
      if (createNotification) await createNotification({ userId: recipient.id, type: "direct_message", entityId: message.id, title: `${displayName} enviou uma mensagem`, body: body.slice(0, 160), createdAt });
      return message;
    }, transactionClient);
  }

  return { directConversationForUser, directConversationPayload, listConversationsForUser, findUser, findExistingConversation, createConversation, markRead, listMessages, recipientForMessage, createMessage };
}
