export function createGroupContentRoutes({
  json,
  readJson,
  requireUser,
  isGroupMember,
  canGroupAction,
  groupMessageRepository,
  groupPermissionRepository,
  publishGroupEvent = () => {},
}) {
  return async function handleGroupContentRoutes(request, response, requestUrl) {
    const groupMessageMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/messages$/);
    if (groupMessageMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupMessageMatch[1];
      if (!isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      if (!canGroupAction(user.id, groupId, "canChat")) {
        json(response, 403, { error: "Você não tem permissão para enviar mensagens neste grupo." });
        return true;
      }
      readJson(request).then((body) => {
        const messageBody = String(body.body || "").trim().slice(0, 1000);
        if (!messageBody) return json(response, 400, { error: "Escreva uma mensagem antes de enviar." });
        const requestedRoomId = String(body.roomId || "");
        const room = groupMessageRepository.findTextRoom(groupId, requestedRoomId);
        if (requestedRoomId && !room) return json(response, 400, { error: "Essa sala não existe neste grupo." });
        if (room?.kind === "live") return json(response, 400, { error: "Salas de transmissão não recebem mensagens de chat." });
        const message = groupMessageRepository.createMessage({ groupId, roomId: room?.id || null, userId: user.id, body: messageBody, displayName: user.displayName, username: user.username, createdAt: new Date().toISOString() });
        publishGroupEvent(groupId, { type: "group-message", message });
        return json(response, 201, { message });
      }).catch(() => json(response, 400, { error: "Não foi possível enviar a mensagem." }));
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
