export function createVoiceMessageController({
  getState,
  setState,
  uniqueParticipants,
  writeReconnectSession,
  attachVoiceActivityStream,
  replaceRoomSnapshot,
  upsertRoomParticipant,
  removeRoomParticipant,
  markParticipantSpeaking,
  clearVoiceActivityAnalyzer,
  createPeer,
  shouldInitiatePeer,
  closePeer,
  syncLocalTrackToPeers,
  enqueueSignal,
  sendVoice,
  leaveVoiceRoom,
  clearReconnectSession,
  refreshGroupOverview,
  setGroupState,
  schedulePeerRecovery,
  playVoiceSound,
} = {}) {
  const state = () => getState?.() || {};

  function localParticipant(current, id, overrides = {}) {
    return {
      id,
      userId: current.user?.id || null,
      displayName: current.user?.displayName || "Você",
      username: current.user?.username || "você",
      avatarData: current.user?.avatarData || null,
      isLocal: true,
      muted: current.voiceMuted,
      serverMuted: false,
      deafened: current.voiceDeafened,
      ...overrides,
    };
  }

  function markKnownParticipants(current, participants) {
    const known = new Set(current.voiceSpeakingSignalKnownParticipantIds || []);
    for (const participant of participants || []) {
      if (participant?.id) known.add(participant.id);
      if (participant?.speaking) markParticipantSpeaking?.(participant.id, true, "signal");
    }
    return known;
  }

  async function handle(message) {
    const current = state();
    if (message.type === "voice-joined") {
      const id = message.clientId;
      const local = localParticipant(current, id, { muted: current.voiceMuted || !(current.voiceLocalStream?.getAudioTracks?.().some((track) => track.readyState === "live")) });
      const participants = uniqueParticipants?.([local, ...(message.participants || [])]) || [local, ...(message.participants || [])];
      setState?.({ voiceClientId: id, voiceParticipants: new Map(participants.map((participant) => [participant.id, participant])), voiceState: "connected", voiceMuted: local.muted, voiceServerMuted: false, voiceDeafened: false, voiceSpeakingSignalKnownParticipantIds: markKnownParticipants(current, message.participants) });
      writeReconnectSession?.({ groupId: current.selectedGroupId, voiceRoomId: message.voiceRoomId, groupName: current.selectedGroup?.name, roomName: current.selectedRoom?.name }, { show: false });
      attachVoiceActivityStream?.(id, current.voiceLocalStream);
      replaceRoomSnapshot?.(message.voiceRoomId, [local, ...(message.participants || [])]);
      playVoiceSound?.("enter");
      for (const participant of message.participants || []) createPeer?.(participant.id, shouldInitiatePeer?.(participant.id));
      void syncLocalTrackToPeers?.();
      if (local.muted) sendVoice?.({ type: "voice-mute-state", muted: true });
      return;
    }

    if (message.type === "voice-moved") {
      for (const participantId of current.voicePeerConnections?.keys?.() || []) closePeer?.(participantId);
      removeRoomParticipant?.(message.previousRoomId, message.clientId, current.user?.id || null);
      const local = localParticipant(current, message.clientId, { serverMuted: Boolean(message.serverMuted), muted: current.voiceMuted || Boolean(message.serverMuted) });
      const participants = uniqueParticipants?.([local, ...(message.participants || [])]) || [local, ...(message.participants || [])];
      const track = current.voiceLocalStream?.getAudioTracks?.()[0];
      if (track) track.enabled = !(current.voiceMuted || Boolean(message.serverMuted));
      setState?.({ voiceRoomId: message.voiceRoomId, voiceClientId: message.clientId, voiceServerMuted: Boolean(message.serverMuted), voiceParticipants: new Map(participants.map((participant) => [participant.id, participant])), voiceState: "connected", voiceError: "", voiceSpeakingSignalKnownParticipantIds: markKnownParticipants(current, message.participants) });
      setGroupState?.({ selectedRoomId: message.voiceRoomId });
      writeReconnectSession?.({ groupId: current.selectedGroupId, voiceRoomId: message.voiceRoomId, groupName: current.selectedGroup?.name, roomName: current.selectedRoom?.name }, { show: false });
      attachVoiceActivityStream?.(message.clientId, current.voiceLocalStream);
      replaceRoomSnapshot?.(message.voiceRoomId, participants);
      playVoiceSound?.("enter");
      for (const participant of message.participants || []) createPeer?.(participant.id, shouldInitiatePeer?.(participant.id));
      void syncLocalTrackToPeers?.();
      return;
    }

    if (message.type === "voice-user-joined") {
      const participants = [...(current.voiceParticipants?.values?.() || []), message.participant];
      const nextKnown = new Set(current.voiceSpeakingSignalKnownParticipantIds || []);
      if (message.participant?.id) nextKnown.add(message.participant.id);
      setState?.({ voiceParticipants: new Map((uniqueParticipants?.(participants) || participants).map((participant) => [participant.id, participant])), voiceSpeakingSignalKnownParticipantIds: nextKnown });
      upsertRoomParticipant?.(current.voiceRoomId, message.participant);
      if (message.participant?.id) {
        const pending = current.voicePendingSignals?.get(message.participant.id) || [];
        current.voicePendingSignals?.delete(message.participant.id);
        for (const signal of pending) enqueueSignal?.(signal);
        createPeer?.(message.participant.id, shouldInitiatePeer?.(message.participant.id));
        void syncLocalTrackToPeers?.();
      }
      playVoiceSound?.("enter");
      return;
    }

    if (message.type === "voice-user-left") {
      playVoiceSound?.("leave");
      const ids = new Set([message.participantId]);
      if (message.userId) for (const participant of current.voiceParticipants?.values?.() || []) if (participant.userId === message.userId) ids.add(participant.id);
      const participants = [...(current.voiceParticipants?.values?.() || [])].filter((participant) => participant.id !== message.participantId && (!message.userId || participant.userId !== message.userId));
      const known = new Set(current.voiceSpeakingSignalKnownParticipantIds || []);
      for (const participantId of ids) { known.delete(participantId); closePeer?.(participantId); }
      setState?.({ voiceParticipants: new Map(participants.map((participant) => [participant.id, participant])), voiceSpeakingSignalKnownParticipantIds: known });
      removeRoomParticipant?.(current.voiceRoomId, message.participantId, message.userId || null);
      return;
    }

    if (message.type === "voice-user-muted") {
      const participant = current.voiceParticipants?.get(message.participantId);
      if (!participant) return;
      const updated = { ...participant, muted: Boolean(message.muted), serverMuted: Boolean(message.serverMuted) };
      setState?.({ voiceParticipants: new Map(current.voiceParticipants).set(message.participantId, updated) });
      upsertRoomParticipant?.(current.voiceRoomId, updated);
      return;
    }

    if (message.type === "voice-user-speaking") {
      const participantId = String(message.participantId || "");
      if (!participantId) return;
      const known = new Set(current.voiceSpeakingSignalKnownParticipantIds || []);
      known.add(participantId);
      setState?.({ voiceSpeakingSignalKnownParticipantIds: known });
      if (participantId !== current.voiceClientId) clearVoiceActivityAnalyzer?.(participantId);
      markParticipantSpeaking?.(participantId, Boolean(message.speaking), "signal");
      return;
    }

    if (message.type === "voice-user-deafened") {
      const participant = current.voiceParticipants?.get(message.participantId);
      if (!participant) return;
      const updated = { ...participant, deafened: Boolean(message.deafened) };
      setState?.({ voiceParticipants: new Map(current.voiceParticipants).set(message.participantId, updated) });
      upsertRoomParticipant?.(current.voiceRoomId, updated);
      return;
    }

    if (message.type === "voice-force-mute") {
      const track = current.voiceLocalStream?.getAudioTracks?.()[0];
      const previousMuted = current.voiceMuted || current.voiceServerMuted;
      const serverMuted = Boolean(message.muted);
      if (track) track.enabled = !(current.voiceMuted || serverMuted);
      const effectiveMuted = current.voiceMuted || serverMuted;
      const local = current.voiceParticipants?.get(current.voiceClientId);
      const nextParticipants = local
        ? new Map(current.voiceParticipants).set(current.voiceClientId, { ...local, muted: effectiveMuted, serverMuted })
        : current.voiceParticipants;
      setState?.({ voiceServerMuted: serverMuted, voiceParticipants: nextParticipants });
      if (local) upsertRoomParticipant?.(current.voiceRoomId, nextParticipants.get(current.voiceClientId));
      sendVoice?.({ type: "voice-mute-state", muted: current.voiceMuted });
      if (effectiveMuted !== previousMuted) playVoiceSound?.(effectiveMuted ? "mute" : "unmute");
      return;
    }

    if (message.type === "voice-disconnected") {
      setState?.({ voiceError: message.message || "Você foi desconectado da sala de voz." });
      clearReconnectSession?.();
      leaveVoiceRoom?.({ silent: true });
      if (message.reason === "replaced") void refreshGroupOverview?.();
      return;
    }

    if (message.type === "voice-signal") {
      enqueueSignal?.(message);
      return;
    }

    if (message.type === "voice-signal-error") {
      const participantId = String(message.target || "").trim();
      setState?.({ voiceError: message.message || "A sinalização do áudio está sendo recuperada." });
      if (participantId) schedulePeerRecovery?.(participantId, 800, true);
      return;
    }

    if (message.type === "voice-error" || message.type === "error") {
      setState?.({ voiceError: message.message || "Não foi possível entrar na sala de voz." });
      if (message.type === "error" || !message.action) leaveVoiceRoom?.();
    }
  }

  return { handle };
}
