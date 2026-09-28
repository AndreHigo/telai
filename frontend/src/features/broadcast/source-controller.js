export function createBroadcastSourceController({
  getState,
  setState,
  buildOutputStream,
  replaceTracks,
  attachPreview,
  captureCamera,
  captureMicrophone,
  stopMicrophone,
  stopComposition,
  isRelayActive,
  stopRelay,
  startRelay,
  qualityProfiles,
  reportClientError,
  setNotice,
} = {}) {
  const state = () => getState?.() || {};

  async function rebuildOutput({ cameraStream, microphoneStream, sourceAudioTrack, cameraPosition } = {}) {
    const current = state();
    if (current.broadcastState !== "live" || current.broadcastMediaSwitching) return false;
    const nextCameraStream = cameraStream === undefined ? current.broadcastCameraStream : cameraStream;
    const nextMicrophoneStream = microphoneStream === undefined ? current.broadcastMicrophoneStream : microphoneStream;
    const nextSourceAudioTrack = sourceAudioTrack === undefined ? current.broadcastSourceAudioTrack : sourceAudioTrack;
    const nextCameraPosition = cameraPosition === undefined ? current.broadcastCameraPosition : cameraPosition;
    const previousStream = current.broadcastStream;
    const previousComposition = current.broadcastVideoComposition;
    const wasRelay = current.mediaMode === "relay" && await isRelayActive?.();
    let nextStream = null;
    setState?.({ broadcastMediaSwitching: true });
    try {
      nextStream = await buildOutputStream?.({
        displayStream: current.broadcastDisplayStream,
        cameraStream: nextCameraStream,
        sourceAudioTrack: nextSourceAudioTrack,
        microphoneStream: nextMicrophoneStream,
        cameraPosition: nextCameraPosition,
        profile: qualityProfiles?.[current.selectedQuality],
      });
      if (!nextCameraStream && previousComposition) stopComposition?.();
      if (wasRelay) await stopRelay?.();
      await replaceTracks?.(nextStream);
      setState?.({ broadcastStream: nextStream, broadcastSourceAudioTrack: nextSourceAudioTrack });
      await attachPreview?.();
      if (wasRelay) await startRelay?.();
      const latest = state();
      const activeSourceTracks = new Set([
        ...(latest.broadcastDisplayStream?.getTracks?.() || []),
        ...(latest.broadcastCameraStream?.getTracks?.() || []),
        ...(latest.broadcastMicrophoneStream?.getTracks?.() || []),
      ]);
      if (previousStream && previousStream !== nextStream) previousStream.getTracks().forEach((track) => {
        if (!activeSourceTracks.has(track)) track.stop();
      });
      return true;
    } catch (error) {
      const latest = state();
      if (wasRelay && !(await isRelayActive?.()) && latest.broadcastStream) {
        try { await startRelay?.(); } catch (relayError) { reportClientError?.("broadcast_relay_restart_error", relayError, { mediaMode: latest.mediaMode }); }
      }
      nextStream?.getTracks?.().forEach((track) => track.stop());
      setState?.({ broadcastError: error.message || "Não foi possível atualizar os dispositivos da transmissão." });
      reportClientError?.("broadcast_media_switch_error", error, { camera: Boolean(nextCameraStream), microphone: Boolean(nextMicrophoneStream) });
      return false;
    } finally {
      setState?.({ broadcastMediaSwitching: false });
    }
  }

  async function handleCameraChange(event) {
    const current = state();
    const requestedDeviceId = String(event.currentTarget?.value || "");
    const previousCameraDeviceId = current.broadcastCameraDeviceId;
    const previousCameraEnabled = current.broadcastCameraEnabled;
    setState?.({ broadcastCameraDeviceId: requestedDeviceId, ...(!requestedDeviceId && current.broadcastSourceType === "screen" ? { broadcastCameraEnabled: false } : {}) });
    if (current.broadcastState !== "live") return;
    if (current.broadcastSourceType === "camera" && !requestedDeviceId) {
      setState?.({ broadcastError: "A transmissão por câmera precisa manter uma câmera selecionada." });
      return;
    }
    if (current.broadcastSourceType === "screen" && !current.broadcastCameraEnabled && requestedDeviceId) {
      setNotice?.("Câmera selecionada. Ative “Incluir minha câmera” para adicioná-la à transmissão.");
      return;
    }
    const previousCameraStream = current.broadcastCameraStream;
    let nextCameraStream = null;
    try {
      if (requestedDeviceId) nextCameraStream = await captureCamera?.(qualityProfiles?.[current.selectedQuality]);
      const applied = await rebuildOutput({ cameraStream: nextCameraStream });
      if (!applied) {
        nextCameraStream?.getTracks?.().forEach((track) => track.stop());
        setState?.({ broadcastCameraEnabled: previousCameraEnabled });
        return;
      }
      setState?.({ broadcastCameraStream: nextCameraStream });
      previousCameraStream?.getTracks?.().forEach((track) => track.stop());
      setNotice?.(requestedDeviceId ? "Câmera trocada sem interromper a live." : "Câmera removida sem interromper a live.");
    } catch (error) {
      nextCameraStream?.getTracks?.().forEach((track) => track.stop());
      setState?.({ broadcastCameraDeviceId: previousCameraDeviceId, broadcastCameraEnabled: previousCameraEnabled, broadcastError: error.message || "Não foi possível trocar a câmera." });
      reportClientError?.("broadcast_camera_switch_error", error, { deviceId: requestedDeviceId });
    }
  }

  async function handleCameraToggle(event) {
    const current = state();
    const requestedEnabled = Boolean(event.currentTarget?.checked);
    const previousEnabled = current.broadcastCameraEnabled;
    const previousCameraStream = current.broadcastCameraStream;
    setState?.({ broadcastCameraEnabled: requestedEnabled });
    if (current.broadcastState !== "live") return;
    let nextCameraStream = null;
    try {
      if (requestedEnabled) nextCameraStream = await captureCamera?.(qualityProfiles?.[current.selectedQuality]);
      const applied = await rebuildOutput({ cameraStream: nextCameraStream });
      if (!applied) {
        setState?.({ broadcastCameraEnabled: previousEnabled });
        nextCameraStream?.getTracks?.().forEach((track) => track.stop());
        return;
      }
      setState?.({ broadcastCameraStream: nextCameraStream });
      previousCameraStream?.getTracks?.().forEach((track) => track.stop());
      setNotice?.(requestedEnabled ? "Câmera incluída na transmissão." : "Câmera removida da transmissão.");
    } catch (error) {
      setState?.({ broadcastCameraEnabled: previousEnabled });
      nextCameraStream?.getTracks?.().forEach((track) => track.stop());
      setState?.({ broadcastError: error.message || "Não foi possível atualizar a câmera." });
      reportClientError?.("broadcast_camera_toggle_error", error, { enabled: requestedEnabled, deviceId: current.broadcastCameraDeviceId });
    }
  }

  async function handleCameraPositionChange(event) {
    const current = state();
    const positions = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
    const requestedPosition = String(event.currentTarget?.value || "bottom-right");
    if (!positions.has(requestedPosition)) return;
    const previousPosition = current.broadcastCameraPosition;
    setState?.({ broadcastCameraPosition: requestedPosition });
    if (current.broadcastState !== "live" || current.broadcastSourceType !== "screen" || !current.broadcastCameraStream) return;
    const applied = await rebuildOutput({ cameraPosition: requestedPosition });
    if (!applied) setState?.({ broadcastCameraPosition: previousPosition });
    else setNotice?.("Posição da câmera atualizada sem interromper a live.");
  }

  async function handleMicrophoneChange(event) {
    const current = state();
    let microphoneEnabled = current.broadcastMicrophoneEnabled;
    let selectedInputDeviceId = current.selectedInputDeviceId;
    if (event.currentTarget?.classList?.contains("broadcast-microphone-enabled")) microphoneEnabled = Boolean(event.currentTarget.checked);
    else selectedInputDeviceId = String(event.currentTarget?.value || "");
    setState?.({ broadcastMicrophoneEnabled: microphoneEnabled, selectedInputDeviceId });
    if (current.broadcastState !== "live") return;
    const previousMicrophoneStream = current.broadcastMicrophoneStream;
    let nextMicrophoneStream = null;
    try {
      if (microphoneEnabled) nextMicrophoneStream = await captureMicrophone?.();
      const applied = await rebuildOutput({ microphoneStream: nextMicrophoneStream });
      if (!applied) {
        if (nextMicrophoneStream) stopMicrophone?.(nextMicrophoneStream);
        return;
      }
      setState?.({ broadcastMicrophoneStream: nextMicrophoneStream });
      if (previousMicrophoneStream && previousMicrophoneStream !== nextMicrophoneStream) stopMicrophone?.(previousMicrophoneStream);
      setNotice?.(microphoneEnabled ? "Microfone trocado sem interromper a live." : "Microfone desativado sem interromper a live.");
    } catch (error) {
      if (nextMicrophoneStream) stopMicrophone?.(nextMicrophoneStream);
      setState?.({ broadcastMicrophoneStream: previousMicrophoneStream, broadcastMicrophoneEnabled: Boolean(previousMicrophoneStream), broadcastError: error.message || "Não foi possível trocar o microfone." });
      reportClientError?.("broadcast_microphone_switch_error", error, { requestedDeviceId: selectedInputDeviceId });
    }
  }

  return { rebuildOutput, handleCameraChange, handleCameraToggle, handleCameraPositionChange, handleMicrophoneChange };
}
