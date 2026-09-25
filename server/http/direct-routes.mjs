export function createDirectRoutes({
  json,
  readJson,
  requireUser,
  directConversationRepository,
  directConversationForUser,
  directConversationPayload,
  isBlocked,
  createNotification,
  errorLog,
}) {
  return async function handleDirectRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/direct/conversations" && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      json(response, 200, { conversations: await directConversationRepository.listConversationsForUser(user.id) });
      return true;
    }

    if (requestUrl.pathname === "/api/direct/conversations" && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      try {
        const body = await readJson(request);
        const targetUserId = String(body.userId || "").trim();
        if (!targetUserId || targetUserId === user.id) return json(response, 400, { error: "Escolha outra pessoa para iniciar a conversa." });
        const target = await directConversationRepository.findUser(targetUserId);
        if (!target) return json(response, 404, { error: "Usuário não encontrado." });
        if (await isBlocked?.(user.id, targetUserId)) return json(response, 403, { error: "Não é possível iniciar uma conversa com este usuário." });
        const conversationId = await directConversationRepository.createConversation(user.id, targetUserId);
        return json(response, 201, { conversation: await directConversationPayload(conversationId, user.id) });
      } catch (error) {
        errorLog("direct_conversation_create_error", { error });
        return json(response, 400, { error: "Não foi possível iniciar a conversa." });
      }
      return true;
    }

    const directConversationMatch = requestUrl.pathname.match(/^\/api\/direct\/conversations\/([\w-]{16,64})(?:\/(messages|read))?$/);
    if (directConversationMatch && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const conversationId = directConversationMatch[1];
      const conversation = await directConversationPayload(conversationId, user.id);
      if (!conversation) {
        json(response, 404, { error: "Conversa não encontrada." });
        return true;
      }
      if (directConversationMatch[2] === "messages") {
        const includeConversationAvatar = requestUrl.searchParams.get("includeAvatar") === "1";
        const { messages } = await directConversationRepository.listMessages(conversationId, user.id, includeConversationAvatar);
        const responseConversation = includeConversationAvatar
          ? conversation
          : { ...conversation, otherUser: null };
        json(response, 200, { conversation: responseConversation, messages });
        return true;
      }
      json(response, 200, { conversation });
      return true;
    }

    if (directConversationMatch && directConversationMatch[2] === "read" && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const conversationId = directConversationMatch[1];
      if (!await directConversationForUser(conversationId, user.id)) {
        json(response, 404, { error: "Conversa não encontrada." });
        return true;
      }
      await directConversationRepository.markRead(conversationId, user.id);
      json(response, 200, { ok: true });
      return true;
    }

    const directMessagesMatch = requestUrl.pathname.match(/^\/api\/direct\/conversations\/([\w-]{16,64})\/messages$/);
    if (directMessagesMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const conversationId = directMessagesMatch[1];
      if (!await directConversationForUser(conversationId, user.id)) {
        json(response, 404, { error: "Conversa não encontrada." });
        return true;
      }
      const recipient = await directConversationRepository.recipientForMessage?.(conversationId, user.id);
      if (recipient && await isBlocked?.(user.id, recipient.id)) {
        json(response, 403, { error: "Não é possível enviar mensagens para este usuário." });
        return true;
      }
      try {
        const body = await readJson(request);
        const messageBody = String(body.body || "").trim().slice(0, 1000);
        if (!messageBody) return json(response, 400, { error: "Escreva uma mensagem antes de enviar." });
        const createdAt = new Date().toISOString();
        const message = await directConversationRepository.createMessage({ conversationId, senderId: user.id, body: messageBody, createdAt, displayName: user.displayName, username: user.username, createNotification });
        return json(response, 201, { message });
      } catch (error) {
        errorLog("direct_message_create_error", { error });
        return json(response, 400, { error: "Não foi possível enviar a mensagem." });
      }
      return true;
    }

    return false;
  };
}
