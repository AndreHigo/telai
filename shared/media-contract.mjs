export const MEDIA_MODES = Object.freeze({
  P2P: "p2p",
  RELAY: "relay",
});

export const BROADCAST_QUALITY_PROFILES = Object.freeze({
  economy: Object.freeze({ label: "Econômica", width: 960, height: 540, maxFramerate: 30, maxBitrate: 1_200_000 }),
  balanced: Object.freeze({ label: "Equilibrada", width: 1280, height: 720, maxFramerate: 30, maxBitrate: 2_500_000 }),
  high: Object.freeze({ label: "Alta", width: 1920, height: 1080, maxFramerate: 60, maxBitrate: 6_000_000 }),
});

export const BROADCAST_QUALITY_LABELS = Object.freeze({
  auto: "Automática",
  ...Object.fromEntries(Object.entries(BROADCAST_QUALITY_PROFILES).map(([key, profile]) => [key, profile.label])),
});

export function normalizeMediaMode(value) {
  return value === MEDIA_MODES.RELAY ? MEDIA_MODES.RELAY : MEDIA_MODES.P2P;
}

export function normalizeBroadcastQuality(value) {
  return Object.hasOwn(BROADCAST_QUALITY_PROFILES, value) ? value : "balanced";
}

export function hasTurnServer(configuration) {
  const iceServers = Array.isArray(configuration) ? configuration : configuration?.iceServers;
  return (iceServers || []).some((server) => {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    return urls.some((url) => /^turns?:/i.test(String(url || "")));
  });
}

export function withRelayIceTransportPolicy(configuration) {
  return { ...(configuration || {}), iceTransportPolicy: "relay" };
}
