export function createGatewayPolicy({
  rtcSignalPayloadMaxBytes,
  rtcSignalRateWindowMs,
  rtcSignalRateLimit,
  voiceSpeakingRateWindowMs,
  voiceSpeakingRateLimit,
  warnLog,
}) {
  function normalizeRtcSignalPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const kind = payload.kind;
    if (kind === "offer" || kind === "answer") {
      const sdp = payload.sdp;
      if (!sdp || typeof sdp !== "object" || Array.isArray(sdp)) return null;
      if (sdp.type !== kind || typeof sdp.sdp !== "string" || !sdp.sdp || sdp.sdp.length > 48 * 1024) return null;
      const normalized = { kind, sdp: { type: kind, sdp: sdp.sdp } };
      return Buffer.byteLength(JSON.stringify(normalized)) <= rtcSignalPayloadMaxBytes ? normalized : null;
    }
    if (kind === "candidate") {
      const candidate = payload.candidate;
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
      if (typeof candidate.candidate !== "string" || candidate.candidate.length > 16 * 1024) return null;
      if (candidate.sdpMid != null && (typeof candidate.sdpMid !== "string" || candidate.sdpMid.length > 256)) return null;
      if (candidate.sdpMLineIndex != null && (!Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0 || candidate.sdpMLineIndex > 64)) return null;
      if (candidate.usernameFragment != null && (typeof candidate.usernameFragment !== "string" || candidate.usernameFragment.length > 256)) return null;
      const normalized = {
        kind,
        candidate: {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid ?? null,
          sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          ...(candidate.usernameFragment == null ? {} : { usernameFragment: candidate.usernameFragment }),
        },
      };
      return Buffer.byteLength(JSON.stringify(normalized)) <= rtcSignalPayloadMaxBytes ? normalized : null;
    }
    return null;
  }

  function allowRtcSignal(socket) {
    const now = Date.now();
    socket.rtcSignalTimestamps = (socket.rtcSignalTimestamps || []).filter((timestamp) => now - timestamp < rtcSignalRateWindowMs);
    if (socket.rtcSignalTimestamps.length >= rtcSignalRateLimit) return false;
    socket.rtcSignalTimestamps.push(now);
    return true;
  }

  function allowVoiceSpeakingUpdate(socket) {
    const now = Date.now();
    socket.voiceSpeakingTimestamps = (socket.voiceSpeakingTimestamps || []).filter((timestamp) => now - timestamp < voiceSpeakingRateWindowMs);
    if (socket.voiceSpeakingTimestamps.length >= voiceSpeakingRateLimit) return false;
    socket.voiceSpeakingTimestamps.push(now);
    return true;
  }

  function reportVoiceSpeakingRateLimited(socket) {
    const now = Date.now();
    socket.voiceSpeakingRateLimitedCount = (socket.voiceSpeakingRateLimitedCount || 0) + 1;
    if (now - (socket.voiceSpeakingRateLimitedLoggedAt || 0) < 5_000) return;
    const dropped = socket.voiceSpeakingRateLimitedCount;
    socket.voiceSpeakingRateLimitedCount = 0;
    socket.voiceSpeakingRateLimitedLoggedAt = now;
    warnLog("voice_speaking_rate_limited", { clientId: socket.clientId, voiceRoomId: socket.voiceRoomId, dropped });
  }

  function allowWebsocketControlMessage(socket) {
    const now = Date.now();
    socket.controlMessageTimestamps = (socket.controlMessageTimestamps || []).filter((timestamp) => now - timestamp < 10_000);
    if (socket.controlMessageTimestamps.length >= 240) return false;
    socket.controlMessageTimestamps.push(now);
    return true;
  }

  return {
    allowRtcSignal,
    allowVoiceSpeakingUpdate,
    allowWebsocketControlMessage,
    normalizeRtcSignalPayload,
    reportVoiceSpeakingRateLimited,
  };
}
