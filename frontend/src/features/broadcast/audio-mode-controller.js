export function createBroadcastAudioModeController({
  getState,
  setState,
  stopWindowAudioBridge,
  requestBroadcastAudioSource,
  startWindowAudioBridge,
  startSystemAudioBridge,
  rebuildOutput,
  formatMissingAudio,
  reportClientError,
  setNotice,
} = {}) {
  const state = () => getState?.() || {};

  async function apply() {
    const current = state();
    if (current.broadcastState !== "live" || current.broadcastSourceType !== "screen") return false;
    if (current.broadcastSourceSwitching || current.broadcastMediaSwitching) return false;
    let sourceAudioTrack = null;
    try {
      if (current.audioMode === "none") {
        await stopWindowAudioBridge?.();
        current.broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
      } else if (current.audioMode === "source") {
        if (current.broadcastDisplaySurface === "screen") {
          const selectedAudioSource = await requestBroadcastAudioSource?.();
          if (selectedAudioSource?.processId && globalThis.miranteDesktop?.isDesktop) {
            setState?.({ broadcastAudioProcessId: selectedAudioSource.processId, broadcastAudioSourceName: selectedAudioSource.name });
            current.broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
            sourceAudioTrack = await startWindowAudioBridge?.(selectedAudioSource.processId);
          } else {
            setState?.({ audioMode: "none", broadcastAudioWarning: "Nenhum aplicativo disponível para o áudio isolado. A live continuará sem áudio do computador." });
            await stopWindowAudioBridge?.();
            current.broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
          }
        } else if (globalThis.miranteDesktop?.isDesktop && current.activeDisplayProcessId) {
          sourceAudioTrack = await startWindowAudioBridge?.(current.activeDisplayProcessId);
          current.broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
        } else {
          sourceAudioTrack = current.broadcastDisplayStream?.getAudioTracks?.()[0] || null;
        }
      } else if (globalThis.miranteDesktop?.isDesktop) {
        current.broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
        try {
          sourceAudioTrack = await startSystemAudioBridge?.();
          if (!sourceAudioTrack) throw new Error("O Windows não encontrou aplicativos para incluir no áudio filtrado.");
        } catch (error) {
          setState?.({ audioMode: "none", broadcastAudioWarning: `${error.message || "Não foi possível preparar o áudio filtrado."} A live continuará sem áudio do computador.` });
        }
      } else {
        sourceAudioTrack = current.broadcastDisplayStream?.getAudioTracks?.()[0] || null;
        if (!sourceAudioTrack) throw new Error(formatMissingAudio?.({ isDesktop: current.isDesktop, displaySurface: current.broadcastDisplaySurface, selectionKind: current.broadcastSelectionKind }));
        await stopWindowAudioBridge?.();
      }
      const applied = await rebuildOutput?.({ sourceAudioTrack });
      if (applied) setNotice?.(state().audioMode === "none" ? "Áudio do computador desativado sem interromper a live." : "Áudio da transmissão atualizado sem interromper a live.");
      return applied;
    } catch (error) {
      reportClientError?.("broadcast_audio_switch_error", error, { audioMode: state().audioMode });
      setState?.({ broadcastError: error.message || "Não foi possível trocar o áudio da transmissão." });
      return false;
    }
  }

  async function handleChange(event) {
    const previousAudioMode = state().audioMode;
    setState?.({ audioMode: String(event.currentTarget?.value || "source") });
    const current = state();
    if (current.broadcastState !== "live" || current.broadcastSourceType !== "screen") return;
    const applied = await apply();
    if (!applied) setState?.({ audioMode: previousAudioMode, broadcastError: current.broadcastError || "A fonte não foi trocada; o áudio anterior continua ativo." });
  }

  return { apply, handleChange };
}
