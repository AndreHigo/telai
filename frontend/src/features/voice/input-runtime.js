export function createVoiceInputRuntime({
  getState,
  setState,
  voiceInputPipeline,
  voiceCaptureService,
  voiceTrackSyncService,
  voiceInputLifecycleController,
  voiceAudioTestController,
  createVoiceAudioConstraints,
  createSelectedVoiceAudioConstraints,
  normalizeAudioVolume,
  rawAudioDeviceLabel,
  reportClientError,
  scheduleAudioVolumePersistence,
  clearVoiceActivityAnalyzer,
  attachVoiceActivityStream,
  ensureVoiceActivityTimer,
  localStorageRef = globalThis.localStorage,
  navigatorRef = globalThis.navigator,
} = {}) {
  const read = () => getState?.() || {};
  const patchState = (next) => setState?.(next);

  function voiceAudioConstraints() {
    const current = read();
    return createVoiceAudioConstraints(current.voiceInputProfile, current.voiceAdvancedOptions);
  }

  function selectedVoiceAudioConstraints() {
    const current = read();
    return createSelectedVoiceAudioConstraints(current.voiceInputProfile, current.voiceAdvancedOptions, current.selectedInputDeviceId);
  }

  function rememberCapturedInputDevice(track, requestedDeviceId = read().selectedInputDeviceId) {
    const actualDeviceId = String(track?.getSettings?.().deviceId || "").trim();
    if (requestedDeviceId && actualDeviceId && actualDeviceId !== requestedDeviceId) {
      const error = new Error("O navegador entregou um microfone diferente do selecionado.");
      error.name = "SelectedDeviceMismatchError";
      error.requestedDeviceId = requestedDeviceId;
      error.actualDeviceId = actualDeviceId;
      throw error;
    }
    if (requestedDeviceId) {
      const current = read();
      const matchingDevice = current.allAudioInputDevices.find((device) => device.deviceId === (actualDeviceId || requestedDeviceId));
      const actualLabel = rawAudioDeviceLabel(matchingDevice) || String(track?.label || "").replace(/\s+/g, " ").trim();
      if (actualLabel) {
        patchState({ selectedInputDeviceLabel: actualLabel });
        try { localStorageRef.setItem("mirante-voice-input-label", actualLabel); } catch {}
      }
    }
    return { actualDeviceId, actualLabel: String(track?.label || "").replace(/\s+/g, " ").trim() };
  }

  function voiceInputStreamMatchesSelectedDevice(stream, requestedDeviceId = read().selectedInputDeviceId) {
    if (!requestedDeviceId) return true;
    const remembered = read().voiceInputDeviceByStream.get(stream);
    const sourceTrack = voiceInputPipeline.getResource(stream)?.rawStream?.getAudioTracks?.()[0] || stream?.getAudioTracks?.()[0];
    const actualDeviceId = remembered?.actualDeviceId || String(sourceTrack?.getSettings?.().deviceId || "").trim();
    return !actualDeviceId || actualDeviceId === requestedDeviceId;
  }

  function shouldProcessVoiceInput() {
    const current = read();
    return current.voiceInputProfile === "isolation" || (current.voiceInputProfile === "custom" && current.voiceAdvancedOptions.noiseSuppression);
  }

  async function processVoiceInputStream(rawStream) {
    return voiceInputPipeline.process(rawStream);
  }

  function stopVoiceInputStream(stream) {
    voiceInputPipeline.stop(stream);
  }

  function updateVoiceMicrophoneGain(stream = read().voiceLocalStream) {
    return voiceInputPipeline.updateGain(stream, read().voiceMicrophoneVolume);
  }

  async function setVoiceMicrophoneVolume(value) {
    const current = read();
    const voiceMicrophoneVolume = normalizeAudioVolume(Number(value) / 100);
    patchState({ voiceMicrophoneVolume });
    try { localStorageRef.setItem("mirante-voice-microphone-volume", String(voiceMicrophoneVolume)); } catch (error) { reportClientError("voice_microphone_volume_persist_error", error); }
    scheduleAudioVolumePersistence();
    const updatedLocalGain = updateVoiceMicrophoneGain(current.voiceLocalStream);
    updateVoiceMicrophoneGain(voiceAudioTestController.getState().stream);
    updateVoiceMicrophoneGain(current.broadcastMicrophoneStream);
    if (updatedLocalGain || !current.voiceLocalStream || voiceInputLifecycleController.isRecoveryInFlight()) return;
    try {
      const previousStream = current.voiceLocalStream;
      const nextStream = await processVoiceInputStream(previousStream);
      if (nextStream === previousStream) return;
      patchState({ voiceLocalStream: nextStream });
      const nextTrack = nextStream.getAudioTracks()[0];
      nextTrack.enabled = !(current.voiceMuted || current.voiceServerMuted);
      voiceInputLifecycleController.bindLocalTrack(nextTrack);
      await syncVoiceLocalTrackToPeers();
      const resource = voiceInputPipeline.getResource(nextStream);
      if (resource) resource.rawStream = null;
      previousStream.getTracks().forEach((track) => track.stop());
      clearVoiceActivityAnalyzer(current.voiceClientId);
      void attachVoiceActivityStream(current.voiceClientId, nextStream);
      ensureVoiceActivityTimer();
    } catch (error) {
      reportClientError("voice_microphone_volume_apply_error", error, { voiceState: current.voiceState });
    }
  }

  async function captureVoiceInputStream({ expectedDeviceId = read().selectedInputDeviceId, selectionRevision = read().voiceInputSelectionRevision, fallbackToDefault = true } = {}) {
    if (!navigatorRef.mediaDevices?.getUserMedia) throw new Error("Este navegador não permite acessar o microfone.");
    const captured = await voiceCaptureService.capture({ expectedDeviceId, selectionRevision, fallbackToDefault });
    read().voiceInputDeviceByStream.set(captured.stream, captured.device);
    return captured.stream;
  }

  async function negotiateVoicePeer(participantId, peer, reason = "audio_track_added") {
    return voiceTrackSyncService.negotiate(participantId, peer, reason);
  }

  async function syncVoiceLocalTrackToPeers({ negotiateMissing = true } = {}) {
    return voiceTrackSyncService.sync({ negotiateMissing });
  }

  return {
    voiceAudioConstraints,
    selectedVoiceAudioConstraints,
    rememberCapturedInputDevice,
    voiceInputStreamMatchesSelectedDevice,
    shouldProcessVoiceInput,
    processVoiceInputStream,
    stopVoiceInputStream,
    updateVoiceMicrophoneGain,
    setVoiceMicrophoneVolume,
    captureVoiceInputStream,
    bindVoiceLocalTrack: (track) => voiceInputLifecycleController.bindLocalTrack(track),
    negotiateVoicePeer,
    syncVoiceLocalTrackToPeers,
    recoverVoiceInputTrack: (reason = "track_unavailable") => voiceInputLifecycleController.recover(reason),
    reapplyVoiceInputSettings: () => voiceInputLifecycleController.reapplySettings(),
  };
}
