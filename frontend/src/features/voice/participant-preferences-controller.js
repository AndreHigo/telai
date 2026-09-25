export function createVoicePreferenceMap(resolveTargetId) {
  return class VoicePreferenceMap extends Map {
    get(key) {
      const targetUserId = resolveTargetId?.(key);
      return super.get(targetUserId) ?? super.get(key);
    }
  };
}

export function createVoiceParticipantPreferencesController({
  api,
  getState,
  setState,
  normalizeAudioVolume,
  reportClientError,
  timers = {
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
  },
}) {
  const state = () => getState?.() || {};
  const resolveTargetId = (participantOrId) => {
    const current = state();
    const participant = participantOrId && typeof participantOrId === "object"
      ? participantOrId
      : current.voiceParticipants?.get?.(participantOrId);
    return String(participant?.userId || participant?.id || participantOrId || "").trim();
  };
  const VoicePreferenceMap = createVoicePreferenceMap(resolveTargetId);
  const persistTimers = new Map();

  function effectiveVolume(participantId) {
    const current = state();
    const targetUserId = resolveTargetId(participantId);
    return normalizeAudioVolume((current.voiceVolumes?.get?.(targetUserId) ?? 1) * (current.voiceOutputVolume ?? 1));
  }

  function schedulePersistence(targetUserId) {
    const current = state();
    if (!current.user?.id || !targetUserId || targetUserId === current.user.id) return;
    const previousTimer = persistTimers.get(targetUserId);
    if (previousTimer) timers.clearTimeout(previousTimer);
    const timer = timers.setTimeout(() => {
      persistTimers.delete(targetUserId);
      const latest = state();
      api("/api/auth/voice-preferences", {
        method: "PATCH",
        body: JSON.stringify({
          targetUserId,
          volume: latest.voiceVolumes?.get?.(targetUserId) ?? 1,
          locallyMuted: latest.voiceLocallyMutedParticipants?.has?.(targetUserId) || false,
        }),
      }).catch((error) => reportClientError?.("voice_user_preference_persist_error", error, { targetUserId }));
    }, 250);
    persistTimers.set(targetUserId, timer);
  }

  function setVolume(participantId, value) {
    const targetUserId = resolveTargetId(participantId);
    if (!targetUserId) return false;
    const current = state();
    const volume = normalizeAudioVolume(Number(value) / 100);
    const nextVolumes = new VoicePreferenceMap(current.voiceVolumes || []).set(targetUserId, volume);
    setState({ voiceVolumes: nextVolumes });
    const audio = current.voiceRemoteAudio?.get?.(participantId);
    if (audio) audio.volume = effectiveVolume(participantId);
    schedulePersistence(targetUserId);
    return true;
  }

  function isLocallyMuted(participantId) {
    const current = state();
    return Boolean(current.voiceLocallyMutedParticipants?.has?.(resolveTargetId(participantId)));
  }

  function toggleLocallyMuted(participantId) {
    const targetUserId = resolveTargetId(participantId);
    if (!targetUserId) return false;
    const current = state();
    const next = new Set(current.voiceLocallyMutedParticipants || []);
    if (next.has(targetUserId)) next.delete(targetUserId);
    else next.add(targetUserId);
    setState({ voiceLocallyMutedParticipants: next });
    const audio = current.voiceRemoteAudio?.get?.(participantId);
    if (audio) audio.muted = Boolean(current.voiceDeafened || next.has(targetUserId));
    schedulePersistence(targetUserId);
    return true;
  }

  function refreshRemoteAudio() {
    const current = state();
    for (const [participantId, audio] of current.voiceRemoteAudio || []) {
      audio.volume = effectiveVolume(participantId);
      audio.muted = Boolean(current.voiceDeafened || isLocallyMuted(participantId));
    }
  }

  function dispose() {
    for (const timer of persistTimers.values()) timers.clearTimeout(timer);
    persistTimers.clear();
  }

  return {
    VoicePreferenceMap,
    dispose,
    effectiveVolume,
    isLocallyMuted,
    refreshRemoteAudio,
    resolveTargetId,
    schedulePersistence,
    setVolume,
    toggleLocallyMuted,
  };
}

