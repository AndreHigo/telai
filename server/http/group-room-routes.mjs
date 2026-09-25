export function createGroupRoomRoutes({
  json,
  readJson,
  requireUser,
  isGroupMember,
  canGroupAction,
  groupRoleRepository,
  groupRoomPermissionRepository,
  groupPermissionRepository,
  groupRoomRepository,
  groupAuditRepository,
  roomSlugFor,
  parseVoiceRoomParticipantLimit,
}) {
  return async function handleGroupRoomRoutes(request, response, requestUrl) {
    const groupRoomsMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/rooms$/);
    if (groupRoomsMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupRoomsMatch[1];
      if (!await isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      try {
        const body = await readJson(request);
        const name = String(body.name || "").trim().slice(0, 48);
        const slug = roomSlugFor(body.slug || name);
        const kind = body.kind === "voice" ? "voice" : body.kind === "text" ? "text" : null;
        if (!kind) return json(response, 400, { error: "Escolha uma sala de texto ou de voz." });
        if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para a sala." });
        const maxParticipants = kind === "voice" ? parseVoiceRoomParticipantLimit(body.maxParticipants) : null;
        if (kind === "voice" && !await canGroupAction(user.id, groupId, "canChat")) return json(response, 403, { error: "Você não tem permissão para criar salas de voz." });
        try {
          const duplicate = await groupRoomRepository.findBySlug(groupId, slug);
          if (duplicate) return json(response, 409, { error: "Já existe uma sala com esse nome neste grupo." });
          const room = await groupRoomRepository.createRoom({ groupId, name, slug, kind, maxParticipants, createdBy: user.id });
          await groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "room_create", targetType: "room", targetId: room.id, metadata: { name: room.name, kind: room.kind } });
          return json(response, 201, { room });
        } catch (error) {
          if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Já existe uma sala com esse nome neste grupo." });
          throw error;
        }
      } catch {
        return json(response, 400, { error: "Não foi possível criar a sala." });
      }
      return true;
    }

    const groupRoomActionMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/rooms\/([\w-]{1,64})$/);
    if (groupRoomActionMatch && ["PATCH", "DELETE"].includes(request.method)) {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, groupId, roomId] = groupRoomActionMatch;
      const member = await groupPermissionRepository.member(groupId, user.id);
      if (member?.role !== "owner") {
        json(response, 403, { error: "Somente o dono pode gerenciar canais." });
        return true;
      }
      const room = await groupRoomRepository.findRoom(groupId, roomId);
      if (!room) {
        json(response, 404, { error: "Canal não encontrado." });
        return true;
      }
      if (room.slug === "geral") {
        json(response, 400, { error: "O canal Geral não pode ser alterado ou excluído." });
        return true;
      }
      if (request.method === "DELETE") {
        await groupRoomRepository.deleteRoom(groupId, roomId, room.kind);
        await groupRoomPermissionRepository.removeForRoom(groupId, roomId);
        await groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "room_delete", targetType: "room", targetId: roomId, metadata: { name: room.name, kind: room.kind } });
        json(response, 200, { ok: true });
        return true;
      }
      try {
        const body = await readJson(request);
        const name = String(body.name || "").trim().slice(0, 48);
        const slug = roomSlugFor(name);
        if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para o canal." });
        const duplicate = await groupRoomRepository.findBySlug(groupId, slug, roomId);
        if (duplicate) return json(response, 409, { error: "Já existe um canal com esse nome neste grupo." });
        if (room.kind === "voice") {
          const maxParticipants = parseVoiceRoomParticipantLimit(body.maxParticipants, room.maxParticipants);
          const updatedRoom = await groupRoomRepository.updateRoom({ groupId, roomId, kind: room.kind, name, slug, maxParticipants });
          await groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "room_update", targetType: "room", targetId: roomId, metadata: { name, kind: room.kind } });
          return json(response, 200, { room: updatedRoom });
        }
        const updatedRoom = await groupRoomRepository.updateRoom({ groupId, roomId, kind: room.kind, name, slug });
        await groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "room_update", targetType: "room", targetId: roomId, metadata: { name, kind: room.kind } });
        return json(response, 200, { room: updatedRoom });
      } catch {
        return json(response, 400, { error: "Não foi possível atualizar o canal." });
      }
      return true;
    }

    const groupRoomPermissionsMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/rooms\/([\w-]{1,64})\/permissions$/);
    if (groupRoomPermissionsMatch && ["GET", "PATCH", "DELETE"].includes(request.method)) {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, groupId, roomId] = groupRoomPermissionsMatch;
      const member = await groupPermissionRepository.member(groupId, user.id);
      if (member?.role !== "owner") {
        json(response, 403, { error: "Somente o dono pode gerenciar permissões de canais." });
        return true;
      }
      const room = await groupRoomRepository.findRoom(groupId, roomId);
      if (!room) {
        json(response, 404, { error: "Canal não encontrado." });
        return true;
      }
      if (request.method === "GET") {
        json(response, 200, { permissions: await groupRoomPermissionRepository.list(groupId, roomId) });
        return true;
      }
      try {
        const body = request.method === "DELETE" ? {} : await readJson(request, 8 * 1024);
        const roleId = String(body.roleId || requestUrl.searchParams.get("roleId") || "").trim();
        const role = await groupRoleRepository.findRole(groupId, roleId);
        if (!role) {
          json(response, 404, { error: "Cargo não encontrado neste grupo." });
          return true;
        }
        if (request.method === "DELETE" || body.reset === true) {
          await groupRoomPermissionRepository.remove(groupId, roomId, roleId);
          await groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "room_permission_reset", targetType: "room", targetId: roomId, metadata: { roleId } });
          json(response, 200, { ok: true, roleId });
          return true;
        }
        const permission = await groupRoomPermissionRepository.save({
          groupId,
          roomId,
          roleId,
          canView: body.canView !== false,
          canChat: body.canChat !== false,
          canConnect: body.canConnect !== false,
        });
        await groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "room_permission_update", targetType: "room", targetId: roomId, metadata: { roleId, canView: permission.canView, canChat: permission.canChat, canConnect: permission.canConnect } });
        json(response, 200, { permission });
      } catch {
        json(response, 400, { error: "Não foi possível atualizar as permissões do canal." });
      }
      return true;
    }

    return false;
  };
}
