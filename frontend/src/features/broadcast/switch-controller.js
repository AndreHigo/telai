export function createBroadcastSwitchController({
  getState,
  setState,
  captureDisplayStream,
  buildOutputStream,
  replaceTracks,
  attachPreview,
  requestBroadcastAudioSource,
  startWindowAudioBridge,
  startSystemAudioBridge,
  stopWindowAudioBridge,
  stopComposition,
  isRelayActive,
  stopRelay,
  startRelay,
  handleVideoTrackEnded,
  clearCaptureRecoveryTimer,
  formatMissingAudio,
  qualityProfiles,
  reportClientError,
  setNotice,
} = {}) {
  const state = () => getState?.() || {};

  async function switchSource() {
    const current = state();
    if (current.broadcastState !== "live" || current.broadcastSourceType !== "screen" || current.broadcastSourceSwitching) return false;
    setState?.({ broadcastSourceSwitching: true, broadcastError: "", broadcastAudioWarning: "" });
    const previousStream = current.broadcastStream;
    const previousDisplayStream = current.broadcastDisplayStream;
    const previousCameraStream = current.broadcastCameraStream;
    const previousProcessId = current.activeDisplayProcessId;
    const previousAudioMode = current.audioMode;
    const wasRelay = current.mediaMode === "relay" && await isRelayActive?.();
    let capturedStream = null;
    let nextStream = null;
    try {
      const profile = qualityProfiles?.[current.selectedQuality];
      capturedStream = await captureDisplayStream?.(profile);
      const nextVideoTrack = capturedStream?.getVideoTracks?.()[0];
      if (!nextVideoTrack) throw new Error("A nova fonte não forneceu vídeo.");
      const displaySurface = nextVideoTrack.getSettings?.().displaySurface;
      if (displaySurface === "monitor" || displaySurface === "screen") setState?.({ broadcastDisplaySurface: "screen" });
      else if (displaySurface) setState?.({ broadcastDisplaySurface: "window" });
      const nextProcessId = state().selectedDisplayProcessId;
      let audioMode = current.audioMode;
      let sourceAudioTrack = audioMode === "none" ? null : capturedStream.getAudioTracks()[0] || null;
      if (globalThis.miranteDesktop?.isDesktop && audioMode === "system") {
        capturedStream.getAudioTracks().forEach((track) => track.stop());
        try {
          sourceAudioTrack = await startSystemAudioBridge?.();
          if (!sourceAudioTrack) throw new Error("O Windows não encontrou aplicativos para incluir no áudio filtrado.");
        } catch (error) {
          audioMode = "none";
          sourceAudioTrack = null;
          setState?.({ audioMode, broadcastAudioWarning: `${error.message || "Não foi possível preparar o áudio filtrado."} A troca seguirá sem áudio do computador.` });
        }
      } else if (globalThis.miranteDesktop?.isDesktop && audioMode === "source" && displaySurface === "screen") {
        const selectedAudioSource = await requestBroadcastAudioSource?.();
        capturedStream.getAudioTracks().forEach((track) => track.stop());
        if (selectedAudioSource?.processId) {
          setState?.({ broadcastAudioProcessId: selectedAudioSource.processId, broadcastAudioSourceName: selectedAudioSource.name });
          sourceAudioTrack = await startWindowAudioBridge?.(selectedAudioSource.processId);
        } else {
          await stopWindowAudioBridge?.();
          audioMode = "none";
          sourceAudioTrack = null;
          setState?.({ audioMode, broadcastAudioWarning: "A troca seguirá sem áudio do computador. Escolha um aplicativo para incluir somente o áudio dele." });
        }
      } else if (globalThis.miranteDesktop?.isDesktop && audioMode === "source") {
        if (nextProcessId) {
          sourceAudioTrack = await startWindowAudioBridge?.(nextProcessId);
          capturedStream.getAudioTracks().forEach((track) => track.stop());
        } else {
          await stopWindowAudioBridge?.();
          capturedStream.getAudioTracks().forEach((track) => track.stop());
          sourceAudioTrack = null;
          setState?.({ broadcastAudioWarning: "Não foi possível identificar o processo da janela. A troca seguirá sem áudio da fonte para não capturar o computador inteiro." });
        }
      } else if (globalThis.miranteDesktop?.isDesktop) {
        await stopWindowAudioBridge?.();
      }
      if (audioMode !== "none" && !sourceAudioTrack && !current.isDesktop) throw new Error(formatMissingAudio?.({ isDesktop: current.isDesktop, displaySurface, selectionKind: current.broadcastSelectionKind }));
      nextStream = await buildOutputStream?.({ displayStream: capturedStream, cameraStream: previousCameraStream, sourceAudioTrack, microphoneStream: current.broadcastMicrophoneStream, profile });
      if (wasRelay) await stopRelay?.();
      await replaceTracks?.(nextStream);
      setState?.({ broadcastStream: nextStream, broadcastDisplayStream: capturedStream, broadcastSourceAudioTrack: sourceAudioTrack, activeDisplayProcessId: nextProcessId });
      nextVideoTrack.contentHint = "detail";
      nextVideoTrack.addEventListener("ended", () => handleVideoTrackEnded?.(nextVideoTrack), { once: true });
      clearCaptureRecoveryTimer?.();
      previousStream?.getTracks?.().forEach((track) => track.stop());
      if (previousDisplayStream && previousDisplayStream !== capturedStream) previousDisplayStream.getTracks().forEach((track) => track.stop());
      await attachPreview?.();
      if (wasRelay) await startRelay?.();
      setNotice?.("Fonte da transmissão trocada sem encerrar a live.");
      return true;
    } catch (error) {
      capturedStream?.getTracks?.().forEach((track) => track.stop());
      stopComposition?.();
      const latest = state();
      if (previousStream && latest.broadcastState === "live") {
        try {
          let restoredSourceAudioTrack = latest.audioMode === "none" ? null : latest.broadcastSourceAudioTrack || previousDisplayStream?.getAudioTracks?.()[0] || null;
          if (globalThis.miranteDesktop?.isDesktop && previousAudioMode === "system") {
            try { restoredSourceAudioTrack = await startSystemAudioBridge?.(); } catch {}
          } else if (globalThis.miranteDesktop?.isDesktop && latest.audioMode === "source" && previousProcessId) {
            restoredSourceAudioTrack = await startWindowAudioBridge?.(previousProcessId);
          }
          const restoredStream = await buildOutputStream?.({ displayStream: previousDisplayStream, cameraStream: previousCameraStream, sourceAudioTrack: restoredSourceAudioTrack, microphoneStream: latest.broadcastMicrophoneStream, profile: qualityProfiles?.[latest.selectedQuality] });
          await replaceTracks?.(restoredStream);
          setState?.({ broadcastStream: restoredStream, broadcastDisplayStream: previousDisplayStream, broadcastSourceAudioTrack: restoredSourceAudioTrack, broadcastCameraStream: previousCameraStream, activeDisplayProcessId: previousProcessId });
          await attachPreview?.();
          if (wasRelay) await startRelay?.();
        } catch (restoreError) {
          setState?.({ broadcastError: restoreError.message || "Não foi possível restaurar a transmissão anterior." });
        }
      }
      if (error.name !== "NotAllowedError") setState?.({ broadcastError: error.message || "Não foi possível trocar a fonte da transmissão." });
      reportClientError?.("broadcast_source_switch_error", error, {});
      return false;
    } finally {
      setState?.({ showDisplayPicker: false, displaySources: [], selectedDisplayProcessId: state().activeDisplayProcessId, broadcastSourceSwitching: false });
    }
  }

  return { switchSource };
}
