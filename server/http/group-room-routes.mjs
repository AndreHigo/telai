export function createGroupRoomRoutes({
  json,
  readJson,
  requireUser,
  isGroupMember,
  canGroupAction,
  groupPermissionRepository,
  groupRoomRepository,
  roomSlugFor,
  parseVoiceRoomParticipantLimit,
}) {
  return async function handleGroupRoomRoutes(request, response, requestUrl) {
    const groupRoomsMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/rooms$/);
    if (groupRoomsMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupRoomsMatch[1];
      if (!isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      readJson(request).then((body) => {
        const name = String(body.name || "").trim().slice(0, 48);
        const slug = roomSlugFor(body.slug || name);
        const kind = body.kind === "voice" ? "voice" : body.kind === "text" ? "text" : null;
        if (!kind) return json(response, 400, { error: "Escolha uma sala de texto ou de voz." });
        if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para a sala." });
        const maxParticipants = kind === "voice" ? parseVoiceRoomParticipantLimit(body.maxParticipants) : null;
        if (kind === "voice" && !canGroupAction(user.id, groupId, "canChat")) return json(response, 403, { error: "Você não tem permissão para criar salas de voz." });
        try {
          const duplicate = groupRoomRepository.findBySlug(groupId, slug);
          if (duplicate) return json(response, 409, { error: "Já existe uma sala com esse nome neste grupo." });
          const room = groupRoomRepository.createRoom({ groupId, name, slug, kind, maxParticipants, createdBy: user.id });
          return json(response, 201, { room });
        } catch (error) {
          if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Já existe uma sala com esse nome neste grupo." });
          throw error;
        }
      }).catch(() => json(response, 400, { error: "Não foi possível criar a sala." }));
      return true;
    }

    const groupRoomActionMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/rooms\/([\w-]{1,64})$/);
    if (groupRoomActionMatch && ["PATCH", "DELETE"].includes(request.method)) {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, groupId, roomId] = groupRoomActionMatch;
      const member = groupPermissionRepository.member(groupId, user.id);
      if (member?.role !== "owner") {
        json(response, 403, { error: "Somente o dono pode gerenciar canais." });
        return true;
      }
      const room = groupRoomRepository.findRoom(groupId, roomId);
      if (!room) {
        json(response, 404, { error: "Canal não encontrado." });
        return true;
      }
      if (room.slug === "geral") {
        json(response, 400, { error: "O canal Geral não pode ser alterado ou excluído." });
        return true;
      }
      if (request.method === "DELETE") {
        groupRoomRepository.deleteRoom(groupId, roomId, room.kind);
        json(response, 200, { ok: true });
        return true;
      }
      readJson(request).then((body) => {
        const name = String(body.name || "").trim().slice(0, 48);
        const slug = roomSlugFor(name);
        if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para o canal." });
        const duplicate = groupRoomRepository.findBySlug(groupId, slug, roomId);
        if (duplicate) return json(response, 409, { error: "Já existe um canal com esse nome neste grupo." });
        if (room.kind === "voice") {
          const maxParticipants = parseVoiceRoomParticipantLimit(body.maxParticipants, room.maxParticipants);
          return json(response, 200, { room: groupRoomRepository.updateRoom({ groupId, roomId, kind: room.kind, name, slug, maxParticipants }) });
        }
        return json(response, 200, { room: groupRoomRepository.updateRoom({ groupId, roomId, kind: room.kind, name, slug }) });
      }).catch(() => json(response, 400, { error: "Não foi possível atualizar o canal." }));
      return true;
    }

    return false;
  };
}
