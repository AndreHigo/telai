function uniqueParticipants(participants) {
  const unique = new Map();
  for (const participant of participants || []) {
    if (!participant?.id) continue;
    const key = participant.userId ? `user:${participant.userId}` : `id:${participant.id}`;
    const current = unique.get(key);
    if (!current || (participant.isLocal && !current.isLocal) || (!participant.connecting && current.connecting)) {
      unique.set(key, participant);
    }
  }
  return [...unique.values()];
}

export function createVoiceParticipantStateController({ getState, setGroupState }) {
  function updateRoomSnapshot(roomId, updater) {
    const current = getState();
    if (!roomId || !current.groupOverview?.rooms?.length) return;
    setGroupState({ groupOverview: {
      ...current.groupOverview,
      rooms: current.groupOverview.rooms.map((room) => room.id === roomId
        ? { ...room, participants: updater(Array.isArray(room.participants) ? room.participants : []) }
        : room),
    } });
  }

  function replaceRoomSnapshot(roomId, participants) {
    updateRoomSnapshot(roomId, () => uniqueParticipants(participants));
  }

  function upsertRoomParticipant(roomId, participant) {
    if (!participant?.id) return;
    updateRoomSnapshot(roomId, (participants) => uniqueParticipants([...participants, participant]));
  }

  function removeRoomParticipant(roomId, participantId, userId = null) {
    updateRoomSnapshot(roomId, (participants) => participants.filter((participant) => (
      participant.id !== participantId &&
      participant.id !== "local-pending" &&
      (!userId || participant.userId !== userId)
    )));
  }

  function mergeActivePresence(overview) {
    const current = getState();
    if (!overview?.rooms?.length || !current.voiceRoomId || !["connected", "connecting"].includes(current.voiceState)) return overview;
    return {
      ...overview,
      rooms: overview.rooms.map((room) => {
        if (room.id !== current.voiceRoomId) return room;
        const participants = (room.participants || []).filter((participant) => participant.userId !== current.currentUserId);
        return { ...room, participants: uniqueParticipants([...participants, ...(current.voiceParticipants?.values?.() || [])]) };
      }),
    };
  }

  return {
    updateRoomSnapshot,
    uniqueParticipants,
    replaceRoomSnapshot,
    upsertRoomParticipant,
    removeRoomParticipant,
    mergeActivePresence,
  };
}
