const MINUTE_MS = 60_000;

function positiveLimit(env, key, fallback, minimum = 1) {
  return Math.max(minimum, Number(env[key] || fallback));
}

/**
 * Centraliza limites configuráveis e os buckets voláteis do processo.
 * Os mapas permanecem por instância; a proteção distribuída continua sendo
 * responsabilidade do proxy quando houver mais de um processo.
 */
export function createRuntimeLimits({ env = process.env } = {}) {
  const downloadRateLimitPerMinute = positiveLimit(env, "MIRANTE_DOWNLOAD_RATE_LIMIT_PER_MIN", 20);
  const downloadRateWindowMs = MINUTE_MS;
  const downloadRate = new Map();
  const clientErrorRateLimitPerMinute = positiveLimit(env, "MIRANTE_CLIENT_ERROR_RATE_LIMIT_PER_MIN", 60);
  const clientErrorRate = new Map();
  const routineClientDiagnosticKinds = new Set([
    "voice_activity_sample",
    "voice_activity_state",
    "voice_activity_analyzer_ready",
    "voice_rtc_quality",
  ]);
  const loginRateLimitPerMinute = positiveLimit(env, "MIRANTE_LOGIN_RATE_LIMIT_PER_MIN", 12);
  const loginRateWindowMs = MINUTE_MS;
  const loginRate = new Map();

  // Limites de aplicação: o Telai roda como uma única instância atrás do Caddy,
  // então um bucket em memória protege o processo sem adicionar dependências.
  const apiRateLimitPerMinute = positiveLimit(env, "MIRANTE_API_RATE_LIMIT_PER_MIN", 240, 30);
  const apiWriteRateLimitPerMinute = positiveLimit(env, "MIRANTE_API_WRITE_RATE_LIMIT_PER_MIN", 90, 15);
  // O overview inclui mensagens, avatares e salas; a presença tem uma rota leve.
  const groupOverviewRateLimitPerMinute = positiveLimit(env, "MIRANTE_GROUP_OVERVIEW_RATE_LIMIT_PER_MIN", 12, 2);
  const apiGlobalRateLimitPerMinute = positiveLimit(env, "MIRANTE_API_GLOBAL_RATE_LIMIT_PER_MIN", 900, 120);
  const apiRegisterRateLimit = positiveLimit(env, "MIRANTE_REGISTER_RATE_LIMIT", 5);
  const apiRegisterRateWindowMs = 15 * MINUTE_MS;
  const apiOAuthRateLimit = positiveLimit(env, "MIRANTE_OAUTH_RATE_LIMIT", 20);
  const apiOAuthRateWindowMs = 10 * MINUTE_MS;
  const apiRateWindowMs = MINUTE_MS;
  const maxRateLimitEntries = positiveLimit(env, "MIRANTE_RATE_LIMIT_MAX_KEYS", 10_000, 1000);
  const apiRate = new Map();
  const apiWriteRate = new Map();
  const apiGlobalRate = new Map();
  const registerRate = new Map();
  const oauthRate = new Map();
  const loginFailureLimit = positiveLimit(env, "MIRANTE_LOGIN_FAILURE_LIMIT", 5);
  const loginFailureIpLimit = Math.max(loginFailureLimit, Number(env.MIRANTE_LOGIN_FAILURE_IP_LIMIT || 30));
  const loginFailureWindowMs = 15 * MINUTE_MS;
  const loginFailures = new Map();
  const websocketConnectionRateLimit = positiveLimit(env, "MIRANTE_WS_CONNECTION_RATE_LIMIT", 30, 5);
  const websocketConnectionRateWindowMs = MINUTE_MS;
  const websocketActiveConnectionLimit = positiveLimit(env, "MIRANTE_WS_ACTIVE_CONNECTION_LIMIT", 20, 2);
  const websocketConnectionRate = new Map();
  const websocketActiveByIp = new Map();

  return {
    downloadRateLimitPerMinute,
    downloadRateWindowMs,
    downloadRate,
    clientErrorRateLimitPerMinute,
    clientErrorRate,
    routineClientDiagnosticKinds,
    loginRateLimitPerMinute,
    loginRateWindowMs,
    loginRate,
    apiRateLimitPerMinute,
    apiWriteRateLimitPerMinute,
    groupOverviewRateLimitPerMinute,
    apiGlobalRateLimitPerMinute,
    apiRegisterRateLimit,
    apiRegisterRateWindowMs,
    apiOAuthRateLimit,
    apiOAuthRateWindowMs,
    apiRateWindowMs,
    maxRateLimitEntries,
    apiRate,
    apiWriteRate,
    apiGlobalRate,
    registerRate,
    oauthRate,
    loginFailureLimit,
    loginFailureIpLimit,
    loginFailureWindowMs,
    loginFailures,
    websocketConnectionRateLimit,
    websocketConnectionRateWindowMs,
    websocketActiveConnectionLimit,
    websocketConnectionRate,
    websocketActiveByIp,
    websocketTextMessageMaxBytes: 256 * 1024,
    relayChunkMaxBytes: 2 * 1024 * 1024,
    relayRecentBytesMax: 8 * 1024 * 1024,
    rtcSignalPayloadMaxBytes: 64 * 1024,
    rtcSignalRateWindowMs: 10_000,
    rtcSignalRateLimit: 120,
    voiceSpeakingRateWindowMs: 10_000,
    voiceSpeakingRateLimit: 40,
    voiceRoomMinParticipants: 1,
    voiceRoomMaxParticipants: 50,
    maxOAuthStates: 1000,
    // O upload aceita até 5 MB, mas a resposta base64 precisa de margem.
    maxAvatarUploadLength: 7 * 1024 * 1024,
  };
}
