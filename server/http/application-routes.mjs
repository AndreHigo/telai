import { randomUUID } from "node:crypto";

function normalizeText(value, maxLength) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeCommandName(value) {
  const name = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(name) ? name : null;
}

function normalizeCommandOptions(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 25) return null;
  const seen = new Set();
  const options = [];
  for (const item of value) {
    const name = normalizeCommandName(item?.name);
    const description = normalizeText(item?.description, 100);
    const type = String(item?.type || "string").trim().toLowerCase();
    if (!name || seen.has(name) || !description || !["string", "integer", "number", "boolean"].includes(type)) return null;
    seen.add(name);
    options.push({ name, description, type, required: item?.required === true });
  }
  return options;
}

function normalizeInteractionOptions(definitions, value) {
  const input = value === undefined ? {} : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const definitionMap = new Map((definitions || []).map((item) => [item.name, item]));
  const output = {};
  for (const [name, rawValue] of Object.entries(input)) {
    const definition = definitionMap.get(name);
    if (!definition || typeof rawValue === "object" || (typeof rawValue === "string" && rawValue.length > 1000)) return null;
    if (definition.type === "string" && typeof rawValue !== "string") return null;
    if (definition.type === "integer" && (!Number.isInteger(rawValue) || !Number.isSafeInteger(rawValue))) return null;
    if (definition.type === "number" && (typeof rawValue !== "number" || !Number.isFinite(rawValue))) return null;
    if (definition.type === "boolean" && typeof rawValue !== "boolean") return null;
    output[name] = rawValue;
  }
  for (const definition of definitions || []) {
    if (definition.required && output[definition.name] === undefined) return null;
  }
  return output;
}

function normalizeCustomId(value) {
  const customId = String(value ?? "").trim();
  return /^[A-Za-z0-9:_-]{1,100}$/.test(customId) ? customId : null;
}

function normalizeComponents(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 25) return null;
  const seen = new Set();
  const components = [];
  for (const item of value) {
    const type = String(item?.type || "").trim().toLowerCase();
    const customId = normalizeCustomId(item?.customId);
    if (!customId || seen.has(customId)) return null;
    seen.add(customId);
    if (type === "button") {
      const label = normalizeText(item.label, 80);
      const style = String(item.style || "secondary").trim().toLowerCase();
      if (!label || !["primary", "secondary", "danger"].includes(style)) return null;
      components.push({ type, customId, label, style, disabled: item.disabled === true });
      continue;
    }
    if (type === "select") {
      const options = Array.isArray(item.options) ? item.options.slice(0, 25).map((option) => ({
        value: normalizeText(option?.value, 100),
        label: normalizeText(option?.label, 80),
        description: normalizeText(option?.description, 100),
      })) : [];
      if (!options.length || options.some((option) => !option.value || !option.label || option.value.length > 100)) return null;
      components.push({ type, customId, placeholder: normalizeText(item.placeholder, 100), options, minValues: 1, maxValues: 1 });
      continue;
    }
    if (type === "modal") {
      const title = normalizeText(item.title, 100);
      const fields = Array.isArray(item.fields) ? item.fields.slice(0, 5).map((field) => ({
        customId: normalizeCustomId(field?.customId),
        label: normalizeText(field?.label, 100),
        style: String(field?.style || "short").trim().toLowerCase(),
        required: field?.required !== false,
      })) : [];
      if (!title || !fields.length || fields.some((field) => !field.customId || !field.label || !["short", "paragraph"].includes(field.style))) return null;
      components.push({ type, customId, title, fields });
      continue;
    }
    return null;
  }
  return components;
}

function normalizeBotResponse(body) {
  const response = body?.response && typeof body.response === "object" ? body.response : body;
  const type = String(response?.type || "message").trim().toLowerCase();
  if (type === "message") {
    const content = normalizeText(response.content ?? response.body, 2000);
    const components = normalizeComponents(response.components);
    if ((!content && !components.length) || !components) return null;
    return { type, content, components };
  }
  if (type === "modal") {
    const customId = normalizeCustomId(response.customId);
    const title = normalizeText(response.title, 100);
    const fields = normalizeComponents([{ type, customId, title, fields: response.fields }]);
    if (!fields) return null;
    return fields[0];
  }
  return null;
}

