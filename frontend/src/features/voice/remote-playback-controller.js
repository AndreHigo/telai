const DEFAULT_RETRY_MS = 1_000;

function defaultTimers() {
  return {
    setTimeout: (...args) => globalThis.setTimeout(...args),
    clearTimeout: (...args) => globalThis.clearTimeout(...args),
  };
}

export function createVoiceRemotePlaybackController({
  audioByParticipant,
  bindingsByParticipant,
  playbackTimersByParticipant,
  documentRef = globalThis.document,
  timers = defaultTimers(),
  retryMs = DEFAULT_RETRY_MS,
  isConnected = () => false,
  isDeafened = () => false,
  isLocallyMuted = () => false,
  getOutputDeviceId = () => "",
  setOutputDeviceFallback = () => {},
  getEffectiveVolume = () => 1,
  setPlaybackBlocked = () => {},
  setVoiceError = () => {},
  reportClientError = () => {},
}) {
  function updatePlaybackState() {
    setPlaybackBlocked([...audioByParticipant.values()].some((audio) => audio.paused && !audio.ended));
  }

  function schedule(participantId, delayMs = retryMs) {
    if (isDeafened() || !isConnected() || playbackTimersByParticipant.has(participantId)) return;
    const audio = audioByParticipant.get(participantId);
    if (!audio?.srcObject || !audio.paused || audio.ended) return;
    const timer = timers.setTimeout(() => {
      playbackTimersByParticipant.delete(participantId);
      const currentAudio = audioByParticipant.get(participantId);
      if (!currentAudio || currentAudio !== audio || isDeafened() || !isConnected() || !currentAudio.paused || currentAudio.ended) return;
      void play(participantId, currentAudio).catch((error) => {
        if (error?.name !== "NotAllowedError") schedule(participantId);
      });
    }, Math.max(100, delayMs));
    playbackTimersByParticipant.set(participantId, timer);
  }

  function ensure(participantId) {
    const current = audioByParticipant.get(participantId);
    if (current) return current;
    const audio = documentRef.createElement("audio");
    audio.className = "voice-remote-audio";
    audio.autoplay = true;
    audio.playsInline = true;
    audio.preload = "auto";
    audio.setAttribute("autoplay", "true");
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("aria-hidden", "true");
    const update = () => updatePlaybackState();
    const retry = () => {
      updatePlaybackState();
      schedule(participantId);
    };
    audio.addEventListener("playing", update);
    audio.addEventListener("pause", retry);
    audio.addEventListener("stalled", retry);
    audio.addEventListener("waiting", retry);
    audio.addEventListener("error", retry);
    bindingsByParticipant.set(participantId, {
      audio,
      playing: update,
      pause: retry,
      stalled: retry,
      waiting: retry,
      error: retry,
    });
    documentRef.body.appendChild(audio);
    audioByParticipant.set(participantId, audio);
    return audio;
  }

  function remove(participantId) {
    const playbackTimer = playbackTimersByParticipant.get(participantId);
    if (playbackTimer) timers.clearTimeout(playbackTimer);
    playbackTimersByParticipant.delete(participantId);
    const binding = bindingsByParticipant.get(participantId);
    if (binding) {
      for (const [eventName, handler] of Object.entries(binding).filter(([eventName]) => eventName !== "audio")) {
        binding.audio?.removeEventListener(eventName, handler);
      }
    }
    bindingsByParticipant.delete(participantId);
    const audio = audioByParticipant.get(participantId);
    if (audio) audio.srcObject = null;
    audio?.remove();
    audioByParticipant.delete(participantId);
    updatePlaybackState();
  }

  async function play(participantId, audio = audioByParticipant.get(participantId)) {
    if (!audio) return;
    audio.muted = Boolean(isDeafened() || isLocallyMuted(participantId));
    audio.volume = getEffectiveVolume(participantId);
    const selectedOutputDeviceId = getOutputDeviceId();
    if (selectedOutputDeviceId && typeof audio.setSinkId === "function") {
      try {
        await audio.setSinkId(selectedOutputDeviceId);
      } catch (error) {
        reportClientError("voice_output_device_fallback", error, { participantId, deviceSelected: true });
        setOutputDeviceFallback();
        await audio.setSinkId("default").catch(() => {});
      }
    }
    try {
      await audio.play();
      const playbackTimer = playbackTimersByParticipant.get(participantId);
      if (playbackTimer) timers.clearTimeout(playbackTimer);
      playbackTimersByParticipant.delete(participantId);
      updatePlaybackState();
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        setPlaybackBlocked(true);
        setVoiceError("O navegador bloqueou o áudio automático. Clique em “Ativar áudio da sala”.");
      } else {
        schedule(participantId);
      }
      throw error;
    }
  }

  function resume() {
    if (isDeafened()) return;
    for (const [participantId, audio] of audioByParticipant) {
      if (!audio.paused) continue;
      void play(participantId, audio).catch((error) => {
        reportClientError("voice_remote_audio_play_error", error, { participantId, deviceSelected: Boolean(getOutputDeviceId()) });
        if (error?.name !== "NotAllowedError") setVoiceError("O áudio remoto não conseguiu iniciar. Verifique a saída de áudio selecionada.");
      });
    }
    timers.setTimeout(updatePlaybackState, 0);
  }

  return { ensure, play, remove, resume, schedule, updatePlaybackState };
}

