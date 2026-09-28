export function createVoiceActivityRuntime({
  activityController,
  getState,
  setState,
  updateVoiceRoomSnapshot,
} = {}) {
  const read = () => getState?.() || {};
  const patchState = (next) => setState?.(next);

  function syncVoiceParticipantSpeakingState(participantId, speaking) {
    if (!participantId) return;
    const nextSpeaking = Boolean(speaking);
    const current = read();
    const participant = current.voiceParticipants.get(participantId);
    if (participant && participant.speaking !== nextSpeaking) {
      patchState({ voiceParticipants: new Map(current.voiceParticipants).set(participantId, { ...participant, speaking: nextSpeaking }) });
    }
    if (current.voiceRoomId) {
      updateVoiceRoomSnapshot(current.voiceRoomId, (participants) => participants.map((item) => (
        item.id === participantId && item.speaking !== nextSpeaking
          ? { ...item, speaking: nextSpeaking }
          : item
      )));
    }
  }

  function markVoiceParticipantSpeaking(participantId, speaking, source = "analyser") {
    if (!participantId) return;
    const current = read();
    if (source === "rtc") return;
    if (source === "analyser" && participantId !== current.voiceClientId && current.voiceSpeakingSignalKnownParticipantIds.has(participantId)) return;
    const analyzer = activityController.getAnalyzer(participantId);
    const nextSpeaking = source === "signal" ? Boolean(speaking) : analyzer ? Boolean(analyzer.speaking) : false;
    const changed = current.speakingVoiceParticipantIds.has(participantId) !== nextSpeaking;
    if (changed) {
      const next = new Set(current.speakingVoiceParticipantIds);
      if (nextSpeaking) next.add(participantId);
      else next.delete(participantId);
      patchState({ speakingVoiceParticipantIds: next });
    }
    syncVoiceParticipantSpeakingState(participantId, nextSpeaking);
  }

  function isVoiceParticipantSpeaking(participant) {
    const current = read();
    return Boolean(participant?.id && (current.speakingVoiceParticipantIds.has(participant.id) || participant.speaking === true));
  }

  function clearVoiceActivityAnalyzer(participantId) {
    activityController.clearAnalyzer(participantId);
    markVoiceParticipantSpeaking(participantId, false, "cleanup");
    markVoiceParticipantSpeaking(participantId, false, "rtc");
  }

  function ensureVoiceActivityTimer() {
    activityController.ensureTimer();
  }

  function clearVoiceSpeakingPublishTimer() {
    activityController.resetPublisher();
  }

  async function attachVoiceActivityStream(participantId, stream) {
    return activityController.attachStream(participantId, stream);
  }

  function attachVoiceActivityDetector(participantId, audio) {
    activityController.attachDetector(participantId, audio);
  }

  return {
    syncVoiceParticipantSpeakingState,
    markVoiceParticipantSpeaking,
    isVoiceParticipantSpeaking,
    clearVoiceActivityAnalyzer,
    ensureVoiceActivityTimer,
    clearVoiceSpeakingPublishTimer,
    attachVoiceActivityStream,
    attachVoiceActivityDetector,
  };
}
