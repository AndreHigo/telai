import { randomUUID } from "node:crypto";

function normalizeText(value, maxLength) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
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
    if (applicationMatch && ["GET", "POST", "DELETE"].includes(request.method)) {
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
