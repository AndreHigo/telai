const DEFAULT_GRACE_MS = 4_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

export function createVoicePeerHealthController({
  getPeerConnections,
  getPeerAudioHealth,
  getNow = () => Date.now(),
  hasTurnServer,
  recoverPeer,
  markRelayRecoveryAttempted,
  reportClientError,
  graceMs = DEFAULT_GRACE_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  let timer = null;
  let inFlight = false;

  function stop() {
    if (timer) clearIntervalFn(timer);
    timer = null;
    inFlight = false;
  }

  async function poll() {
    const peers = getPeerConnections?.();
    const healthByParticipant = getPeerAudioHealth?.();
    if (inFlight || !peers?.size || !healthByParticipant?.size) return;
    inFlight = true;
    try {
      const now = getNow();
      for (const [participantId, peer] of peers) {
        if (["connected", "completed"].includes(peer.connectionState) && !healthByParticipant.has(participantId)) {
          healthByParticipant.set(participantId, {
            firstTrackAt: now,
            lastProgressAt: now,
            lastBytes: 0,
            recoveryAttempted: false,
          });
        }
        const health = healthByParticipant.get(participantId);
        if (!health || health.recoveryAttempted || !["connected", "completed"].includes(peer.connectionState) || typeof peer.getStats !== "function") continue;
        const stats = await peer.getStats();
        let receivedProgress = 0;
        for (const report of stats.values()) {
          if (report.type !== "inbound-rtp" || (report.kind !== "audio" && report.mediaType !== "audio")) continue;
          receivedProgress = Math.max(receivedProgress, Number(report.bytesReceived || 0), Number(report.packetsReceived || 0));
        }
        if (receivedProgress > health.lastBytes) {
          health.lastBytes = receivedProgress;
          health.lastProgressAt = now;
          continue;
        }
        if (now - health.firstTrackAt >= graceMs && now - health.lastProgressAt >= graceMs) {
          health.recoveryAttempted = true;
          markRelayRecoveryAttempted?.(participantId);
          const forceRelay = Boolean(hasTurnServer?.());
          reportClientError?.("voice_peer_audio_stalled", new Error("O par de voz conectou, mas não está recebendo áudio."), {
            participantId,
            connectionState: peer.connectionState,
            iceConnectionState: peer.iceConnectionState,
            forceRelay,
          });
          void recoverPeer?.(participantId, peer, { forceRelay });
        }
      }
    } catch (error) {
      reportClientError?.("voice_peer_audio_health_error", error, { voicePeers: peers?.size || 0 });
    } finally {
      inFlight = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setIntervalFn(() => { void poll(); }, pollIntervalMs);
  }

  return { poll, start, stop };
}
