export function createGroupRuntimeRoutes({
  json,
  requireUser,
  groupJoinRequestRepository,
  groupSettingsRepository,
  groupRoomRepository,
  groupMemberRepository,
  groupMessageRepository,
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
    const groupDeleteMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})$/);
    if (groupDeleteMatch && request.method === "DELETE") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupDeleteMatch[1];
      const group = groupJoinRequestRepository.findGroup(groupId);
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
      groupSettingsRepository.deleteGroup(groupId);
      json(response, 200, { ok: true, group: { id: group.id, name: group.name } });
      return true;
    }

    const groupOverviewMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/overview$/);
    if (groupOverviewMatch && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupOverviewMatch[1];
      if (!isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      touchGroupPresence(groupId, user.id);
      const group = groupSettingsRepository.findGroup(groupId);
      if (!group) {
        json(response, 404, { error: "Grupo não encontrado." });
        return true;
      }
      const rooms = groupRoomRepository.listTextRooms(groupId).filter((room) => canGroupRoomAction(user.id, groupId, room.id, "canView"));
      const voiceRoomsForGroup = groupRoomRepository.listVoiceRooms(groupId).filter((room) => canGroupRoomAction(user.id, groupId, room.id, "canView")).map((room) => {
        const runtimeRoom = voiceRooms.get(room.id);
        const canView = groupPermissions(groupId, user.id)?.canViewVoiceMembers !== false;
        return { ...room, participants: canView ? [...(runtimeRoom?.participants?.values() || [])].map(voiceParticipantFor) : [] };
      });
      rooms.push(...voiceRoomsForGroup);
      rooms.sort((left, right) => {
        const order = { text: 0, live: 1, voice: 2 };
        return (order[left.kind] ?? 9) - (order[right.kind] ?? 9) || String(left.name).localeCompare(String(right.name), "pt-BR");
      });
      const members = groupMemberRepository.listMembers(groupId).map((member) => ({ ...member, online: isPresent(groupId, member.id) }));
      const visibleRoomIds = new Set(rooms.filter((room) => room.kind === "text").map((room) => room.id));
      const messages = requestUrl.searchParams.get("includeMessages") === "0"
        ? undefined
        : groupMessageRepository.listMessages(groupId).filter((message) => !message.roomId || visibleRoomIds.has(message.roomId));
      const streams = streamRepository.listGroupStreams(groupId).filter(runtimeStreamIsLive);
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
      if (!isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      touchGroupPresence(groupId, user.id);
      if (request.method === "POST") {
        json(response, 200, { ok: true });
        return true;
      }
      const members = groupMemberRepository.listMemberIds(groupId).map((id) => ({ id, online: isPresent(groupId, id) }));
      json(response, 200, { groupId, members });
      return true;
    }

    return false;
  };
}
