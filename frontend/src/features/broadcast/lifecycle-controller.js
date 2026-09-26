export function createBroadcastLifecycleController({
  api,
  clearBroadcastCaptureRecoveryTimer,
  getState,
  loadStreams,
  refreshGroupOverview,
  reportClientError,
  sendBroadcast,
  setNotice,
  setState,
  stopBroadcastAudioMix,
  stopBroadcastVideoComposition,
  stopRelayRecorder,
  stopVoiceInputStream,
  stopWindowAudioBridge,
}) {
  let stopPromise = null;
  const state = () => getState?.() || {};

  async function stop(reason = "user") {
    if (stopPromise) return stopPromise;
    const endingStreamId = state().broadcastStreamId;
    clearBroadcastCaptureRecoveryTimer();
    stopPromise = (async () => {
      setState({ broadcastState: "stopping" });

      try { await stopRelayRecorder(); } catch (error) { console.warn("Falha ao parar o gravador da live:", error); }
      try { sendBroadcast({ type: "stop", reason }); sendBroadcast({ type: "leave" }); } catch (error) { console.warn("Falha ao avisar o encerramento da live:", error); }

      const current = state();
      const socket = current.broadcastSocket;
      try { socket?.close(); } catch (error) { console.warn("Falha ao fechar a conexão da live:", error); }
      for (const peer of current.peerConnections.values()) {
        for (const sender of peer.getSenders?.() || []) {
          try { await sender.replaceTrack(null); } catch {}
        }
        try { peer.close(); } catch (error) { console.warn("Falha ao fechar conexão de espectador:", error); }
      }
      current.peerConnections.clear();
      for (const timer of current.broadcastPeerRetryTimers.values()) globalThis.clearTimeout(timer);
      current.broadcastPeerRetryTimers.clear();
      current.pendingBroadcastCandidates.clear();
      current.broadcastPeerNegotiations.clear();
      setState({ broadcastSocket: null });

      try { await stopWindowAudioBridge(); } catch (error) { console.warn("Falha ao parar o áudio da janela:", error); }
      const stream = current.broadcastStream;
      setState({ broadcastStream: null });
      if (current.broadcastVideo) current.broadcastVideo.srcObject = null;
      try { stream?.getTracks().forEach((track) => track.stop()); } catch (error) { console.warn("Falha ao liberar a captura da live:", error); }
      stopVoiceInputStream(current.broadcastMicrophoneStream);
      setState({ broadcastMicrophoneStream: null });
      stopBroadcastVideoComposition();
      await stopBroadcastAudioMix();
      try { current.broadcastDisplayStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      try { current.broadcastCameraStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      setState({ broadcastDisplayStream: null, broadcastCameraStream: null, broadcastCameraEnabled: false, broadcastSourceAudioTrack: null });

      let endConfirmed = !endingStreamId;
      if (endingStreamId) {
        try {
          await api(`/api/streams/${endingStreamId}/end`, { method: "POST" });
          endConfirmed = true;
        } catch (error) {
          endConfirmed = false;
          reportClientError("broadcast_end_confirmation_error", error, { streamId: endingStreamId, mediaMode: current.mediaMode });
          setState({ broadcastError: "A captura local foi encerrada, mas o servidor não confirmou o fim da live. Tente confirmar novamente." });
        }
      }

      setState({ broadcastStreamId: endConfirmed ? "" : endingStreamId, broadcastRoomId: "", broadcastInvite: "", viewerCount: 0 });
      setState({ broadcastChatMessages: [], broadcastChatMessageIds: new Set(), broadcastChatDraft: "" });
      setState({ broadcastSourceType: "screen", broadcastDisplaySurface: null, broadcastSelectedSourceName: "", broadcastSelectionKind: "screen", activeDisplayProcessId: null, broadcastSourceSwitching: false, broadcastMediaSwitching: false, broadcastState: endConfirmed ? "idle" : "error" });
      await loadStreams().catch((error) => console.warn("Falha ao atualizar as lives depois do encerramento:", error));
      if (state().selectedGroupId) await refreshGroupOverview().catch((error) => console.warn("Falha ao atualizar o grupo depois do encerramento:", error));
    })().catch((error) => {
      reportClientError("broadcast_stop_error", error, { streamId: endingStreamId, mediaMode: state().mediaMode });
      console.error("Erro inesperado ao encerrar a live:", error);
      setState({ broadcastState: endingStreamId ? "error" : "idle", broadcastError: endingStreamId ? "Não foi possível confirmar o encerramento da transmissão. Tente novamente." : "" });
      setNotice(endingStreamId ? "A live precisa de confirmação do servidor." : "A transmissão foi encerrada.");
    });
    try {
      return await stopPromise;
    } finally {
      stopPromise = null;
    }
  }

  return { stop };
}
