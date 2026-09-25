const DEFAULT_POLL_INTERVAL_MS = 10_000;

export function createVoiceQualityController({
  getPeerConnections,
  getRecoveryCount = () => 0,
  reportClientError,
  loadQualityModule = () => import("../../services/media/rtc-quality.js"),
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  let timer = null;
  let inFlight = false;
  let snapshotsByParticipant = new Map();

  function stop() {
    if (timer) clearIntervalFn(timer);
    timer = null;
    inFlight = false;
    snapshotsByParticipant = new Map();
  }

  async function poll() {
    const peers = getPeerConnections?.();
    if (inFlight || !peers?.size) return;
    inFlight = true;
    try {
      const { summarizeRtcQuality } = await loadQualityModule();
      const samples = [];
      const activeParticipantIds = new Set();
      for (const [participantId, peer] of peers) {
        if (peer?.connectionState === "closed" || typeof peer?.getStats !== "function") continue;
        activeParticipantIds.add(participantId);
        const result = summarizeRtcQuality(await peer.getStats(), snapshotsByParticipant.get(participantId));
        snapshotsByParticipant.set(participantId, result.snapshots);
        if (!result.sample.mediaStreams) continue;
        samples.push({
          participantId,
          connectionState: peer.connectionState,
          iceConnectionState: peer.iceConnectionState,
          reconnectionCount: Number(getRecoveryCount(participantId)) || 0,
          ...result.sample,
        });
      }
      for (const participantId of snapshotsByParticipant.keys()) {
        if (!activeParticipantIds.has(participantId)) snapshotsByParticipant.delete(participantId);
      }
      if (samples.length) {
        reportClientError?.("voice_rtc_quality", new Error("Amostra de qualidade RTC."), {
          peerCount: peers.size,
          samples,
        });
      }
    } catch (error) {
      reportClientError?.("voice_rtc_quality_error", error, { voicePeers: peers?.size || 0 });
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
