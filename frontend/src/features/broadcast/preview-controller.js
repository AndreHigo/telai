export function createBroadcastPreviewController({
  tick,
  getVideo,
  getState,
  setState,
  setBroadcastState,
  buildOutputStream,
  replaceTracks,
  stopWindowAudioBridge,
  reportClientError,
  setNotice,
  qualityProfiles,
} = {}) {
  const state = () => getState?.() || {};

  async function attachPreview() {
    await tick?.();
    const current = state();
    const video = getVideo?.();
    if (!video || !current.broadcastStream) return;
    video.muted = true;
    video.playsInline = true;
    const sourceChanged = video.srcObject !== current.broadcastStream;
    if (sourceChanged) {
      video.srcObject = current.broadcastStream;
      if (video.readyState < 1) await new Promise((resolve) => {
        let timeoutId;
        const finish = () => {
          globalThis.clearTimeout(timeoutId);
          video.removeEventListener("loadedmetadata", finish);
          resolve();
        };
        timeoutId = globalThis.setTimeout(finish, 1_000);
        video.addEventListener("loadedmetadata", finish, { once: true });
      });
    }
    if (!video.paused) return;
    try {
      await video.play();
    } catch (error) {
      reportClientError?.("broadcast_preview_play_error", error, { roomId: current.broadcastRoomId });
      setNotice?.("A prévia foi conectada, mas o navegador bloqueou a reprodução automática. Clique no vídeo para reproduzir.");
    }
  }

  async function handleWindowAudioStatus(status = {}) {
    const current = state();
    if (!current.broadcastStream || current.broadcastState !== "live" || !["ended", "error"].includes(status.status)) return;
    const previousStream = current.broadcastStream;
    previousStream.getAudioTracks().forEach((track) => track.stop());
    await stopWindowAudioBridge?.();
    try {
      const fallbackStream = await buildOutputStream?.({
        displayStream: current.broadcastDisplayStream,
        cameraStream: current.broadcastCameraStream,
        microphoneStream: current.broadcastMicrophoneStream,
        sourceAudioTrack: null,
        profile: qualityProfiles?.[current.selectedQuality],
      });
      await replaceTracks?.(fallbackStream);
      if (state().broadcastStream === previousStream) setBroadcastState?.({ broadcastStream: fallbackStream });
      const warning = status.status === "ended"
        ? "A captura de áudio da janela foi encerrada. A transmissão de vídeo continua ativa."
        : "A captura de áudio da janela falhou. A transmissão de vídeo continua ativa.";
      setState?.({ broadcastAudioWarning: warning });
      reportClientError?.("window_audio_capture_ended", new Error(warning), { status: status.status, processId: current.activeDisplayProcessId });
    } catch (error) {
      reportClientError?.("window_audio_fallback_error", error, { status: status.status, processId: current.activeDisplayProcessId });
    }
  }

  return { attachPreview, handleWindowAudioStatus };
}
