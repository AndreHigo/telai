export function createDirectConversationRepository(database, { compactUserSummary = (user) => user } = {}) {
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

  return { directConversationForUser, directConversationPayload };
}
