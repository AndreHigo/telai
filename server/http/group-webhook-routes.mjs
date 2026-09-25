function publicWebhook(webhook, request, publicOriginForRequest) {
  const origin = publicOriginForRequest?.(request) || "";
  const path = `/api/webhooks/${encodeURIComponent(webhook.id)}`;
  return {
    id: webhook.id,
    groupId: webhook.groupId,
    roomId: webhook.roomId,
    name: webhook.name,
    createdBy: webhook.createdBy,
    createdAt: webhook.createdAt,
    lastUsedAt: webhook.lastUsedAt || null,
    url: origin ? `${origin}${path}/<token>` : `${path}/<token>`,
  };
}

function normalizeName(value, fallback = "Telai Webhook") {
  const name = String(value || fallback).trim().replace(/\s+/g, " ").slice(0, 64);
  return name || fallback;
}

function normalizeContent(value) {
  return String(value || "").trim().slice(0, 2000);
}

export function createGroupWebhookRoutes({
  json,
  readJson,
  requireUser,
  groupSettingsRepository,
  groupRoomRepository,
  groupMessageRepository,
  groupWebhookRepository,
  hashToken,
  createToken,
  publishGroupEvent = () => {},
  publicOriginForRequest,
}) {
  async function requireOwner(request, response, groupId) {
    const user = await requireUser(request, response);
    if (!user) return null;
    const group = await groupSettingsRepository.findGroup(groupId);
    if (!group) {
      json(response, 404, { error: "Grupo não encontrado." });
      return null;
    }
    if (group.ownerId !== user.id) {
      json(response, 403, { error: "Somente o dono do grupo pode administrar webhooks." });
      return null;
    }
    return { user, group };
  }

  return async function handleGroupWebhookRoutes(request, response, requestUrl) {
    const managementMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/webhooks(?:\/([\w-]{16,64}))?$/);
    if (managementMatch && ["GET", "POST", "DELETE"].includes(request.method)) {
      const [, groupId, webhookId] = managementMatch;
      const context = await requireOwner(request, response, groupId);
      if (!context) return true;

      if (request.method === "GET") {
        json(response, 200, { webhooks: (await groupWebhookRepository.list(groupId)).map((webhook) => publicWebhook(webhook, request, publicOriginForRequest)) });
        return true;
      }

      if (request.method === "DELETE") {
        if (!webhookId) {
          json(response, 400, { error: "Informe o webhook que será excluído." });
          return true;
        }
        if (!await groupWebhookRepository.remove(groupId, webhookId)) {
          json(response, 404, { error: "Webhook não encontrado." });
          return true;
        }
        json(response, 200, { ok: true, webhookId });
        return true;
      }

      if (webhookId) {
        json(response, 405, { error: "Método não permitido para este webhook." });
        return true;
      }
      try {
        const body = await readJson(request, 16 * 1024);
        const roomId = String(body.roomId || "").trim();
        const room = await groupRoomRepository.findRoom(groupId, roomId);
        if (!room || room.kind !== "text") {
          json(response, 400, { error: "Escolha uma sala de texto válida para o webhook." });
          return true;
        }
        const token = createToken();
        const webhook = await groupWebhookRepository.create({
          groupId,
          roomId,
          name: normalizeName(body.name),
          tokenHash: hashToken(token),
          createdBy: context.user.id,
        });
        const origin = publicOriginForRequest?.(request) || "";
        const path = `/api/webhooks/${encodeURIComponent(webhook.id)}/${encodeURIComponent(token)}`;
        json(response, 201, { webhook: { ...publicWebhook(webhook, request, publicOriginForRequest), token, url: `${origin}${path}` } });
      } catch {
        json(response, 400, { error: "Não foi possível criar o webhook." });
      }
      return true;
    }

    const executeMatch = requestUrl.pathname.match(/^\/api\/webhooks\/([\w-]{16,64})\/([A-Za-z0-9_-]{32,128})$/);
    if (executeMatch && request.method === "POST") {
      const [, webhookId, token] = executeMatch;
      const webhook = await groupWebhookRepository.findByTokenHash(hashToken(token));
      if (!webhook || webhook.id !== webhookId) {
        json(response, 404, { error: "Webhook não encontrado." });
        return true;
      }
      try {
        const room = await groupRoomRepository.findRoom(webhook.groupId, webhook.roomId);
        if (!room || room.kind !== "text") {
          json(response, 404, { error: "A sala deste webhook não existe mais." });
          return true;
        }
        const body = await readJson(request, 32 * 1024);
        const content = normalizeContent(body.content ?? body.body);
        if (!content) {
          json(response, 400, { error: "Envie um conteúdo não vazio." });
          return true;
        }
        const displayName = normalizeName(body.username, webhook.name);
        const message = await groupMessageRepository.createMessage({
          groupId: webhook.groupId,
          roomId: webhook.roomId,
          userId: webhook.createdBy,
          body: content,
          displayName,
          username: webhook.name,
          authorDisplayName: displayName,
          authorUsername: webhook.name,
        });
        message.attachments = [];
        await groupWebhookRepository.touch(webhook.id);
        await publishGroupEvent(webhook.groupId, { type: "group-message", message });
        json(response, 201, { message });
      } catch {
        json(response, 400, { error: "Não foi possível executar o webhook." });
      }
      return true;
    }

    return false;
  };
}
