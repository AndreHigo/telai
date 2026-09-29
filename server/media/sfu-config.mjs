export const SFU_PROVIDERS = Object.freeze({
  DISABLED: "disabled",
  LIVEKIT: "livekit",
  MEDIASOUP: "mediasoup",
});

function normalized(value) {
  return String(value || "").trim();
}

export function normalizeSfuProvider(value) {
  const provider = normalized(value).toLowerCase();
  return Object.values(SFU_PROVIDERS).includes(provider) ? provider : SFU_PROVIDERS.DISABLED;
}

export function createSfuConfig({ env = process.env } = {}) {
  const provider = normalizeSfuProvider(env.TELAI_SFU_PROVIDER);
  const enabled = String(env.TELAI_SFU_ENABLED || "false").trim().toLowerCase() === "true" && provider !== SFU_PROVIDERS.DISABLED;
  const endpoint = normalized(env.TELAI_SFU_ENDPOINT).replace(/\/+$/, "");
  const apiKey = normalized(env.TELAI_SFU_API_KEY);
  const apiSecret = normalized(env.TELAI_SFU_API_SECRET);
  const roomPrefix = normalized(env.TELAI_SFU_ROOM_PREFIX || "telai-").replace(/[^a-z0-9_-]/gi, "-").slice(0, 48) || "telai-";

  if (enabled && !endpoint) throw new Error("sfu-endpoint-required");
  if (enabled && provider === SFU_PROVIDERS.LIVEKIT && (!apiKey || !apiSecret)) {
    throw new Error("livekit-credentials-required");
  }

  return Object.freeze({ enabled, provider, endpoint, apiKey, apiSecret, roomPrefix });
}

export function publicSfuConfig(config = {}) {
  return Object.freeze({
    enabled: Boolean(config.enabled),
    provider: config.enabled ? normalizeSfuProvider(config.provider) : SFU_PROVIDERS.DISABLED,
    endpoint: config.enabled ? normalized(config.endpoint) : "",
    roomPrefix: config.enabled ? normalized(config.roomPrefix || "telai-") : "",
  });
}
