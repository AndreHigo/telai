import { publicAttachment } from "../media/attachments.mjs";

export function createGroupRuntimeRoutes({
  json,
  requireUser,
  groupJoinRequestRepository,
  groupSettingsRepository,
  groupRoomRepository,
  groupRoomReadRepository,
  groupMemberRepository,
  groupMessageRepository,
  groupAttachmentRepository,
  attachmentStorage,
  attachmentUrlFor = (groupId, attachmentId) => `/api/groups/${groupId}/attachments/${attachmentId}`,
  streamRepository,
  groupPermissions,
  isGroupMember,
  runtimeStreamIsLive,
  streamPublicPath,
  compactAvatarData,
  parseChannelGames,
  voiceRooms,
  send,
  leaveVoiceRoom,
  voiceParticipantFor,
  touchGroupPresence,
  isPresent,
  canGroupRoomAction = () => true,
}) {
  return async function handleGroupRuntimeRoutes(request, response, requestUrl) {
    const groupThreadMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/messages\/([\w-]{16,128})\/thread$/);
    if (groupThreadMatch && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, groupId, parentMessageId] = groupThreadMatch;
      if (!await isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      const parent = await groupMessageRepository.findMessage(groupId, parentMessageId);
      if (!parent || parent.parentMessageId) {
        json(response, 404, { error: "Mensagem principal não encontrada." });
        return true;
      }
      if (!await canGroupRoomAction(user.id, groupId, parent.roomId || null, "canView")) {
        json(response, 403, { error: "Você não tem permissão para visualizar este canal." });
        return true;
      }
      const decorate = (message) => ({
        ...message,
        attachments: (message.attachments || []).map((attachment) => publicAttachment(attachment, groupId, attachmentUrlFor)),
      });
      const parentWithAttachments = (await groupAttachmentRepository.attachToMessages(groupId, [parent]))[0];
      const threadMessages = await groupAttachmentRepository.attachToMessages(groupId, await groupMessageRepository.listThread(groupId, parent.id));
      json(response, 200, { parent: decorate(parentWithAttachments), messages: threadMessages.map(decorate) });
      return true;
    }

    const groupMessageSearchMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/messages\/search$/);
    if (groupMessageSearchMatch && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupMessageSearchMatch[1];
      if (!await isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      const query = String(requestUrl.searchParams.get("q") || "").trim().slice(0, 80);
      if (query.length < 2) {
        json(response, 400, { error: "Digite pelo menos 2 caracteres para buscar." });
        return true;
      }
      const requestedRoomId = String(requestUrl.searchParams.get("roomId") || "").trim();
      const room = requestedRoomId ? await groupRoomRepository.findRoom(groupId, requestedRoomId) : null;
      if (requestedRoomId && (!room || room.kind !== "text")) {
        json(response, 404, { error: "Canal de texto não encontrado." });
        return true;
      }
      if (room && !await canGroupRoomAction(user.id, groupId, room.id, "canView")) {
        json(response, 403, { error: "Você não tem permissão para visualizar este canal." });
        return true;
      }
      const messages = (await groupAttachmentRepository.attachToMessages(groupId, await groupMessageRepository.searchMessages({ groupId, query, roomId: room?.id || null, limit: 50 })))
        .map((message) => ({ ...message, attachments: message.attachments.map((attachment) => publicAttachment(attachment, groupId, attachmentUrlFor)) }));
      json(response, 200, { query, roomId: room?.id || null, messages });
      return true;
    }

    const groupRoomReadMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/rooms\/([\w-]{1,64})\/read$/);
    if (groupRoomReadMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, groupId, roomId] = groupRoomReadMatch;
      if (!await isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      const room = await groupRoomRepository.findRoom(groupId, roomId);
      if (!room || room.kind !== "text") {
        json(response, 404, { error: "Canal de texto não encontrado." });
        return true;
      }
      if (!await canGroupRoomAction(user.id, groupId, room.id, "canView")) {
        json(response, 403, { error: "Você não tem permissão para visualizar este canal." });
        return true;
      }
      const readAt = new Date().toISOString();
      const state = await groupRoomReadRepository.markRead({ groupId, userId: user.id, roomId: room.slug === "geral" ? null : room.id, readAt });
      json(response, 200, { ok: true, ...state });
      return true;
    }

    const groupDeleteMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})$/);
    if (groupDeleteMatch && request.method === "DELETE") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupDeleteMatch[1];
      const group = await groupJoinRequestRepository.findGroup(groupId);
      if (!group) {
        json(response, 404, { error: "Grupo não encontrado." });
        return true;
      }
      if (group.ownerId !== user.id) {
        json(response, 403, { error: "Somente o dono pode excluir este grupo." });
        return true;
      }
      for (const [voiceRoomId, voiceRoom] of voiceRooms) {
        if (voiceRoom.groupId !== groupId) continue;
        for (const participant of [...voiceRoom.participants.values()]) {
          send(participant, { type: "voice-disconnected", message: "O grupo foi excluído pelo proprietário." });
          leaveVoiceRoom(participant);
        }
        voiceRooms.delete(voiceRoomId);
      }
      const attachments = await groupAttachmentRepository.listForGroup(groupId);
      await groupSettingsRepository.deleteGroup(groupId);
      await Promise.all(attachments.map((attachment) => attachmentStorage.remove(attachment.storageKey).catch(() => {})));
      json(response, 200, { ok: true, group: { id: group.id, name: group.name } });
      return true;
    }

    const groupOverviewMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/overview$/);
    if (groupOverviewMatch && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupOverviewMatch[1];
      if (!await isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      await touchGroupPresence(groupId, user.id);
      const group = await groupSettingsRepository.findGroup(groupId);
      if (!group) {
        json(response, 404, { error: "Grupo não encontrado." });
        return true;
      }
      const unreadCounts = await groupRoomReadRepository.listUnreadCounts(groupId, user.id);
      const textRooms = await groupRoomRepository.listTextRooms(groupId);
      const visibleTextRooms = (await Promise.all(textRooms.map(async (room) => (await canGroupRoomAction(user.id, groupId, room.id, "canView")) ? room : null))).filter(Boolean);
      const rooms = visibleTextRooms.map((room) => ({
        ...room,
        unreadCount: unreadCounts[room.slug === "geral" ? "__general__" : room.id] || 0,
      }));
      const voiceRoomsForGroup = (await Promise.all((await groupRoomRepository.listVoiceRooms(groupId)).map(async (room) => {
        if (!await canGroupRoomAction(user.id, groupId, room.id, "canView")) return null;
        const runtimeRoom = voiceRooms.get(room.id);
        const canView = (await groupPermissions(groupId, user.id))?.canViewVoiceMembers !== false;
        return { ...room, participants: canView ? [...(runtimeRoom?.participants?.values() || [])].map(voiceParticipantFor) : [] };
      }))).filter(Boolean);
      rooms.push(...voiceRoomsForGroup);
      rooms.sort((left, right) => {
        const order = { text: 0, live: 1, voice: 2 };
        return (order[left.kind] ?? 9) - (order[right.kind] ?? 9) || String(left.name).localeCompare(String(right.name), "pt-BR");
      });
      const members = (await groupMemberRepository.listMembers(groupId)).map((member) => ({ ...member, online: isPresent(groupId, member.id) }));
      const visibleRoomIds = new Set(rooms.filter((room) => room.kind === "text").map((room) => room.id));
      const messages = requestUrl.searchParams.get("includeMessages") === "0"
        ? undefined
        : (await groupAttachmentRepository.attachToMessages(groupId, (await groupMessageRepository.listMessages(groupId)).filter((message) => !message.roomId || visibleRoomIds.has(message.roomId))))
          .map((message) => ({ ...message, attachments: message.attachments.map((attachment) => publicAttachment(attachment, groupId, attachmentUrlFor)) }));
      const streams = (await Promise.all((await streamRepository.listGroupStreams(groupId)).map(async (stream) => (await runtimeStreamIsLive(stream)) ? stream : null))).filter(Boolean);
      json(response, 200, {
        group,
        rooms,
        members: members.map((member) => ({ ...member, avatarData: compactAvatarData(member.avatarData) })),
        messages,
        streams: streams.map((stream) => ({ ...stream, channelAvatarData: compactAvatarData(stream.channelAvatarData), channelGames: parseChannelGames(stream.channelGames), publicPath: streamPublicPath(stream) })),
      });
      return true;
    }

    const groupPresenceMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/presence$/);
    if (groupPresenceMatch && ["GET", "POST"].includes(request.method)) {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupPresenceMatch[1];
      if (!await isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      await touchGroupPresence(groupId, user.id);
      if (request.method === "POST") {
        json(response, 200, { ok: true });
        return true;
      }
      const members = (await groupMemberRepository.listMemberIds(groupId)).map((id) => ({ id, online: isPresent(groupId, id) }));
      json(response, 200, { groupId, members });
      return true;
    }

    return false;
  };
}
