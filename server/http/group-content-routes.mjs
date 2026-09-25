import { randomUUID } from "node:crypto";
import { attachmentContentDisposition, normalizeMessageAttachments, publicAttachment } from "../media/attachments.mjs";

export function createGroupContentRoutes({
  json,
  readJson,
  requireUser,
  isGroupMember,
  canGroupAction,
  canGroupRoomAction = canGroupAction,
  groupMessageRepository,
  groupAttachmentRepository,
  attachmentStorage,
  attachmentUrlFor = (groupId, attachmentId) => `/api/groups/${groupId}/attachments/${attachmentId}`,
  groupPermissionRepository,
  groupModerationRepository,
  publishGroupEvent = () => {},
}) {
  return async function handleGroupContentRoutes(request, response, requestUrl) {
    const groupAttachmentMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/attachments\/([\w-]{16,64})$/);
    if (groupAttachmentMatch && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, groupId, attachmentId] = groupAttachmentMatch;
      if (!isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      const attachment = groupAttachmentRepository.find(groupId, attachmentId);
      if (!attachment) {
        json(response, 404, { error: "Anexo não encontrado." });
        return true;
      }
      try {
        const content = await attachmentStorage.read(attachment.storageKey);
        response.writeHead(200, {
          "Content-Type": attachment.mimeType,
          "Content-Length": String(content.length),
          "Content-Disposition": `${attachmentContentDisposition(attachment.mimeType)}; filename="${attachment.name.replace(/["\\\r\n]/g, "_")}"`,
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        }).end(content);
      } catch {
        json(response, 404, { error: "Arquivo do anexo não encontrado." });
      }
      return true;
    }

    const groupMessageMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/messages$/);
    if (groupMessageMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupMessageMatch[1];
      if (!isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      if (groupModerationRepository?.isMuted(groupId, user.id)) {
        json(response, 403, { error: "Você está silenciado neste grupo." });
        return true;
      }
      if (!canGroupAction(user.id, groupId, "canChat")) {
        json(response, 403, { error: "Você não tem permissão para enviar mensagens neste grupo." });
        return true;
      }
      try {
        const body = await readJson(request, 30 * 1024 * 1024);
        const messageBody = String(body.body || "").trim().slice(0, 1000);
        const attachments = normalizeMessageAttachments(body.attachments);
        if (!messageBody && !attachments.length) {
          json(response, 400, { error: "Escreva uma mensagem ou escolha um anexo antes de enviar." });
          return true;
        }
        const requestedRoomId = String(body.roomId || "");
        const room = groupMessageRepository.findTextRoom(groupId, requestedRoomId);
        if (requestedRoomId && !room) {
          json(response, 400, { error: "Essa sala não existe neste grupo." });
          return true;
        }
        if (room?.kind === "live") {
          json(response, 400, { error: "Salas de transmissão não recebem mensagens de chat." });
          return true;
        }
        if (!canGroupRoomAction(user.id, groupId, room?.id || null, "canChat")) {
          json(response, 403, { error: "Você não tem permissão para conversar neste canal." });
          return true;
        }
        const stored = [];
        let createdMessage = null;
        try {
          for (const attachment of attachments) {
            const id = randomUUID();
            const storageKey = await attachmentStorage.write({ attachmentId: id, mimeType: attachment.mimeType, buffer: attachment.buffer });
            stored.push({ ...attachment, id, storageKey });
          }
          const createdAt = new Date().toISOString();
          createdMessage = groupMessageRepository.createMessage({ groupId, roomId: room?.id || null, userId: user.id, body: messageBody, displayName: user.displayName, username: user.username, createdAt });
          const rows = groupAttachmentRepository.createAttachments({ groupId, messageId: createdMessage.id, attachments: stored, createdAt });
          createdMessage.attachments = rows.map((attachment) => publicAttachment(attachment, groupId, attachmentUrlFor));
          publishGroupEvent(groupId, { type: "group-message", message: createdMessage });
          json(response, 201, { message: createdMessage });
        } catch (error) {
          if (createdMessage?.id) {
            try { groupMessageRepository.deleteMessage(groupId, createdMessage.id); } catch {}
          }
          await Promise.all(stored.map((attachment) => attachmentStorage.remove(attachment.storageKey).catch(() => {})));
          throw error;
        }
      } catch {
        json(response, 400, { error: "Não foi possível enviar a mensagem ou seus anexos." });
      }
      return true;
    }

    const groupMessageMutationMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/messages\/([\w-]{1,128})$/);
    if (groupMessageMutationMatch && ["PATCH", "DELETE"].includes(request.method)) {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupMessageMutationMatch[1];
      const messageId = groupMessageMutationMatch[2];
      if (!isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      const message = groupMessageRepository.findMessage(groupId, messageId);
      if (!message) {
        json(response, 404, { error: "Mensagem não encontrada." });
        return true;
      }
      const membership = groupPermissionRepository.member(groupId, user.id);
      const canModerate = membership?.role === "owner";
      if (message.userId !== user.id && !canModerate) {
        json(response, 403, { error: "Você só pode alterar suas próprias mensagens." });
        return true;
      }
      if (request.method === "DELETE") {
        const attachments = groupAttachmentRepository.listForMessage(groupId, messageId);
        if (!groupMessageRepository.deleteMessage(groupId, messageId)) {
          json(response, 404, { error: "Mensagem não encontrada." });
          return true;
        }
        await Promise.all(attachments.map((attachment) => attachmentStorage.remove(attachment.storageKey).catch(() => {})));
        publishGroupEvent(groupId, { type: "group-message-deleted", messageId, roomId: message.roomId || null });
        json(response, 200, { ok: true, messageId });
        return true;
      }
      try {
        const body = await readJson(request, 12 * 1024);
        const nextBody = String(body.body || "").trim().slice(0, 1000);
        if (!nextBody) {
          json(response, 400, { error: "A mensagem não pode ficar vazia." });
          return true;
        }
        const updated = groupMessageRepository.updateMessage({ groupId, messageId, body: nextBody });
        if (!updated) {
          json(response, 404, { error: "Mensagem não encontrada." });
          return true;
        }
        const attachments = groupAttachmentRepository.listForMessage(groupId, updated.id);
        const publicUpdated = { ...updated, attachments: attachments.map((attachment) => publicAttachment(attachment, groupId, attachmentUrlFor)) };
        publishGroupEvent(groupId, { type: "group-message-updated", message: publicUpdated });
        json(response, 200, { message: publicUpdated });
      } catch {
        json(response, 400, { error: "Não foi possível editar a mensagem." });
      }
      return true;
    }

    const groupPermissionsMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/permissions$/);
    if (groupPermissionsMatch && request.method === "PATCH") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupPermissionsMatch[1];
      const owner = groupPermissionRepository.member(groupId, user.id);
      if (owner?.role !== "owner") {
        json(response, 403, { error: "Somente o dono pode alterar permissões." });
        return true;
      }
      readJson(request).then((body) => {
        const memberId = String(body.userId || "");
        const member = groupPermissionRepository.member(groupId, memberId);
        if (!member) return json(response, 404, { error: "Membro não encontrado neste grupo." });
        if (member.role === "owner") return json(response, 400, { error: "As permissões do dono são sempre completas." });
        const canChat = body.canChat === false ? 0 : 1;
        const canStream = body.canStream === false ? 0 : 1;
        const canInvite = body.canInvite === false ? 0 : 1;
        groupPermissionRepository.ensure(groupId, memberId);
        const currentPermissions = groupPermissionRepository.current(groupId, memberId);
        const canViewVoiceMembers = body.canViewVoiceMembers === undefined
          ? (currentPermissions?.canViewVoiceMembers ?? 1)
          : body.canViewVoiceMembers === false ? 0 : 1;
        return json(response, 200, { permissions: groupPermissionRepository.update({ groupId, userId: memberId, canChat, canStream, canInvite, canViewVoiceMembers }) });
      }).catch(() => json(response, 400, { error: "Não foi possível atualizar as permissões." }));
      return true;
    }

    return false;
  };
}
