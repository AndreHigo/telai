export function createBroadcastRuntimeController({
  getState,
  hasLiveBroadcastCapture,
  reportClientError,
  setState,
  stopBroadcast,
}) {
  const state = () => getState?.() || {};

  function sendBroadcast(message) {
    const socket = state().broadcastSocket;
    const openState = globalThis.WebSocket?.OPEN ?? 1;
    if (socket?.readyState === openState) socket.send(JSON.stringify(message));
  }

  function clearBroadcastCaptureRecoveryTimer() {
    const timer = state().broadcastCaptureRecoveryTimer;
    if (timer) globalThis.clearTimeout(timer);
    setState({ broadcastCaptureRecoveryTimer: null });
  }

  function handleBroadcastVideoTrackEnded(track) {
    const current = state();
    const isActiveCaptureTrack = track && (
      current.broadcastStream?.getVideoTracks?.()[0] === track
      || current.broadcastDisplayStream?.getVideoTracks?.()[0] === track
      || current.broadcastCameraStream?.getVideoTracks?.()[0] === track
    );
    if (!isActiveCaptureTrack) return;
    const context = { roomId: current.broadcastRoomId, streamId: current.broadcastStreamId, sourceType: current.broadcastSourceType, mediaMode: current.mediaMode };
    const message = "A captura de vídeo foi encerrada. Troque a janela ou tela para continuar; a live ficará aberta por até 60 segundos.";
    reportClientError("broadcast_video_capture_ended", new Error(message), context);
    if (current.broadcastState === "starting") {
      void stopBroadcast("capture-ended-before-start");
      return;
    }
    if (current.broadcastState !== "live" || current.broadcastCaptureRecoveryTimer) return;
    setState({ broadcastAudioWarning: message });
    const timer = globalThis.setTimeout(() => {
      setState({ broadcastCaptureRecoveryTimer: null });
      const latest = state();
      if (latest.broadcastState === "live" && !hasLiveBroadcastCapture()) void stopBroadcast("capture-timeout");
    }, 60_000);
    setState({ broadcastCaptureRecoveryTimer: timer });
  }

  function sendBroadcastChatMessage() {
    const current = state();
    const body = String(current.broadcastChatDraft || "").trim();
    if (current.broadcastState !== "live" || !body) return;
    sendBroadcast({ type: "chat-message", body });
    setState({ broadcastChatDraft: "" });
  }

  return {
    clearBroadcastCaptureRecoveryTimer,
    handleBroadcastVideoTrackEnded,
    sendBroadcast,
    sendBroadcastChatMessage,
  };
}
