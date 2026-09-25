export function createVoicePeerRecoveryController({
  getState,
  refreshIceConfiguration,
  hasTurnServer,
  closePeer,
  createPeer,
  shouldInitiate,
  sendVoice,
  reportClientError,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  const timers = new Map();
  const inFlight = new Set();
  const recoveryCounts = new Map();
  const state = () => getState?.() || {};

  function clearParticipant(participantId) {
    const timer = timers.get(participantId);
    if (timer) clearTimeoutFn(timer);
    timers.delete(participantId);
    inFlight.delete(participantId);
  }

  function clearAll() {
    for (const participantId of timers.keys()) clearParticipant(participantId);
    inFlight.clear();
    recoveryCounts.clear();
  }

  function getRecoveryCount(participantId) {
    return recoveryCounts.get(participantId) || 0;
  }

  function schedule(participantId, delayMs = 5_000, forceRelay = false) {
    if (timers.has(participantId)) return;
    const timer = setTimeoutFn(() => {
      timers.delete(participantId);
      const peer = state().voicePeerConnections?.get(participantId);
      if (peer && ["failed", "disconnected"].includes(peer.connectionState)) {
        void recover(participantId, peer, { forceRelay });
      }
    }, delayMs);
    timers.set(participantId, timer);
  }

  async function recover(participantId, peer, { forceRelay = false } = {}) {
    const current = state();
    if (inFlight.has(participantId) || current.voiceState !== "connected" || current.voicePeerConnections?.get(participantId) !== peer) return;
    inFlight.add(participantId);
    recoveryCounts.set(participantId, getRecoveryCount(participantId) + 1);
    try {
      await refreshIceConfiguration?.(true);
      const latest = state();
      if (latest.voicePeerConnections?.get(participantId) !== peer || peer.connectionState === "closed") return;
      const useRelay = forceRelay && Boolean(hasTurnServer?.());
      const recoveryConfig = useRelay ? { ...latest.rtcConfig, iceTransportPolicy: "relay" } : latest.rtcConfig;
      if (useRelay) {
        closePeer?.(participantId);
        const initiator = Boolean(shouldInitiate?.(participantId));
        createPeer?.(participantId, initiator, recoveryConfig);
        reportClientError?.("voice_peer_recovery_recreated", new Error("A conexão de áudio foi recriada usando TURN."), { participantId, forceRelay: true, initiator });
        return;
      }
      if (peer.signalingState !== "stable") {
        schedule(participantId, 3_000, forceRelay);
        return;
      }
      reportClientError?.("voice_peer_recovery_started", new Error("Renegociando a conexão de áudio."), { participantId, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState });
      if (typeof peer.restartIce === "function") peer.restartIce();
      const offer = await peer.createOffer({ iceRestart: true });
      await peer.setLocalDescription(offer);
      sendVoice?.({ type: "voice-signal", target: participantId, payload: { kind: "offer", sdp: peer.localDescription } });
    } catch (error) {
      reportClientError?.("voice_peer_recovery_error", error, { participantId, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState });
      schedule(participantId, 10_000, forceRelay);
    } finally {
      inFlight.delete(participantId);
    }
  }

  return { clearAll, clearParticipant, getRecoveryCount, recover, schedule };
}
