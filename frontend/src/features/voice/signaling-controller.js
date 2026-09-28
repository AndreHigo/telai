export function shouldInitiateVoicePeer(clientId, participantId) {
  if (!clientId || !participantId) return false;
  return String(clientId) < String(participantId);
}

export function createVoiceSignalingController({
  getState,
  setState,
  createPeer,
  closePeer,
  sendVoice,
  reportClientError,
} = {}) {
  const state = () => getState?.() || {};

  async function handleSignal(message) {
    const current = state();
    const participantId = String(message?.from || "").trim();
    const payload = message?.payload;
    if (!current.voiceRoomId || !participantId || participantId === current.voiceClientId || !payload || typeof payload !== "object") return;
    if (!current.voiceParticipants?.has(participantId)) {
      const pending = current.voicePendingSignals?.get(participantId) || [];
      current.voicePendingSignals?.set(participantId, [...pending, message].slice(-96));
      return;
    }

    let peer = current.voicePeerConnections?.get(participantId);
    if (peer?.connectionState === "closed") {
      closePeer?.(participantId);
      peer = null;
    }
    peer ||= createPeer?.(participantId);
    if (!peer) return;

    if (payload.kind === "candidate") {
      if (!payload.candidate || typeof payload.candidate !== "object") return;
      if (peer.remoteDescription) {
        await peer.addIceCandidate(payload.candidate).catch((error) => reportClientError?.("voice_candidate_error", error, { participantId }));
      } else {
        const pending = current.voicePendingCandidates?.get(participantId) || [];
        current.voicePendingCandidates?.set(participantId, [...pending, payload.candidate].slice(-64));
      }
      return;
    }

    if (payload.kind === "offer") {
      if (peer.signalingState === "have-local-offer") await peer.setLocalDescription({ type: "rollback" });
      if (peer.signalingState === "have-remote-offer") return;
      await peer.setRemoteDescription(payload.sdp);
      const latest = state();
      if (latest.voicePeerConnections?.get(participantId) !== peer || peer.connectionState === "closed") return;
      for (const candidate of latest.voicePendingCandidates?.get(participantId) || []) {
        await peer.addIceCandidate(candidate).catch((error) => reportClientError?.("voice_pending_candidate_error", error, { participantId }));
      }
      latest.voicePendingCandidates?.delete(participantId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      if (state().voicePeerConnections?.get(participantId) !== peer || peer.connectionState === "closed") return;
      sendVoice?.({ type: "voice-signal", target: participantId, payload: { kind: "answer", sdp: peer.localDescription } });
    } else if (payload.kind === "answer") {
      if (peer.signalingState !== "have-local-offer") return;
      await peer.setRemoteDescription(payload.sdp);
      const latest = state();
      for (const candidate of latest.voicePendingCandidates?.get(participantId) || []) {
        await peer.addIceCandidate(candidate).catch((error) => reportClientError?.("voice_pending_candidate_error", error, { participantId }));
      }
      latest.voicePendingCandidates?.delete(participantId);
    }
  }

  function enqueueSignal(message) {
    const participantId = String(message?.from || "").trim();
    if (!participantId) return;
    const current = state();
    const previous = current.voiceSignalQueues?.get(participantId) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => handleSignal(message))
      .catch((error) => {
        const latest = state();
        reportClientError?.("voice_signal_processing_error", error, {
          roomId: latest.voiceRoomId,
          participantId,
          signalKind: message?.payload?.kind || "unknown",
          signalingState: latest.voicePeerConnections?.get(participantId)?.signalingState || "closed",
        });
        if (latest.voiceState === "connected" && latest.voiceRoomId) {
          setState?.({ voiceError: "A conexão de áudio com um participante apresentou uma falha. Tentando recuperar…" });
        }
      })
      .finally(() => {
        if (state().voiceSignalQueues?.get(participantId) === next) state().voiceSignalQueues.delete(participantId);
      });
    current.voiceSignalQueues?.set(participantId, next);
    return next;
  }

  function clearParticipant(participantId) {
    state().voiceSignalQueues?.delete(participantId);
  }

  return { clearParticipant, enqueueSignal, handleSignal };
}