function findComponent(response, customId, expectedType = null) {
  if (!response || typeof response !== "object") return null;
  if (response.customId === customId && (!expectedType || response.type === expectedType)) return response;
  const component = Array.isArray(response.components) ? response.components.find((item) => item.customId === customId) : null;
  if (!component || (expectedType && component.type !== expectedType)) return null;
  return component;
}

function normalizeModalFields(component, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = {};
  const allowed = new Map((component.fields || []).map((field) => [field.customId, field]));
  for (const [customId, rawValue] of Object.entries(value)) {
    const field = allowed.get(customId);
    if (!field || typeof rawValue !== "string" || rawValue.length > 2000) return null;
    fields[customId] = rawValue;
  }
  for (const field of component.fields || []) {
    if (field.required && !fields[field.customId]) return null;
  }
  return fields;
}

function applicationPayload(application) {
  return application ? {
    id: application.id,
    name: application.name,
    description: application.description,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    bot: application.bot,
  } : null;
}

export function createApplicationRoutes({
  json,
  readJson,
  requireUser,
  applicationRepository,
  applicationInteractionRepository,
  groupSettingsRepository,
  groupMessageRepository,
  isGroupMember,
  canGroupRoomAction,
  hashToken,
  createToken,
  createPasswordHash,
  publishGroupEvent = () => {},
}) {
  async function ownedApplication(request, response, applicationId) {
    const user = await requireUser(request, response);
    if (!user) return null;
    const application = await applicationRepository.findOwned(user.id, applicationId);
    if (!application) {
      json(response, 404, { error: "Aplicação não encontrada." });
      return null;
    }
    return { user, application };
  }

  function botToken(request) {
    const value = String(request.headers.authorization || "").trim();
    const match = value.match(/^Bot\s+([A-Za-z0-9_-]{32,128})$/i);
    return match?.[1] || null;
  }

  return async function handleApplicationRoutes(request, response, requestUrl) {
    const groupCommandsMatch = requestUrl.pathname.match(/^\/api\/groups\/([A-Za-z0-9-]{1,64})\/applications\/commands$/);
    if (groupCommandsMatch && request.method === "GET") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const [, groupId] = groupCommandsMatch;
      if (!await isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      const applications = await applicationRepository.listInstalledCommandsForGroup(groupId);
      json(response, 200, { applications });
      return true;
    }

    const userInteractionMatch = requestUrl.pathname.match(/^\/api\/groups\/([A-Za-z0-9-]{1,64})\/applications\/([A-Za-z0-9-]{16,64})\/interactions$/);
    if (userInteractionMatch && request.method === "POST") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const [, groupId, applicationId] = userInteractionMatch;
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
        const interaction = await applicationInteractionRepository.createInteraction({ applicationId, groupId, roomId, userId: user.id, commandId: command.id, kind: "command", commandName: command.name, payload: { options } });
        json(response, 202, { interaction });
      } catch {
        json(response, 400, { error: "Não foi possível criar a interação." });
      }
      return true;
    }

    const componentInteractionMatch = requestUrl.pathname.match(/^\/api\/interactions\/([A-Za-z0-9-]{16,64})\/(components|modal)$/);
    if (componentInteractionMatch && request.method === "POST") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const [, parentId, interactionType] = componentInteractionMatch;
      const parent = await applicationInteractionRepository.findForUser(parentId, user.id);
      if (!parent || parent.status !== "responded" || new Date(parent.expiresAt).getTime() <= Date.now()) {
        json(response, 404, { error: "A interação não está mais disponível." });
        return true;
      }
      if (!await isGroupMember(user.id, parent.groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
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
        const interaction = await applicationInteractionRepository.createInteraction({ applicationId: parent.applicationId, groupId: parent.groupId, roomId: parent.roomId, userId: user.id, parentInteractionId: parent.id, kind: interactionType === "modal" ? "modal" : "component", commandName: parent.commandName, customId, payload });
        json(response, 202, { interaction });
      } catch {
        json(response, 400, { error: "Não foi possível criar a interação." });
      }
      return true;
    }

    if (requestUrl.pathname === "/api/bot/interactions" && request.method === "GET") {
      const token = botToken(request);
      const identity = token ? await applicationRepository.findByTokenHash(hashToken(token)) : null;
      if (!identity) {
        json(response, 401, { error: "Token de bot inválido ou revogado." });
        return true;
      }
      const interactions = await applicationInteractionRepository.claimPending(identity.applicationId, Number(requestUrl.searchParams.get("limit")) || 25);
      await applicationRepository.touchToken(identity.tokenId);
      json(response, 200, { interactions });
      return true;
    }

    const botResponseMatch = requestUrl.pathname.match(/^\/api\/bot\/interactions\/([A-Za-z0-9-]{16,64})\/respond$/);
    if (botResponseMatch && request.method === "POST") {
      const token = botToken(request);
      const identity = token ? await applicationRepository.findByTokenHash(hashToken(token)) : null;
      if (!identity) {
        json(response, 401, { error: "Token de bot inválido ou revogado." });
        return true;
      }
      try {
        const body = await readJson(request, 32 * 1024);
        const botResponse = normalizeBotResponse(body);
        if (!botResponse) {
          json(response, 400, { error: "A resposta do bot não segue o contrato permitido." });
          return true;
        }
        const interaction = await applicationInteractionRepository.respond(identity.applicationId, botResponseMatch[1], botResponse);
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

    if (requestUrl.pathname === "/api/applications" && ["GET", "POST"].includes(request.method)) {
      const user = await requireUser(request, response);
      if (!user) return true;
      if (request.method === "GET") {
        json(response, 200, { applications: (await applicationRepository.listOwned(user.id)).map(applicationPayload) });
        return true;
      }
      try {
        const body = await readJson(request, 16 * 1024);
        const name = normalizeText(body.name, 64);
        const description = normalizeText(body.description, 280);
        if (name.length < 2) {
          json(response, 400, { error: "Informe um nome de aplicação com pelo menos 2 caracteres." });
          return true;
        }
        const id = randomUUID();
        const botUserId = randomUUID();
        const botUsername = `bot-${id.replaceAll("-", "").slice(0, 16)}`;
        const botDisplayName = `${name} Bot`.slice(0, 48);
        const application = await applicationRepository.createApplication({
          id,
          ownerId: user.id,
          botUserId,
          botUsername,
          botDisplayName,
          botPasswordHash: createPasswordHash(),
          name,
          description,
        });
        json(response, 201, { application: applicationPayload(application) });
      } catch {
        json(response, 400, { error: "Não foi possível criar a aplicação." });
      }
      return true;
    }

    const applicationMatch = requestUrl.pathname.match(/^\/api\/applications\/([A-Za-z0-9-]{16,64})(?:\/([^/]+)(?:\/([^/]+))?)?$/);
    if (applicationMatch && ["GET", "POST", "PATCH", "DELETE"].includes(request.method)) {
      const [, applicationId, segment, childId] = applicationMatch;
      const context = await ownedApplication(request, response, applicationId);
      if (!context) return true;

      if (!segment && request.method === "GET") {
        json(response, 200, { application: applicationPayload(context.application) });
        return true;
      }
      if (!segment && request.method === "DELETE") {
        await applicationRepository.deleteApplication(context.user.id, applicationId);
        json(response, 200, { ok: true, applicationId });
        return true;
      }

      if (segment === "tokens") {
        if (request.method === "GET" && !childId) {
          json(response, 200, { tokens: await applicationRepository.listTokens(applicationId) });
          return true;
        }
        if (request.method === "POST" && !childId) {
          try {
            const body = await readJson(request, 8 * 1024);
            const label = normalizeText(body.label || "Token principal", 64) || "Token principal";
            const token = createToken();
            const created = await applicationRepository.createToken({ applicationId, label, tokenHash: hashToken(token) });
            json(response, 201, { token, tokenInfo: created });
          } catch {
            json(response, 400, { error: "Não foi possível criar o token." });
          }
          return true;
        }
        if (request.method === "DELETE" && childId) {
          if (!await applicationRepository.revokeToken(applicationId, childId)) {
            json(response, 404, { error: "Token não encontrado ou já revogado." });
            return true;
          }
          json(response, 200, { ok: true, tokenId: childId });
          return true;
        }
      }

      if (segment === "commands") {
        if (request.method === "GET" && !childId) {
          json(response, 200, { commands: await applicationRepository.listCommands(applicationId) });
          return true;
        }
        if (request.method === "POST" && !childId) {
          try {
            const body = await readJson(request, 32 * 1024);
            const name = normalizeCommandName(body.name);
            const description = normalizeText(body.description, 100);
            const options = normalizeCommandOptions(body.options);
            if (!name || !description || (options !== undefined && !options)) {
              json(response, 400, { error: "Comando, descrição e opções precisam seguir o contrato da aplicação." });
              return true;
            }
            const command = await applicationRepository.createCommand({ applicationId, name, description, options });
            json(response, 201, { command });
          } catch {
            json(response, 409, { error: "Não foi possível criar o comando; o nome pode já estar em uso." });
          }
          return true;
        }
        if (request.method === "PATCH" && childId) {
          try {
            const body = await readJson(request, 32 * 1024);
            const name = body.name === undefined ? undefined : normalizeCommandName(body.name);
            const description = body.description === undefined ? undefined : normalizeText(body.description, 100);
            const options = normalizeCommandOptions(body.options);
            if ((body.name !== undefined && !name) || (body.description !== undefined && !description) || (options !== undefined && !options)) {
              json(response, 400, { error: "Comando, descrição e opções precisam seguir o contrato da aplicação." });
              return true;
            }
            const command = await applicationRepository.updateCommand({ applicationId, commandId: childId, name, description, options });
            if (!command) {
              json(response, 404, { error: "Comando não encontrado." });
              return true;
            }
            json(response, 200, { command });
          } catch {
            json(response, 409, { error: "Não foi possível atualizar o comando; o nome pode já estar em uso." });
          }
          return true;
        }
        if (request.method === "DELETE" && childId) {
          if (!await applicationRepository.deleteCommand(applicationId, childId)) {
            json(response, 404, { error: "Comando não encontrado." });
            return true;
          }
          json(response, 200, { ok: true, commandId: childId });
          return true;
        }
      }

      if (segment === "groups") {
        if (request.method === "GET" && !childId) {
          json(response, 200, { installations: await applicationRepository.listInstallations(applicationId) });
          return true;
        }
        if (childId && ["POST", "DELETE"].includes(request.method)) {
          const group = await groupSettingsRepository.findGroup(childId);
          if (!group) {
            json(response, 404, { error: "Grupo não encontrado." });
            return true;
          }
          if (group.ownerId !== context.user.id) {
            json(response, 403, { error: "Somente o dono do grupo pode instalar aplicações." });
            return true;
          }
          if (request.method === "POST") {
            const installation = await applicationRepository.installGroup({ applicationId, groupId: childId, installedBy: context.user.id });
            json(response, 201, { installation });
          } else {
            json(response, 200, { ok: await applicationRepository.uninstallGroup(applicationId, childId), groupId: childId });
          }
          return true;
        }
      }

      json(response, 405, { error: "Método ou subrota de aplicação não permitido." });
      return true;
    }

    if (requestUrl.pathname === "/api/bot/applications/commands" && request.method === "GET") {
      const token = botToken(request);
      const identity = token ? await applicationRepository.findByTokenHash(hashToken(token)) : null;
      if (!identity) {
        json(response, 401, { error: "Token de bot inválido ou revogado." });
        return true;
      }
      json(response, 200, {
        application: { id: identity.applicationId, name: identity.applicationName },
        bot: { id: identity.botUserId, username: identity.botUsername, displayName: identity.botDisplayName },
        commands: await applicationRepository.listCommands(identity.applicationId),
      });
      return true;
    }

    const botMessageMatch = requestUrl.pathname.match(/^\/api\/bot\/groups\/([A-Za-z0-9-]{1,64})\/messages$/);
    if (botMessageMatch && request.method === "POST") {
      const token = botToken(request);
      const identity = token ? await applicationRepository.findByTokenHash(hashToken(token)) : null;
      if (!identity) {
        json(response, 401, { error: "Token de bot inválido ou revogado." });
        return true;
      }
      const groupId = botMessageMatch[1];
      if (!await applicationRepository.findInstallation(identity.applicationId, groupId) || !await isGroupMember(identity.botUserId, groupId)) {
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

    return false;
  };
}
