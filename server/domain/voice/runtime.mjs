export function createVoiceRuntime({
  voiceRooms,
  send,
  compactAvatarData,
  debugLog,
  groupRoomRepository,
  isGroupMember,
  canGroupAction,
  canGroupRoomAction = canGroupAction,
}) {
  function voiceParticipantFor(socket) {
    return {
      id: socket.voiceClientId || socket.clientId,
      userId: socket.user?.id || null,
      displayName: socket.user?.displayName || "Participante",
      username: socket.user?.username || "participante",
      avatarData: compactAvatarData(socket.user?.avatarData),
      muted: Boolean(socket.voiceMuted || socket.voiceServerMuted),
      serverMuted: Boolean(socket.voiceServerMuted),
      deafened: Boolean(socket.voiceDeafened),
      speaking: Boolean(socket.voiceSpeaking),
    };
  }

  function broadcastVoice(voiceRoom, message) {
    for (const participant of voiceRoom?.participants?.values() || []) send(participant, message);
  }

  function leaveVoiceRoom(socket) {
    const voiceRoomId = socket.voiceRoomId;
    if (!voiceRoomId) return;
    const voiceRoom = voiceRooms.get(voiceRoomId);
    const participantId = socket.voiceClientId || socket.clientId;
    if (voiceRoom?.participants.get(participantId) === socket) {
      voiceRoom.participants.delete(participantId);
      for (const participant of voiceRoom.participants.values()) send(participant, { type: "voice-user-left", participantId, userId: socket.user?.id || null });
      if (voiceRoom.participants.size === 0) voiceRooms.delete(voiceRoomId);
      debugLog("voice_leave", { clientId: socket.clientId, voiceRoomId, participantId, participants: voiceRoom.participants.size });
    }
    socket.voiceRoomId = null;
    socket.voiceClientId = null;
    socket.voiceMuted = false;
    socket.voiceServerMuted = false;
    socket.voiceDeafened = false;
    socket.voiceSpeaking = false;
  }

  function removeDuplicateVoiceSessions(voiceRoom, socket) {
    const userId = socket.user?.id;
    if (!voiceRoom || !userId) return;
    for (const participant of [...voiceRoom.participants.values()]) {
      if (participant === socket || participant.user?.id !== userId) continue;
      send(participant, {
        type: "voice-disconnected",
        reason: "replaced",
        roomId: voiceRoom.id,
        message: "Sua sessão de voz foi substituída por uma nova conexão.",
      });
      leaveVoiceRoom(participant);
      // A conexão antiga já não participa da sala; encerrar o socket também
      // evita que uma janela em segundo plano mantenha um estado falso.
      setTimeout(() => {
        if (participant.readyState === 1) participant.close(4001, "Sessão de voz substituída");
      }, 100);
    }
  }

  function replaceOtherVoiceSessions(socket) {
    const userId = socket.user?.id;
    if (!userId) return;
    for (const room of voiceRooms.values()) {
      for (const participant of [...room.participants.values()]) {
        if (participant === socket || participant.user?.id !== userId) continue;
        send(participant, { type: "voice-disconnected", reason: "replaced", message: "Sua sessão de voz foi substituída por uma nova conexão." });
        leaveVoiceRoom(participant);
        if (participant.readyState === 1) participant.close(4001, "voice session replaced");
      }
    }
  }

  async function authorizeVoiceRoomJoin(voiceRoomId, groupId, socket) {
    if (!socket.user) return { ok: false, message: "Entre com sua conta para entrar numa sala de voz." };
    const room = await groupRoomRepository.findRoom(groupId, voiceRoomId);
    const voiceRoom = room?.kind === "voice" ? { ...room, groupId } : null;
    if (!voiceRoom || !await isGroupMember(socket.user.id, groupId)) return { ok: false, message: "Você não tem acesso a esta sala de voz." };
    if (!await canGroupRoomAction(socket.user.id, groupId, voiceRoomId, "canConnect")) return { ok: false, message: "Você não tem permissão para entrar nesta sala de voz." };
    return { ok: true, voiceRoom };
  }

  function voiceRoomFor(voiceRoomId, groupId = null) {
    if (!voiceRooms.has(voiceRoomId)) voiceRooms.set(voiceRoomId, { groupId, participants: new Map() });
    const room = voiceRooms.get(voiceRoomId);
    if (groupId) room.groupId = groupId;
    return room;
  }

  return {
    authorizeVoiceRoomJoin,
    broadcastVoice,
    leaveVoiceRoom,
    removeDuplicateVoiceSessions,
    replaceOtherVoiceSessions,
    voiceParticipantFor,
    voiceRoomFor,
  };
}
