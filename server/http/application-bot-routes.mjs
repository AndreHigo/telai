import {
  findComponent,
  normalizeBotResponse,
  normalizeCommandName,
  normalizeCustomId,
  normalizeInteractionOptions,
  normalizeModalFields,
  normalizeText,
} from "../domain/applications/normalization.mjs";

export function createApplicationBotRoutes({
  json,
  readJson,
  requireUser,
  applicationRepository,
  applicationInteractionRepository,
  groupMessageRepository,
  isGroupMember,
  canGroupRoomAction,
  hashToken,
  publishGroupEvent = () => {},
}) {
  function botToken(request) {
    const value = String(request.headers.authorization || "").trim();
    const match = value.match(/^Bot\s+([A-Za-z0-9_-]{32,128})$/i);
    return match?.[1] || null;
  }

  async function botIdentity(request) {
    const token = botToken(request);
    if (!token) return null;
    return applicationRepository.findByTokenHash(hashToken(token));
  }

  async function handleGroupCommandCatalog(request, response, requestUrl) {
    const match = requestUrl.pathname.match(/^\/api\/groups\/([A-Za-z0-9-]{1,64})\/applications\/commands$/);
    if (!match || request.method !== "GET") return false;
    const user = await requireUser(request, response);
    if (!user) return true;
    const [, groupId] = match;
    if (!await isGroupMember(user.id, groupId)) {
      json(response, 403, { error: "Você não participa deste grupo." });
      return true;
    }
    const applications = await applicationRepository.listInstalledCommandsForGroup(groupId);
    json(response, 200, { applications });
    return true;
  }

  async function handleUserInteraction(request, response, requestUrl) {
    const match = requestUrl.pathname.match(/^\/api\/groups\/([A-Za-z0-9-]{1,64})\/applications\/([A-Za-z0-9-]{16,64})\/interactions$/);
    if (!match || request.method !== "POST") return false;
    const user = await requireUser(request, response);
    if (!user) return true;
    const [, groupId, applicationId] = match;
    if (!await isGroupMember(user.id, groupId)) {
      json(response, 403, { error: "Você não participa deste grupo." });
      return true;
    }
    try {
      const body = await readJson(request, 32 * 1024);
      const commandName = normalizeCommandName(body.commandName || body.command);
      const command = commandName ? await applicationRepository.findInstalledCommand(applicationId, groupId, commandName) : null;
      if (!command) {
        json(response, 404, { error: "Comando não encontrado ou não instalado neste grupo." });
        return true;
      }
      const options = normalizeInteractionOptions(command.options, body.options);
      if (!options) {
        json(response, 400, { error: "As opções não correspondem ao contrato do comando." });
        return true;
      }
      const roomId = String(body.roomId || "").trim() || null;
      if (roomId && !await groupMessageRepository.findTextRoom(groupId, roomId)) {
        json(response, 400, { error: "A sala informada não existe neste grupo." });
        return true;
      }
      if (!await canGroupRoomAction(user.id, groupId, roomId, "canChat")) {
        json(response, 403, { error: "Você não tem permissão para iniciar interações neste canal." });
        return true;
      }
      const interaction = await applicationInteractionRepository.createInteraction({
        applicationId,
        groupId,
        roomId,
        userId: user.id,
        commandId: command.id,
        kind: "command",
        commandName: command.name,
        payload: { options },
      });
      json(response, 202, { interaction });
    } catch {
      json(response, 400, { error: "Não foi possível criar a interação." });
    }
    return true;
  }

  async function handleComponentInteraction(request, response, requestUrl) {
    const match = requestUrl.pathname.match(/^\/api\/interactions\/([A-Za-z0-9-]{16,64})\/(components|modal)$/);
    if (!match || request.method !== "POST") return false;
    const user = await requireUser(request, response);
    if (!user) return true;
    const [, parentId, interactionType] = match;
    const parent = await applicationInteractionRepository.findForUser(parentId, user.id);
    if (!parent || parent.status !== "responded" || new Date(parent.expiresAt).getTime() <= Date.now()) {
      json(response, 404, { error: "A interação não está mais disponível." });
      return true;
    }
    if (!await isGroupMember(user.id, parent.groupId)) {
      json(response, 403, { error: "Você não participa deste grupo." });
      return true;
    }
    const installation = await applicationRepository.findInstallation(parent.applicationId, parent.groupId);
    if (!installation?.permissions?.interactions) {
      json(response, 403, { error: "As interações deste bot estão desativadas neste grupo." });
      return true;
    }
    try {
      const body = await readJson(request, 32 * 1024);
      const customId = normalizeCustomId(body.customId);
      const expectedType = interactionType === "modal" ? "modal" : undefined;
      const component = customId ? findComponent(parent.response, customId, expectedType) : null;
      if (!component) {
        json(response, 400, { error: "Componente inválido ou expirado." });
        return true;
      }
      const fields = interactionType === "modal" ? normalizeModalFields(component, body.fields) : null;
      if (interactionType === "modal" && !fields) {
        json(response, 400, { error: "Os campos do modal são inválidos ou incompletos." });
        return true;
      }
      const values = interactionType === "modal" ? null : Array.isArray(body.values) ? body.values.slice(0, 25).map((value) => normalizeText(value, 100)) : [];
      if (component.type === "select" && values.some((value) => !component.options.some((option) => option.value === value))) {
        json(response, 400, { error: "A seleção não pertence às opções do componente." });
        return true;
      }
      const payload = interactionType === "modal" ? { fields } : { values, customId };
      const interaction = await applicationInteractionRepository.createInteraction({
        applicationId: parent.applicationId,
        groupId: parent.groupId,
        roomId: parent.roomId,
        userId: user.id,
        parentInteractionId: parent.id,
        kind: interactionType === "modal" ? "modal" : "component",
        commandName: parent.commandName,
        customId,
        payload,
      });
      json(response, 202, { interaction });
    } catch {
      json(response, 400, { error: "Não foi possível criar a interação." });
    }
    return true;
  }

  async function handleBotInteractionRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/bot/events" && request.method === "GET") {
      const identity = await botIdentity(request);
      if (!identity) {
        json(response, 401, { error: "Token de bot inválido ou revogado." });
        return true;
      }
      const events = await applicationRepository.claimEvents(identity.applicationId, {
        limit: Number(requestUrl.searchParams.get("limit")) || 25,
      });
      await applicationRepository.touchToken(identity.tokenId);
      json(response, 200, { events, delivery: { mode: "at-most-once", ttlSeconds: 300, maxBatch: 25 } });
      return true;
    }

    if (requestUrl.pathname === "/api/bot/interactions" && request.method === "GET") {
      const identity = await botIdentity(request);
      if (!identity) {
        json(response, 401, { error: "Token de bot inválido ou revogado." });
        return true;
      }
      const interactions = await applicationInteractionRepository.claimPending(identity.applicationId, Number(requestUrl.searchParams.get("limit")) || 25);
      await applicationRepository.touchToken(identity.tokenId);
      json(response, 200, { interactions });
      return true;
    }

    const responseMatch = requestUrl.pathname.match(/^\/api\/bot\/interactions\/([A-Za-z0-9-]{16,64})\/respond$/);
    if (responseMatch && request.method === "POST") {
      const identity = await botIdentity(request);
      if (!identity) {
        json(response, 401, { error: "Token de bot inválido ou revogado." });
        return true;
      }
      try {
        const parentInteraction = await applicationInteractionRepository.findById(responseMatch[1]);
        const installation = parentInteraction ? await applicationRepository.findInstallation(identity.applicationId, parentInteraction.groupId) : null;
        if (!installation?.permissions?.interactions) {
          json(response, 403, { error: "As interações deste bot estão desativadas neste grupo." });
          return true;
        }
        const body = await readJson(request, 32 * 1024);
        const botResponse = normalizeBotResponse(body);
        if (!botResponse) {
          json(response, 400, { error: "A resposta do bot não segue o contrato permitido." });
          return true;
        }
        const interaction = await applicationInteractionRepository.respond(identity.applicationId, responseMatch[1], botResponse);
        if (!interaction) {
          json(response, 409, { error: "A interação não está disponível para resposta." });
          return true;
        }
        let persistedMessage = null;
        if (interaction.response?.type === "message") {
          persistedMessage = await groupMessageRepository.createMessage({
            groupId: interaction.groupId,
            roomId: interaction.roomId,
            applicationInteractionId: interaction.id,
            userId: identity.botUserId,
            body: interaction.response.content || "",
            displayName: identity.botDisplayName,
            username: identity.botUsername,
          });
          persistedMessage.attachments = [];
          persistedMessage.components = Array.isArray(interaction.response.components) ? interaction.response.components : [];
          persistedMessage.interactionId = interaction.id;
          persistedMessage.botInteraction = true;
        }
        await applicationRepository.touchToken(identity.tokenId);
        await publishGroupEvent(interaction.groupId, {
          type: "application-interaction-response",
          interaction,
          message: persistedMessage,
          bot: { id: identity.botUserId, username: identity.botUsername, displayName: identity.botDisplayName },
        });
        json(response, 200, { interaction });
      } catch {
        json(response, 400, { error: "Não foi possível responder à interação." });
      }
      return true;
    }
    return false;
  }

  async function handleBotMessageRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/bot/applications/commands" && request.method === "GET") {
      const identity = await botIdentity(request);
      if (!identity) {
        json(response, 401, { error: "Token de bot inválido ou revogado." });
        return true;
      }
      json(response, 200, {
        application: { id: identity.applicationId, name: identity.applicationName },
        bot: { id: identity.botUserId, username: identity.botUsername, displayName: identity.botDisplayName },
        commands: await applicationRepository.listCommands(identity.applicationId, { activeOnly: true }),
      });
      return true;
    }

    const match = requestUrl.pathname.match(/^\/api\/bot\/groups\/([A-Za-z0-9-]{1,64})\/messages$/);
    if (!match || request.method !== "POST") return false;
    const identity = await botIdentity(request);
    if (!identity) {
      json(response, 401, { error: "Token de bot inválido ou revogado." });
      return true;
    }
    const groupId = match[1];
    const installation = await applicationRepository.findInstallation(identity.applicationId, groupId);
    if (!installation?.permissions?.messages || !await isGroupMember(identity.botUserId, groupId)) {
      json(response, 403, { error: "Este bot não está instalado neste grupo." });
      return true;
    }
    try {
      const body = await readJson(request, 16 * 1024);
      const content = normalizeText(body.content ?? body.body, 2000);
      if (!content) {
        json(response, 400, { error: "Envie um conteúdo não vazio." });
        return true;
      }
      const room = await groupMessageRepository.findTextRoom(groupId, String(body.roomId || ""));
      if (body.roomId && (!room || room.kind !== "text")) {
        json(response, 400, { error: "Escolha uma sala de texto válida." });
        return true;
      }
      if (!await canGroupRoomAction(identity.botUserId, groupId, room?.id || null, "canChat")) {
        json(response, 403, { error: "Este bot não tem permissão para conversar neste canal." });
        return true;
      }
      const message = await groupMessageRepository.createMessage({
        groupId,
        roomId: room?.id || null,
        userId: identity.botUserId,
        body: content,
        displayName: identity.botDisplayName,
        username: identity.botUsername,
      });
      message.attachments = [];
      await applicationRepository.touchToken(identity.tokenId);
      await publishGroupEvent(groupId, { type: "group-message", message });
      json(response, 201, { message });
    } catch {
      json(response, 400, { error: "Não foi possível publicar a mensagem do bot." });
    }
    return true;
  }

  return async function handleApplicationBotRoutes(request, response, requestUrl) {
    if (await handleGroupCommandCatalog(request, response, requestUrl)) return true;
    if (await handleUserInteraction(request, response, requestUrl)) return true;
    if (await handleComponentInteraction(request, response, requestUrl)) return true;
    if (await handleBotInteractionRoutes(request, response, requestUrl)) return true;
    if (await handleBotMessageRoutes(request, response, requestUrl)) return true;
    return false;
  };
}
