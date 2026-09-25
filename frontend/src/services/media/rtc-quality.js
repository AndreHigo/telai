function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function roundMetric(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Converte um RTCStatsReport em uma amostra pequena e segura para telemetria.
 * `snapshots` é mantido pelo chamador para que o bitrate seja calculado por
 * delta, sem guardar o relatório inteiro do navegador.
 */
export function summarizeRtcQuality(stats, snapshots = new Map()) {
  const nextSnapshots = new Map(snapshots);
  let jitterMs = null;
  let packetsLost = 0;
  let packetsReceived = 0;
  let roundTripTimeMs = null;
  let bitrateKbps = 0;
  let mediaStreams = 0;

  for (const report of stats?.values?.() || []) {
    if (report.type === "candidate-pair" && (report.state === "succeeded" || report.nominated)) {
      const rtt = finiteNumber(report.currentRoundTripTime);
      if (rtt !== null) roundTripTimeMs = Math.max(roundTripTimeMs || 0, rtt * 1000);
      continue;
    }
    if (report.type !== "inbound-rtp" && report.type !== "outbound-rtp") continue;
    if (report.kind !== "audio" && report.kind !== "video" && report.mediaType !== "audio" && report.mediaType !== "video") continue;
    mediaStreams += 1;
    const jitter = finiteNumber(report.jitter);
    if (jitter !== null) jitterMs = Math.max(jitterMs || 0, jitter * 1000);
    packetsLost += Math.max(0, finiteNumber(report.packetsLost) || 0);
    packetsReceived += Math.max(0, finiteNumber(report.packetsReceived) || 0);

    const bytes = finiteNumber(report.bytesReceived ?? report.bytesSent);
    const timestamp = finiteNumber(report.timestamp);
    if (bytes === null || timestamp === null || !report.id) continue;
    const previous = snapshots.get(report.id);
    if (previous && timestamp > previous.timestamp && bytes >= previous.bytes) {
      bitrateKbps += ((bytes - previous.bytes) * 8) / (timestamp - previous.timestamp);
    }
    nextSnapshots.set(report.id, { bytes, timestamp });
  }

  return {
    sample: {
      jitterMs: roundMetric(jitterMs),
      packetsLost: Math.round(packetsLost),
      packetsReceived: Math.round(packetsReceived),
      roundTripTimeMs: roundMetric(roundTripTimeMs),
      bitrateKbps: roundMetric(bitrateKbps),
      mediaStreams,
    },
    snapshots: nextSnapshots,
  };
}
