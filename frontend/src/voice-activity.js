export function updateVoiceActivitySpeakingState(
  state,
  active,
  now,
  { releaseMs = 120, minimumSpeakingMs = 160, onsetGuardMs = 48 } = {},
) {
  if (state.speaking) {
    // Only accumulate silence while the signal is actually inactive. Failing
    // to reset this timestamp made continuous speech periodically lose its
    // speaking state and then wait through the transition guard to light up.
    if (active) {
      state.silentSince = 0;
      return false;
    }
    state.silentSince ||= now;
    const speakingDuration = state.lastStateChangeAt ? now - state.lastStateChangeAt : Infinity;
    if (now - state.silentSince < releaseMs || speakingDuration < minimumSpeakingMs) return false;
    state.speaking = false;
    state.silentSince = 0;
    state.lastStateChangeAt = now;
    return true;
  }

  state.silentSince = 0;
  if (!active) return false;
  const sinceLastChange = state.lastStateChangeAt ? now - state.lastStateChangeAt : Infinity;
  if (sinceLastChange < onsetGuardMs) return false;
  state.speaking = true;
  state.lastStateChangeAt = now;
  return true;
}

export function createVoiceSpeakingPublisher({
  send,
  isReady,
  now = () => Date.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
  windowMs = 10_000,
  maxUpdatesPerWindow = 36,
  safetyMs = 50,
} = {}) {
  let sentAt = [];
  let timer = null;
  let pendingParticipantId = "";
  let pendingSpeaking = null;

  const flush = () => {
    timer = null;
    if (pendingSpeaking == null || !pendingParticipantId || !isReady?.(pendingParticipantId)) {
      pendingParticipantId = "";
      pendingSpeaking = null;
      return;
    }

    const timestamp = now();
    sentAt = sentAt.filter((sent) => timestamp - sent < windowMs);
    if (sentAt.length >= maxUpdatesPerWindow) {
      const delay = Math.max(safetyMs, sentAt[0] + windowMs - timestamp + safetyMs);
      timer = setTimer(flush, delay);
      return;
    }

    const speaking = pendingSpeaking;
    pendingParticipantId = "";
    pendingSpeaking = null;
    try {
      send?.({ type: "voice-speaking", speaking });
      sentAt.push(timestamp);
    } catch {
      // A socket closing between readiness check and send is transient; the
      // next actual state transition will publish again.
    }
  };

  return {
    publish(participantId, speaking) {
      if (!participantId || !isReady?.(participantId)) return;
      pendingParticipantId = participantId;
      pendingSpeaking = Boolean(speaking);
      if (timer == null) flush();
    },
    reset() {
      if (timer != null) clearTimer(timer);
      timer = null;
      sentAt = [];
      pendingParticipantId = "";
      pendingSpeaking = null;
    },
  };
}
