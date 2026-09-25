export function createVoiceMessageHandler({
  send,
  voiceRooms,
  authorizeVoiceRoomJoin,
  voiceRoomFor,
  parseVoiceRoomParticipantLimit,
  replaceOtherVoiceSessions,
  leaveVoiceRoom,
  removeDuplicateVoiceSessions,
  randomUUID,
  voiceParticipantFor,
  infoLog,
  canGroupAction,
  groupRoomRepository,
  broadcastVoice,
  allowVoiceSpeakingUpdate,
  reportVoiceSpeakingRateLimited,
  normalizeRtcSignalPayload,
}) {
  return function handleVoiceMessage(socket, message) {
    if (message.type === "voice-join") {
      const voiceRoomId = String(message.voiceRoomId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      const groupId = String(message.groupId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      if (voiceRoomId.length < 12 || groupId.length < 12) {
        send(socket, { type: "error", message: "Sala de voz inválida." });
        return true;
      }
      const authorization = authorizeVoiceRoomJoin(voiceRoomId, groupId, socket);
      if (!authorization.ok) {
        send(socket, { type: "error", message: authorization.message });
        return true;
      }
      const voiceRoom = voiceRoomFor(voiceRoomId, groupId);
      const maxParticipants = parseVoiceRoomParticipantLimit(authorization.voiceRoom.maxParticipants);
      // Valide a capacidade antes de substituir a eventual sessão de voz
      // anterior desta conta. Assim, tentar entrar numa sala cheia não derruba
      // a conexão que ainda estava funcionando em outra sala.
      const currentUserId = socket.user?.id || null;
      const occupiedByOtherUsers = [...voiceRoom.participants.values()]
        .filter((participant) => participant.user?.id !== currentUserId)
        .length;
      if (occupiedByOtherUsers >= maxParticipants) {
        send(socket, { type: "voice-error", message: `Esta sala de voz atingiu o limite de ${maxParticipants} participante${maxParticipants === 1 ? "" : "s"}.` });
        return true;
      }
      replaceOtherVoiceSessions(socket);
      leaveVoiceRoom(socket);
      removeDuplicateVoiceSessions(voiceRoom, socket);
      socket.voiceRoomId = voiceRoomId;
      socket.voiceClientId = randomUUID();
      socket.voiceMuted = false;
      socket.voiceServerMuted = false;
      socket.voiceDeafened = false;
      socket.voiceSpeaking = false;
      const participant = voiceParticipantFor(socket);
      const existingParticipants = [...voiceRoom.participants.values()].map(voiceParticipantFor);
      voiceRoom.participants.set(socket.voiceClientId, socket);
      send(socket, { type: "voice-joined", voiceRoomId, clientId: socket.voiceClientId, participants: existingParticipants });
      for (const existing of voiceRoom.participants.values()) {
        if (existing !== socket) send(existing, { type: "voice-user-joined", participant });
      }
      infoLog("voice_join", { clientId: socket.clientId, voiceRoomId, participants: voiceRoom.participants.size });
      return true;
    }

    if (message.type === "voice-move") {
      const sourceRoom = voiceRooms.get(socket.voiceRoomId);
      const participantId = String(message.participantId || "");
      const targetRoomId = String(message.targetRoomId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      const movingParticipant = sourceRoom?.participants.get(participantId);
      const groupId = sourceRoom?.groupId;
      if (!sourceRoom || !movingParticipant || !groupId || !socket.user || !canGroupAction(socket.user.id, groupId, "canMoveMembers")) {
        send(socket, { type: "voice-error", action: "move", message: "Você não tem permissão para mover pessoas entre salas." });
        return true;
      }
      const targetRoomRecord = groupRoomRepository.findVoiceRoomById(targetRoomId);
      if (!targetRoomRecord || targetRoomRecord.groupId !== groupId) {
        send(socket, { type: "voice-error", action: "move", message: "A sala de destino não pertence a este grupo." });
        return true;
      }
      if (targetRoomId === socket.voiceRoomId) return true;
      const targetRoom = voiceRoomFor(targetRoomId, groupId);
      const targetMaxParticipants = parseVoiceRoomParticipantLimit(targetRoomRecord.maxParticipants);
      if (targetRoom.participants.size >= targetMaxParticipants) {
        send(socket, { type: "voice-error", action: "move", message: `A sala de destino atingiu o limite de ${targetMaxParticipants} participante${targetMaxParticipants === 1 ? "" : "s"}.` });
        return true;
      }

      const previousRoomId = movingParticipant.voiceRoomId;
      const movingUserId = movingParticipant.user?.id || null;
      sourceRoom.participants.delete(participantId);
      for (const participant of sourceRoom.participants.values()) send(participant, { type: "voice-user-left", participantId, userId: movingUserId });
      if (sourceRoom.participants.size === 0) voiceRooms.delete(previousRoomId);

      movingParticipant.voiceRoomId = targetRoomId;
      movingParticipant.voiceClientId = randomUUID();
      movingParticipant.voiceSpeaking = false;
      const participant = voiceParticipantFor(movingParticipant);
      const existingParticipants = [...targetRoom.participants.values()].map(voiceParticipantFor);
      targetRoom.participants.set(movingParticipant.voiceClientId, movingParticipant);
      send(movingParticipant, { type: "voice-moved", voiceRoomId: targetRoomId, clientId: movingParticipant.voiceClientId, participants: existingParticipants, previousRoomId, muted: Boolean(movingParticipant.voiceMuted || movingParticipant.voiceServerMuted), serverMuted: Boolean(movingParticipant.voiceServerMuted) });
      for (const existing of targetRoom.participants.values()) {
        if (existing !== movingParticipant) send(existing, { type: "voice-user-joined", participant });
      }
      return true;
    }

    if (message.type === "voice-mute") {
      const voiceRoom = voiceRooms.get(socket.voiceRoomId);
      const participantId = String(message.participantId || "");
      const target = voiceRoom?.participants.get(participantId);
      const groupId = voiceRoom?.groupId;
      if (!voiceRoom || !target || !groupId || !socket.user || !canGroupAction(socket.user.id, groupId, "canMoveMembers")) {
        send(socket, { type: "voice-error", action: "mute", message: "Você não tem permissão para silenciar pessoas nesta sala." });
        return true;
      }
      target.voiceServerMuted = message.muted !== false;
      if (target.voiceServerMuted && target.voiceSpeaking) {
        target.voiceSpeaking = false;
        broadcastVoice(voiceRoom, { type: "voice-user-speaking", participantId: target.voiceClientId, speaking: false });
      }
      send(target, { type: "voice-force-mute", muted: Boolean(target.voiceServerMuted) });
      broadcastVoice(voiceRoom, { type: "voice-user-muted", participantId: target.voiceClientId, muted: Boolean(target.voiceMuted || target.voiceServerMuted), serverMuted: Boolean(target.voiceServerMuted) });
      return true;
    }

    if (message.type === "voice-mute-state") {
      const voiceRoom = voiceRooms.get(socket.voiceRoomId);
      if (!voiceRoom) return true;
      socket.voiceMuted = Boolean(message.muted);
      if (socket.voiceMuted && socket.voiceSpeaking) {
        socket.voiceSpeaking = false;
        broadcastVoice(voiceRoom, { type: "voice-user-speaking", participantId: socket.voiceClientId, speaking: false });
      }
      broadcastVoice(voiceRoom, { type: "voice-user-muted", participantId: socket.voiceClientId, muted: Boolean(socket.voiceMuted || socket.voiceServerMuted), serverMuted: Boolean(socket.voiceServerMuted) });
      return true;
    }

    if (message.type === "voice-speaking") {
      const voiceRoom = voiceRooms.get(socket.voiceRoomId);
      if (!voiceRoom || !socket.voiceClientId) return true;
      if (!allowVoiceSpeakingUpdate(socket)) {
        reportVoiceSpeakingRateLimited(socket);
        return true;
      }
      // Um participante silenciado na sala não pode voltar a anunciar voz até
      // que a moderação remova o bloqueio do microfone.
      const speaking = !socket.voiceMuted && !socket.voiceServerMuted && message.speaking === true;
      if (socket.voiceSpeaking === speaking) return true;
      socket.voiceSpeaking = speaking;
      broadcastVoice(voiceRoom, { type: "voice-user-speaking", participantId: socket.voiceClientId, speaking });
      return true;
    }

    if (message.type === "voice-deafen-state") {
      const voiceRoom = voiceRooms.get(socket.voiceRoomId);
      if (!voiceRoom || !socket.voiceClientId) return true;
      socket.voiceDeafened = Boolean(message.deafened);
      broadcastVoice(voiceRoom, { type: "voice-user-deafened", participantId: socket.voiceClientId, deafened: socket.voiceDeafened });
      return true;
    }

    if (message.type === "voice-disconnect") {
      const voiceRoom = voiceRooms.get(socket.voiceRoomId);
      const participantId = String(message.participantId || "");
      const target = voiceRoom?.participants.get(participantId);
      const groupId = voiceRoom?.groupId;
      if (!voiceRoom || !target || !groupId || !socket.user || !canGroupAction(socket.user.id, groupId, "canMoveMembers")) {
        send(socket, { type: "voice-error", action: "disconnect", message: "Você não tem permissão para desconectar pessoas desta sala." });
        return true;
      }
      if (target === socket) {
        leaveVoiceRoom(socket);
        return true;
      }
      send(target, { type: "voice-disconnected", message: "Você foi desconectado da sala por um administrador." });
      leaveVoiceRoom(target);
      return true;
    }

    if (message.type === "voice-leave") {
      leaveVoiceRoom(socket);
      return true;
    }

    if (message.type === "voice-signal") {
      const voiceRoom = voiceRooms.get(socket.voiceRoomId);
      const targetId = String(message.target || "");
      const target = voiceRoom?.participants.get(targetId);
      if (!target || target === socket) return true;
      const payload = normalizeRtcSignalPayload(message.payload);
      if (!payload) {
        send(socket, { type: "error", message: "Sinalização de voz inválida." });
        return true;
      }
      send(target, { type: "voice-signal", from: socket.voiceClientId, payload });
      return true;
    }

    return false;
  };
}
