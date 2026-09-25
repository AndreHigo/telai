import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash, createHmac } from "node:crypto";
import { WebSocketServer } from "ws";
import { sendEmail, sendGroupInviteEmail, smtpStatus, verifySmtp } from "./mailer.mjs";
import { createRuntimeConfig } from "./server/config/runtime.mjs";
import { installWebsocketHeartbeat } from "./server/gateway/heartbeat.mjs";
import { createDirectConversationRepository } from "./server/repositories/direct-conversations.mjs";
import { createGroupAccessRepository } from "./server/repositories/groups.mjs";
import { createNotificationRepository } from "./server/repositories/notifications.mjs";
import { ensureColumn, openSqliteDatabase } from "./server/repositories/sqlite.mjs";
import { createSessionRepository } from "./server/repositories/sessions.mjs";
import { json, readJson } from "./server/http/body.mjs";
import { parseVoiceRoomParticipantLimit, roomSlugFor, slugFor } from "./server/domain/groups/normalization.mjs";
import { normalizePreferenceDeviceId, normalizePreferenceVolume, normalizeUsername, parseChannelGames, safePreferenceColor } from "./server/shared/validation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
// O banco e a autenticação pertencem ao Telai; não dependemos de Supabase.
const runtimeStartedAt = Date.now();
// Uma atualização/F5 fecha o WebSocket antigo, mas o navegador não consegue
// preservar a captura. Mantemos a sala viva por alguns segundos para o host
// escolher "Retomar transmissão" e reconectar a mesma live.
// Um restart perde o mapa de salas, mas não deve encerrar imediatamente uma
// live que ainda pode ser retomada pelo host. Depois desta janela, uma linha
// antiga sem sessão runtime pode ser limpa com segurança.
const packageMetadata = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const {
  defaultPort,
  defaultHost,
  mediaMode,
  requireLogin,
  hostReconnectGraceMs,
  streamOrphanGraceMs,
  dataDir,
  databasePath,
  legalPolicyVersion,
  desktopArtifactName,
  desktopArtifactPath,
  desktopReleaseDir,
  logLevels,
  logLevel,
  logPath,
} = createRuntimeConfig({ rootDir: __dirname, packageVersion: packageMetadata.version });
const siteAdminUserIds = new Set(String(process.env.TELAI_ADMIN_USER_IDS || "")
  .split(",").map((value) => value.trim()).filter(Boolean));
const siteAdminUsernames = new Set(String(process.env.TELAI_ADMIN_USERNAMES || "")
  .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
const maintenanceToken = String(process.env.TELAI_MAINTENANCE_TOKEN || process.env.MIRANTE_MAINTENANCE_TOKEN || "").trim();
// A versão identifica exatamente qual texto jurídico foi aceito pelo titular.
// Ela pode ser trocada no ambiente quando uma nova política entrar em vigor.
let logFileStream = null;
if (logPath) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    logFileStream = fs.createWriteStream(logPath, { flags: "a" });
    logFileStream.on("error", (error) => console.error(JSON.stringify({ event: "log_file_error", error: error.message })));
  } catch (error) {
    console.error(JSON.stringify({ event: "log_file_open_error", path: path.basename(logPath), error: error.message }));
  }
}
const rooms = new Map();
const voiceRooms = new Map();
const groupPresence = new Map();
const oauthStates = new Map();
const observability = {
  startedAt: new Date().toISOString(),
  activeRequests: 0,
  requestsTotal: 0,
  requestsCompleted: 0,
  requestsAborted: 0,
  responseBytes: 0,
  statusCounts: new Map(),
  routeCounts: new Map(),
  routeBytes: new Map(),
  clientEventCounts: new Map(),
  websocket: {
    active: 0,
    connections: 0,
    closed: 0,
    messagesIn: 0,
    messagesOut: 0,
    bytesIn: 0,
    bytesOut: 0,
  },
  recentEvents: [],
};
const downloadRateLimitPerMinute = Math.max(1, Number(process.env.MIRANTE_DOWNLOAD_RATE_LIMIT_PER_MIN || 20));
const downloadRateWindowMs = 60_000;
const downloadRate = new Map();
const clientErrorRateLimitPerMinute = Math.max(1, Number(process.env.MIRANTE_CLIENT_ERROR_RATE_LIMIT_PER_MIN || 60));
const clientErrorRate = new Map();
const routineClientDiagnosticKinds = new Set(["voice_activity_sample", "voice_activity_state", "voice_activity_analyzer_ready"]);
const loginRateLimitPerMinute = Math.max(1, Number(process.env.MIRANTE_LOGIN_RATE_LIMIT_PER_MIN || 12));
const loginRateWindowMs = 60_000;
const loginRate = new Map();
// Limites de aplicação: o Telai roda como uma única instância atrás do Caddy,
// então um bucket em memória protege o processo sem adicionar uma dependência
// externa. O limite do proxy continua sendo recomendado para múltiplas réplicas.
const apiRateLimitPerMinute = Math.max(30, Number(process.env.MIRANTE_API_RATE_LIMIT_PER_MIN || 240));
const apiWriteRateLimitPerMinute = Math.max(15, Number(process.env.MIRANTE_API_WRITE_RATE_LIMIT_PER_MIN || 90));
// O overview do grupo inclui mensagens, avatares e salas. Ele não deve ser
// usado como heartbeat: um cliente preso pode transformar poucos GETs em
// dezenas de megabytes por minuto. A presença tem uma rota própria e leve.
const groupOverviewRateLimitPerMinute = Math.max(2, Number(process.env.MIRANTE_GROUP_OVERVIEW_RATE_LIMIT_PER_MIN || 12));
// O limite por rota evita que uma ação comum consuma o orçamento de outra.
// Este teto agregado continua impedindo abuso distribuído entre muitas rotas.
const apiGlobalRateLimitPerMinute = Math.max(120, Number(process.env.MIRANTE_API_GLOBAL_RATE_LIMIT_PER_MIN || 900));
const apiRegisterRateLimit = Math.max(1, Number(process.env.MIRANTE_REGISTER_RATE_LIMIT || 5));
const apiRegisterRateWindowMs = 15 * 60_000;
const apiOAuthRateLimit = Math.max(1, Number(process.env.MIRANTE_OAUTH_RATE_LIMIT || 20));
const apiOAuthRateWindowMs = 10 * 60_000;
const apiRateWindowMs = 60_000;
const maxRateLimitEntries = Math.max(1000, Number(process.env.MIRANTE_RATE_LIMIT_MAX_KEYS || 10_000));
const apiRate = new Map();
const apiWriteRate = new Map();
const apiGlobalRate = new Map();
const registerRate = new Map();
const oauthRate = new Map();
const loginFailureLimit = Math.max(1, Number(process.env.MIRANTE_LOGIN_FAILURE_LIMIT || 5));
const loginFailureIpLimit = Math.max(loginFailureLimit, Number(process.env.MIRANTE_LOGIN_FAILURE_IP_LIMIT || 30));
const loginFailureWindowMs = 15 * 60_000;
const loginFailures = new Map();
const websocketConnectionRateLimit = Math.max(5, Number(process.env.MIRANTE_WS_CONNECTION_RATE_LIMIT || 30));
const websocketConnectionRateWindowMs = 60_000;
const websocketActiveConnectionLimit = Math.max(2, Number(process.env.MIRANTE_WS_ACTIVE_CONNECTION_LIMIT || 20));
const websocketConnectionRate = new Map();
const websocketActiveByIp = new Map();
const websocketTextMessageMaxBytes = 256 * 1024;
const relayChunkMaxBytes = 2 * 1024 * 1024;
const relayRecentBytesMax = 8 * 1024 * 1024;
const rtcSignalPayloadMaxBytes = 64 * 1024;
const rtcSignalRateWindowMs = 10_000;
const rtcSignalRateLimit = 120;
const voiceSpeakingRateWindowMs = 10_000;
const voiceSpeakingRateLimit = 40;
const voiceRoomMinParticipants = 1;
const voiceRoomMaxParticipants = 50;
const maxOAuthStates = 1000;
// O upload aceita até 5 MB, mas uma imagem grande não deve ser repetida em
// listas e mensagens. O limite de resposta é separado e considera o aumento
// aproximado de 4/3 causado pela codificação base64.
const maxAvatarUploadLength = 7 * 1024 * 1024;
const maxInlineAvatarLength = 128 * 1024;

function compactAvatarData(value) {
  const avatarData = String(value || "");
  return avatarData && avatarData.length <= maxInlineAvatarLength ? avatarData : null;
}

function compactUserSummary(user) {
  return user ? { ...user, avatarData: compactAvatarData(user.avatarData) } : user;
}

function trustedForwardedHeaders(request) {
  // O app fica atrás do Caddy/Nginx local. Um cliente externo que alcance o
  // Node diretamente não pode escolher o IP, host ou protocolo encaminhado.
  return isLoopback(request.socket.remoteAddress);
}

function clientIp(request) {
  const forwarded = trustedForwardedHeaders(request)
    ? String(request.headers["x-forwarded-for"] || "").split(",")[0].trim()
    : "";
  return forwarded || request.socket.remoteAddress || "unknown";
}

function safeLogValue(value, key = "", depth = 0) {
  const sensitiveKey = /token|secret|password|credential|authorization|cookie|body|sdp|candidate|payload|avatardata|avatar_data|access_token|refresh_token/i.test(key);
  if (sensitiveKey) return "[redacted]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (depth > 2) return "[truncated]";
  if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 237)}...` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeLogValue(item, key, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([childKey, childValue]) => [childKey, safeLogValue(childValue, childKey, depth + 1)]));
  }
  return String(value);
}

function logEvent(level, event, fields = {}) {
  if (logLevels[level] > logLevels[logLevel]) return;
  const entry = { time: new Date().toISOString(), level, event, ...safeLogValue(fields) };
  const line = JSON.stringify(entry);
  observability.recentEvents.push(entry);
  if (observability.recentEvents.length > 100) observability.recentEvents.shift();
  if (logFileStream) logFileStream.write(`${line}\n`);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

const debugLog = (event, fields) => logEvent("debug", event, fields);
const infoLog = (event, fields) => logEvent("info", event, fields);
const warnLog = (event, fields) => logEvent("warn", event, fields);
const errorLog = (event, fields) => logEvent("error", event, fields);

process.on("uncaughtExceptionMonitor", (error) => {
  errorLog("process_uncaught_exception", { name: error?.name, error: error?.message, stack: error?.stack });
});
process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  errorLog("process_unhandled_rejection", { name: error.name, error: error.message, stack: error.stack });
});

function metricRoute(pathname) {
  if (pathname === "/download") return "/download";
  if (pathname.startsWith("/updates/")) return "/updates/*";
  if (pathname === "/signal") return "/signal";
  const apiMatch = pathname.match(/^\/api\/([^/]+)/);
  return apiMatch ? `/api/${apiMatch[1]}` : pathname || "/";
}

function addMapCount(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function addResponseBytes(response, chunk) {
  if (chunk == null) return;
  if (typeof chunk === "string") return Buffer.byteLength(chunk);
  if (Buffer.isBuffer(chunk)) return chunk.length;
  if (ArrayBuffer.isView(chunk)) return chunk.byteLength;
  return 0;
}

function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function isLocalObservabilityRequest(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return !forwarded && isLoopback(request.socket.remoteAddress);
}

function observabilitySnapshot() {
  const topRoutes = (map) => [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 50)
    .map(([route, value]) => ({ route, value }));
  return {
    ok: true,
    startedAt: observability.startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    mediaMode,
    requireLogin,
    rooms: rooms.size,
    voiceRooms: voiceRooms.size,
    requests: {
      active: observability.activeRequests,
      total: observability.requestsTotal,
      completed: observability.requestsCompleted,
      aborted: observability.requestsAborted,
      responseBytes: observability.responseBytes,
      status: Object.fromEntries(observability.statusCounts),
      topRoutes: topRoutes(observability.routeCounts),
      topRouteBytes: topRoutes(observability.routeBytes),
    },
    websocket: { ...observability.websocket },
    clientEvents: topRoutes(observability.clientEventCounts),
    logging: { level: logLevel, file: Boolean(logFileStream), recentEvents: observability.recentEvents.slice(-50) },
    downloadProtection: {
      limitPerMinute: downloadRateLimitPerMinute,
      trackedClients: downloadRate.size,
    },
    clientErrorProtection: {
      limitPerMinute: clientErrorRateLimitPerMinute,
      trackedClients: clientErrorRate.size,
    },
    apiRateProtection: {
      limitPerMinute: apiRateLimitPerMinute,
      writeLimitPerMinute: apiWriteRateLimitPerMinute,
      globalLimitPerMinute: apiGlobalRateLimitPerMinute,
      trackedClients: apiRate.size,
      trackedWriteClients: apiWriteRate.size,
      trackedGlobalClients: apiGlobalRate.size,
      trackedRegistrations: registerRate.size,
      trackedOAuthClients: oauthRate.size,
    },
    loginProtection: {
      attemptsPerMinute: loginRateLimitPerMinute,
      failuresPerAccountAndIp: loginFailureLimit,
      failuresPerIp: loginFailureIpLimit,
      failureWindowSeconds: Math.round(loginFailureWindowMs / 1000),
      trackedKeys: loginFailures.size,
    },
    websocketProtection: {
      connectionsPerMinute: websocketConnectionRateLimit,
      activeConnectionsPerIp: websocketActiveConnectionLimit,
      trackedClients: websocketConnectionRate.size,
    },
  };
}

function allowLargeArtifactRequest(request) {
  const now = Date.now();
  const key = clientIp(request);
  const current = downloadRate.get(key);
  if (!current || now - current.startedAt >= downloadRateWindowMs) {
    downloadRate.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= downloadRateLimitPerMinute) return false;
  current.count += 1;
  return true;
}

function pruneDownloadRate() {
  const threshold = Date.now() - downloadRateWindowMs;
  for (const [key, entry] of downloadRate) {
    if (entry.startedAt < threshold) downloadRate.delete(key);
  }
}

function allowClientErrorRequest(request) {
  const now = Date.now();
  const key = clientIp(request);
  const current = clientErrorRate.get(key);
  if (!current || now - current.startedAt >= downloadRateWindowMs) {
    clientErrorRate.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= clientErrorRateLimitPerMinute) return false;
  current.count += 1;
  return true;
}

function pruneClientErrorRate() {
  const threshold = Date.now() - downloadRateWindowMs;
  for (const [key, entry] of clientErrorRate) {
    if (entry.startedAt < threshold) clientErrorRate.delete(key);
  }
}

function evictRateLimitEntries(rateMap) {
  if (rateMap.size < maxRateLimitEntries) return;
  const oldest = rateMap.keys().next().value;
  if (oldest !== undefined) rateMap.delete(oldest);
}

function consumeFixedWindow(rateMap, key, limit, windowMs, now = Date.now()) {
  let entry = rateMap.get(key);
  if (!entry || now - entry.startedAt >= windowMs) {
    evictRateLimitEntries(rateMap);
    entry = { startedAt: now, count: 0 };
    rateMap.set(key, entry);
  }
  const resetAt = entry.startedAt + windowMs;
  if (entry.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  }
  entry.count += 1;
  return { allowed: true, limit, remaining: Math.max(0, limit - entry.count), resetAt, retryAfter: 0 };
}

function rateLimitHeaders(response, state) {
  response.setHeader("X-RateLimit-Limit", String(state.limit));
  response.setHeader("X-RateLimit-Remaining", String(state.remaining));
  response.setHeader("X-RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));
}

function apiRateLimitPolicy(request, pathname) {
  if (pathname === "/healthz" || pathname === "/metrics") return null;
  const isApi = pathname.startsWith("/api/") || ["/ice-config", "/runtime-config"].includes(pathname);
  if (!isApi) return null;
  // A telemetria tem um limite próprio e não deve consumir o orçamento de
  // operações do usuário, especialmente quando a interface registra uma
  // falha de rede.
  if (pathname === "/api/client-errors") return null;
  const scope = apiRateLimitScope(pathname);
  if (pathname === "/api/auth/register" && request.method === "POST") {
    return { name: "register", scope, map: registerRate, limit: apiRegisterRateLimit, windowMs: apiRegisterRateWindowMs, message: "Muitas tentativas de cadastro. Aguarde alguns minutos.", global: false };
  }
  if (/^\/api\/auth\/(google|discord)(\/callback)?$/.test(pathname)) {
    return { name: "oauth", scope, map: oauthRate, limit: apiOAuthRateLimit, windowMs: apiOAuthRateWindowMs, message: "Muitas tentativas de autenticação externa. Aguarde alguns minutos.", global: false };
  }
  if (request.method === "GET" && /^\/api\/groups\/[\w-]{1,64}\/overview$/.test(pathname)) {
    return { name: "group_overview", scope, map: apiRate, limit: groupOverviewRateLimitPerMinute, windowMs: apiRateWindowMs, message: "Atualizações completas do grupo muito frequentes. Aguarde um instante." };
  }
  if (["POST", "PATCH", "DELETE"].includes(request.method)) {
    return { name: "write", scope, map: apiWriteRate, limit: apiWriteRateLimitPerMinute, windowMs: apiRateWindowMs, message: "Muitas operações nesta ação em pouco tempo. Aguarde um instante." };
  }
  return { name: "api", scope, map: apiRate, limit: apiRateLimitPerMinute, windowMs: apiRateWindowMs, message: "Muitas requisições nesta área. Aguarde um instante." };
}

function apiRateLimitScope(pathname) {
  // IDs do Telai são UUIDs e hashes longos. Normalizá-los impede que alguém
  // contorne o limite criando uma chave diferente para cada grupo ou convite.
  return String(pathname || "/")
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,40}(?=\/|$)/gi, "/:id")
    .replace(/\/[a-z0-9_-]{20,128}(?=\/|$)/gi, "/:id");
}

function enforceApiRateLimit(request, response, pathname) {
  const policy = apiRateLimitPolicy(request, pathname);
  if (!policy) return true;
  const identity = clientIp(request);
  const state = consumeFixedWindow(policy.map, `${policy.name}:${policy.scope}:${identity}`, policy.limit, policy.windowMs);
  rateLimitHeaders(response, state);
  if (!state.allowed) {
    response.setHeader("Retry-After", String(state.retryAfter));
    warnLog("api_rate_limited", { method: request.method, path: pathname, bucket: policy.name, scope: policy.scope, retryAfter: state.retryAfter });
    json(response, 429, { error: policy.message, retryAfter: state.retryAfter });
    return false;
  }
  // Cadastro e OAuth já possuem janelas próprias e não entram neste teto.
  if (policy.global === false) return true;
  const globalState = consumeFixedWindow(apiGlobalRate, `global:${identity}`, apiGlobalRateLimitPerMinute, apiRateWindowMs);
  if (globalState.allowed) return true;
  rateLimitHeaders(response, globalState);
  response.setHeader("Retry-After", String(globalState.retryAfter));
  warnLog("api_rate_limited", { method: request.method, path: pathname, bucket: "global", retryAfter: globalState.retryAfter });
  json(response, 429, { error: "Muitas requisições deste endereço em pouco tempo. Aguarde um instante.", retryAfter: globalState.retryAfter });
  return false;
}

function pruneRateMap(rateMap, windowMs) {
  const threshold = Date.now() - windowMs;
  for (const [key, entry] of rateMap) {
    if (!entry || entry.startedAt < threshold) rateMap.delete(key);
  }
}

setInterval(pruneDownloadRate, downloadRateWindowMs).unref();
setInterval(pruneClientErrorRate, downloadRateWindowMs).unref();
setInterval(() => {
  pruneRateMap(apiRate, apiRateWindowMs);
  pruneRateMap(apiWriteRate, apiRateWindowMs);
  pruneRateMap(apiGlobalRate, apiRateWindowMs);
  pruneRateMap(registerRate, apiRegisterRateWindowMs);
  pruneRateMap(oauthRate, apiOAuthRateWindowMs);
  pruneRateMap(loginFailures, loginFailureWindowMs);
  pruneRateMap(websocketConnectionRate, websocketConnectionRateWindowMs);
}, 60_000).unref();
setInterval(() => {
  const threshold = Date.now() - loginRateWindowMs;
  for (const [key, entry] of loginRate) {
    if (entry.startedAt < threshold) loginRate.delete(key);
  }
}, loginRateWindowMs).unref();

const databaseSchema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    avatar_data TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_consents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL CHECK(consent_type IN ('terms', 'privacy')),
    policy_version TEXT NOT NULL,
    accepted_at TEXT NOT NULL,
    UNIQUE(user_id, consent_type, policy_version)
  );
  CREATE INDEX IF NOT EXISTS user_consents_user_idx ON user_consents(user_id, consent_type, accepted_at DESC);
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'dark' CHECK(theme IN ('dark', 'light')),
    default_quality TEXT NOT NULL DEFAULT 'balanced' CHECK(default_quality IN ('economy', 'balanced', 'high')),
    default_audio TEXT NOT NULL DEFAULT 'source' CHECK(default_audio IN ('source', 'system')),
    button_color TEXT,
    input_background_color TEXT,
    background_color TEXT,
    push_to_talk_key TEXT,
    mute_shortcut TEXT,
    live_notification_scope TEXT NOT NULL DEFAULT 'related' CHECK(live_notification_scope IN ('related', 'all')),
    voice_microphone_volume REAL NOT NULL DEFAULT 1,
    voice_output_volume REAL NOT NULL DEFAULT 1,
    preferred_input_device_id TEXT,
    preferred_output_device_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_voice_preferences (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    volume REAL NOT NULL DEFAULT 1 CHECK(volume >= 0 AND volume <= 1),
    locally_muted INTEGER NOT NULL DEFAULT 0 CHECK(locally_muted IN (0, 1)),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id, target_user_id)
  );
  CREATE INDEX IF NOT EXISTS user_voice_preferences_target_idx ON user_voice_preferences(target_user_id);
  CREATE TABLE IF NOT EXISTS channel_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    avatar_data TEXT,
    games TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(provider, provider_user_id)
  );
  CREATE INDEX IF NOT EXISTS oauth_accounts_user_idx ON oauth_accounts(user_id);
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('owner', 'member')),
    role_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS group_roles (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#5865f2',
    can_chat INTEGER NOT NULL DEFAULT 1,
    can_stream INTEGER NOT NULL DEFAULT 1,
    can_invite INTEGER NOT NULL DEFAULT 1,
    can_view_voice_members INTEGER NOT NULL DEFAULT 1,
    can_move_members INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE(group_id, name)
  );
  CREATE INDEX IF NOT EXISTS group_roles_group_idx ON group_roles(group_id, is_default, name COLLATE NOCASE);
  CREATE TABLE IF NOT EXISTS group_member_permissions (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_chat INTEGER NOT NULL DEFAULT 1,
    can_stream INTEGER NOT NULL DEFAULT 1,
    can_invite INTEGER NOT NULL DEFAULT 1,
    can_view_voice_members INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS group_invites (
    token_hash TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    max_uses INTEGER NOT NULL,
    uses INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS group_user_invites (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'expired')),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS group_user_invites_recipient_idx ON group_user_invites(invited_user_id, status, expires_at);
  CREATE INDEX IF NOT EXISTS group_user_invites_group_idx ON group_user_invites(group_id, status, created_at);
  CREATE TABLE IF NOT EXISTS group_join_requests (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    decided_at TEXT,
    decided_by TEXT,
    UNIQUE(group_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS group_join_requests_group_idx ON group_join_requests(group_id, status, updated_at);
  CREATE INDEX IF NOT EXISTS group_join_requests_user_idx ON group_join_requests(user_id, status, updated_at);
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT,
    UNIQUE(user_id, type, entity_id)
  );
  CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at, created_at DESC);
  CREATE TABLE IF NOT EXISTS maintenance_notices (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS maintenance_notices_active_idx ON maintenance_notices(expires_at, starts_at DESC);
  CREATE TABLE IF NOT EXISTS streams (
    id TEXT PRIMARY KEY,
    room_name TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK(visibility IN ('public', 'private')),
    group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
    room_id TEXT REFERENCES group_rooms(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT
  );
  CREATE INDEX IF NOT EXISTS streams_live_idx ON streams(ended_at, visibility);
  CREATE TABLE IF NOT EXISTS stream_chat_messages (
    id TEXT PRIMARY KEY,
    channel_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stream_id TEXT REFERENCES streams(id) ON DELETE SET NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    display_name TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS stream_chat_messages_channel_idx ON stream_chat_messages(channel_user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (follower_id, followed_id),
    CHECK(follower_id <> followed_id)
  );
  CREATE TABLE IF NOT EXISTS friendships (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, friend_id),
    CHECK(user_id <> friend_id)
  );
  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'canceled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(sender_id <> recipient_id)
  );
  CREATE INDEX IF NOT EXISTS friendships_user_idx ON friendships(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS friendships_friend_idx ON friendships(friend_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS friend_requests_recipient_idx ON friend_requests(recipient_id, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS friend_requests_sender_idx ON friend_requests(sender_id, status, updated_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_pair_idx ON friend_requests(sender_id, recipient_id) WHERE status = 'pending';
  CREATE TABLE IF NOT EXISTS group_rooms (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('text', 'live')),
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE(group_id, slug)
  );
  CREATE INDEX IF NOT EXISTS group_rooms_group_idx ON group_rooms(group_id, created_at);
  -- Canais de voz ficam em uma tabela separada para manter compatibilidade
  -- com bancos antigos, cujo CHECK de group_rooms só conhece text/live.
  CREATE TABLE IF NOT EXISTS group_voice_rooms (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE(group_id, slug)
  );
  CREATE INDEX IF NOT EXISTS group_voice_rooms_group_idx ON group_voice_rooms(group_id, created_at);
  CREATE TABLE IF NOT EXISTS group_messages (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    room_id TEXT REFERENCES group_rooms(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS group_messages_recent_idx ON group_messages(group_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS direct_conversations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS direct_conversation_members (
    conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS direct_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE INDEX IF NOT EXISTS direct_conversation_members_user_idx ON direct_conversation_members(user_id, conversation_id);
  CREATE INDEX IF NOT EXISTS direct_messages_conversation_idx ON direct_messages(conversation_id, created_at DESC);
`;
const database = openSqliteDatabase(databasePath, databaseSchema);

ensureColumn(database, "group_messages", "room_id", "TEXT REFERENCES group_rooms(id) ON DELETE CASCADE");
ensureColumn(database, "streams", "room_id", "TEXT REFERENCES group_rooms(id) ON DELETE SET NULL");
// Salas de voz ficam em uma tabela separada dos canais de transmissão.
// Guardamos o vínculo em uma coluna própria para manter compatibilidade com
// os bancos antigos e não apontar a FK para a tabela errada.
ensureColumn(database, "streams", "voice_room_id", "TEXT");
ensureColumn(database, "group_members", "role_id", "TEXT");
ensureColumn(database, "group_roles", "can_chat", "INTEGER NOT NULL DEFAULT 1");
ensureColumn(database, "group_roles", "can_stream", "INTEGER NOT NULL DEFAULT 1");
ensureColumn(database, "group_roles", "can_invite", "INTEGER NOT NULL DEFAULT 1");
ensureColumn(database, "group_roles", "can_view_voice_members", "INTEGER NOT NULL DEFAULT 1");
ensureColumn(database, "group_roles", "can_move_members", "INTEGER NOT NULL DEFAULT 0");
ensureColumn(database, "group_roles", "sort_order", "INTEGER NOT NULL DEFAULT 0");
ensureColumn(database, "group_member_permissions", "can_view_voice_members", "INTEGER NOT NULL DEFAULT 1");
ensureColumn(database, "group_voice_rooms", "max_participants", "INTEGER NOT NULL DEFAULT 8");
ensureColumn(database, "users", "email", "TEXT");
ensureColumn(database, "users", "avatar_data", "TEXT");
ensureColumn(database, "user_preferences", "button_color", "TEXT");
ensureColumn(database, "user_preferences", "input_background_color", "TEXT");
ensureColumn(database, "user_preferences", "background_color", "TEXT");
ensureColumn(database, "user_preferences", "push_to_talk_key", "TEXT");
ensureColumn(database, "user_preferences", "mute_shortcut", "TEXT");
ensureColumn(database, "user_preferences", "live_notification_scope", "TEXT NOT NULL DEFAULT 'related'");
ensureColumn(database, "user_preferences", "voice_microphone_volume", "REAL NOT NULL DEFAULT 1");
ensureColumn(database, "user_preferences", "voice_output_volume", "REAL NOT NULL DEFAULT 1");
ensureColumn(database, "user_preferences", "preferred_input_device_id", "TEXT");
ensureColumn(database, "user_preferences", "preferred_output_device_id", "TEXT");
database.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email) WHERE email IS NOT NULL AND email <> ''");
database.exec("CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)");
database.exec("CREATE INDEX IF NOT EXISTS stream_chat_messages_stream_idx ON stream_chat_messages(stream_id, created_at DESC)");
database.exec("CREATE INDEX IF NOT EXISTS group_messages_room_idx ON group_messages(group_id, room_id, created_at DESC)");
database.exec("CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON direct_messages(sender_id, created_at DESC)");
const { isGroupMember, ensureGroupPermissionRow, groupPermissions, canGroupAction } = createGroupAccessRepository(database);
const { directConversationForUser, directConversationPayload } = createDirectConversationRepository(database, { compactUserSummary });
const sessionRepository = createSessionRepository(database, { hashSessionToken });
const { createNotification } = createNotificationRepository(database);

function pruneExpiredRuntimeState() {
  const now = Date.now();
  for (const [key, entry] of oauthStates) {
    if (!entry || entry.expiresAt <= now) oauthStates.delete(key);
  }
  for (const [key, lastSeen] of groupPresence) {
    if (now - lastSeen > 35_000) groupPresence.delete(key);
  }
  try {
    database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date(now).toISOString());
  } catch (error) {
    errorLog("expired_state_cleanup_error", { error });
  }
}

setInterval(pruneExpiredRuntimeState, 5 * 60_000).unref();

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password, storedHash) {
  const [salt, expectedHash] = String(storedHash || "").split(":");
  if (!salt || !expectedHash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return [];
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try { return [name, decodeURIComponent(value)]; } catch { return []; }
  }).filter((entry) => entry.length));
}

function allowLoginAttempt(request, username) {
  const now = Date.now();
  const keys = [clientIp(request), `username:${hashSessionToken(`${clientIp(request)}:${String(username).slice(0, 64)}`)}`];
  for (const key of keys) {
    const current = loginRate.get(key);
    if (current && now - current.startedAt < loginRateWindowMs && current.count >= loginRateLimitPerMinute) return false;
  }
  if (loginIsBlocked(request, username)) return false;
  for (const key of keys) {
    evictRateLimitEntries(loginRate);
    const current = loginRate.get(key);
    if (!current || now - current.startedAt >= loginRateWindowMs) loginRate.set(key, { startedAt: now, count: 1 });
    else current.count += 1;
  }
  return true;
}

function loginFailureKeys(request, username) {
  const ip = clientIp(request);
  const normalized = String(username || "").trim().toLowerCase().slice(0, 64);
  return [
    `ip:${ip}`,
    `account:${hashSessionToken(`${ip}:${normalized}`)}`,
  ];
}

function loginIsBlocked(request, username) {
  const keys = loginFailureKeys(request, username);
  const limits = [loginFailureIpLimit, loginFailureLimit];
  const now = Date.now();
  let retryAfter = 0;
  keys.forEach((key, index) => {
    const entry = loginFailures.get(key);
    if (!entry || now - entry.startedAt >= loginFailureWindowMs) return;
    if (entry.count >= limits[index]) retryAfter = Math.max(retryAfter, Math.max(1, Math.ceil((entry.startedAt + loginFailureWindowMs - now) / 1000)));
  });
  return retryAfter;
}

function recordLoginFailure(request, username) {
  const now = Date.now();
  const keys = loginFailureKeys(request, username);
  keys.forEach((key) => {
    const current = loginFailures.get(key);
    if (!current || now - current.startedAt >= loginFailureWindowMs) {
      evictRateLimitEntries(loginFailures);
      loginFailures.set(key, { startedAt: now, count: 1 });
    } else {
      current.count += 1;
    }
  });
}

function clearLoginFailure(request, username) {
  const [, accountKey] = loginFailureKeys(request, username);
  loginFailures.delete(accountKey);
}

function currentUser(request) {
  const token = parseCookies(request).mirante_session;
  return sessionRepository.findUserByToken(token);
}

function sessionCookie(token, request) {
  const forwardedProto = trustedForwardedHeaders(request)
    ? String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim()
    : "";
  const secure = request.socket.encrypted || forwardedProto === "https" ? "; Secure" : "";
  return `mirante_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

function expiredSessionCookie(request) {
  const forwardedProto = trustedForwardedHeaders(request)
    ? String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim()
    : "";
  const secure = request.socket.encrypted || forwardedProto === "https" ? "; Secure" : "";
  return `mirante_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

function createSession(userId, request, response) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  sessionRepository.create({ userId, token, expiresAt });
  response.setHeader("Set-Cookie", sessionCookie(token, request));
}

const oauthProviderConfig = {
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
  },
  discord: {
    clientId: process.env.DISCORD_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.DISCORD_OAUTH_CLIENT_SECRET || "",
    authorizationEndpoint: "https://discord.com/oauth2/authorize",
    tokenEndpoint: "https://discord.com/api/oauth2/token",
    scope: "identify email",
  },
};

function oauthProvider(name) {
  const provider = oauthProviderConfig[name];
  return provider && provider.clientId && provider.clientSecret ? provider : null;
}

function oauthRedirectUri(provider, request) {
  return `${publicOriginForRequest(request)}/api/auth/${provider}/callback`;
}

function oauthStateCookie(value, request, maxAge = 600) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = request.socket.encrypted || forwardedProto === "https" ? "; Secure" : "";
  return `mirante_oauth_state=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=${maxAge}${secure}`;
}

function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function oauthErrorRedirect(response, code, extra = {}) {
  const query = new URLSearchParams({ auth_error: code, ...extra });
  response.writeHead(302, { Location: `/?${query.toString()}` }).end();
}

async function fetchOAuthJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`oauth-http-${response.status}`);
  return body;
}

async function fetchOAuthIdentity(providerName, code, verifier, request) {
  const provider = oauthProvider(providerName);
  if (!provider) throw new Error("oauth-not-configured");
  const tokenBody = new URLSearchParams({
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: oauthRedirectUri(providerName, request),
  });
  const token = await fetchOAuthJson(provider.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: tokenBody,
  });
  if (!token.access_token) throw new Error("oauth-no-token");
  if (providerName === "google") {
    const profile = await fetchOAuthJson("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!profile.sub) throw new Error("oauth-no-identity");
    return {
      providerUserId: String(profile.sub),
      email: String(profile.email || "").trim().toLowerCase(),
      emailVerified: profile.email_verified === true,
      displayName: String(profile.name || profile.email || "Usuário Google").trim(),
      usernameHint: String(profile.email || "").split("@")[0],
    };
  }
  const profile = await fetchOAuthJson("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profile.id) throw new Error("oauth-no-identity");
  return {
    providerUserId: String(profile.id),
    email: String(profile.email || "").trim().toLowerCase(),
    emailVerified: profile.verified === true,
    displayName: String(profile.global_name || profile.username || profile.email || "Usuário Discord").trim(),
    usernameHint: String(profile.username || ""),
  };
}

function uniqueOAuthUsername(providerName, identity) {
  const base = (slugFor(identity.usernameHint) || slugFor(identity.displayName) || providerName).slice(0, 24);
  let candidate = base.length >= 3 ? base : `${providerName}-${base}`.slice(0, 32);
  while (database.prepare("SELECT 1 FROM users WHERE username = ?").get(candidate)) {
    candidate = `${base.slice(0, 23)}-${randomBytes(4).toString("hex")}`.slice(0, 32);
  }
  return candidate;
}

function upsertOAuthUser(providerName, identity) {
  const linked = database.prepare(`
    SELECT users.id, users.username, users.display_name AS displayName, users.email
    FROM oauth_accounts JOIN users ON users.id = oauth_accounts.user_id
    WHERE oauth_accounts.provider = ? AND oauth_accounts.provider_user_id = ?
  `).get(providerName, identity.providerUserId);
  const now = new Date().toISOString();
  if (linked) {
    database.prepare("UPDATE oauth_accounts SET email = ?, updated_at = ? WHERE provider = ? AND provider_user_id = ?")
      .run(identity.email || null, now, providerName, identity.providerUserId);
    return { id: linked.id, username: linked.username, displayName: linked.displayName };
  }
  const existingByEmail = identity.email && identity.emailVerified
    ? database.prepare("SELECT id, username, display_name AS displayName FROM users WHERE email = ?").get(identity.email)
    : null;
  const user = existingByEmail || {
    id: randomUUID(),
    username: uniqueOAuthUsername(providerName, identity),
    displayName: identity.displayName.slice(0, 48) || `Usuário ${providerName}`,
  };
  if (!existingByEmail) {
    database.prepare("INSERT INTO users (id, username, display_name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(user.id, user.username, user.displayName, identity.email || null, hashPassword(randomBytes(48).toString("base64url")), now);
  } else if (identity.email && !existingByEmail.email) {
    database.prepare("UPDATE users SET email = ? WHERE id = ?").run(identity.email, existingByEmail.id);
  }
  database.prepare("INSERT INTO oauth_accounts (id, provider, provider_user_id, user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), providerName, identity.providerUserId, user.id, identity.email || null, now, now);
  return { id: user.id, username: user.username, displayName: user.displayName };
}

function userWithLinkedAccounts(user) {
  if (!user) return null;
  const linkedAccounts = database.prepare(`
    SELECT provider, email, created_at AS linkedAt
    FROM oauth_accounts WHERE user_id = ? ORDER BY provider
  `).all(user.id);
  return { ...user, avatarData: compactAvatarData(user.avatarData), linkedAccounts, legal: legalConsentStatus(user.id) };
}

function legalConsentStatus(userId) {
  const records = database.prepare("SELECT consent_type AS consentType, accepted_at AS acceptedAt FROM user_consents WHERE user_id = ? AND policy_version = ?").all(userId, legalPolicyVersion);
  const byType = new Map(records.map((record) => [record.consentType, record.acceptedAt]));
  return {
    policyVersion: legalPolicyVersion,
    termsAcceptedAt: byType.get("terms") || null,
    privacyAcceptedAt: byType.get("privacy") || null,
    required: !byType.has("terms") || !byType.has("privacy"),
  };
}

function recordLegalConsents(userId, acceptedAt = new Date().toISOString()) {
  for (const consentType of ["terms", "privacy"]) {
    database.prepare(`
      INSERT OR IGNORE INTO user_consents (id, user_id, consent_type, policy_version, accepted_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), userId, consentType, legalPolicyVersion, acceptedAt);
  }
}

function userDataExport(userId) {
  const account = database.prepare(`
    SELECT id, username, display_name AS displayName, email, avatar_data AS avatarData, created_at AS createdAt
    FROM users WHERE id = ?
  `).get(userId);
  if (!account) return null;
  return {
    exportVersion: "1",
    exportedAt: new Date().toISOString(),
    legal: { policyVersion: legalPolicyVersion, consents: database.prepare("SELECT consent_type AS type, policy_version AS policyVersion, accepted_at AS acceptedAt FROM user_consents WHERE user_id = ? ORDER BY accepted_at").all(userId) },
    account,
    linkedAccounts: database.prepare("SELECT provider, email, created_at AS createdAt, updated_at AS updatedAt FROM oauth_accounts WHERE user_id = ? ORDER BY provider").all(userId),
    preferences: database.prepare("SELECT theme, default_quality AS defaultQuality, default_audio AS defaultAudio, button_color AS buttonColor, input_background_color AS inputBackgroundColor, background_color AS backgroundColor, push_to_talk_key AS pushToTalkKey, mute_shortcut AS muteShortcut, live_notification_scope AS liveNotificationScope, voice_microphone_volume AS voiceMicrophoneVolume, voice_output_volume AS voiceOutputVolume, preferred_input_device_id AS preferredInputDeviceId, preferred_output_device_id AS preferredOutputDeviceId, updated_at AS updatedAt FROM user_preferences WHERE user_id = ?").all(userId),
    voicePreferences: database.prepare("SELECT target_user_id AS targetUserId, volume, locally_muted AS locallyMuted, updated_at AS updatedAt FROM user_voice_preferences WHERE user_id = ? ORDER BY updated_at").all(userId).map((item) => ({ ...item, locallyMuted: Boolean(item.locallyMuted) })),
    channelProfile: database.prepare("SELECT display_name AS displayName, avatar_data AS avatarData, games, updated_at AS updatedAt FROM channel_profiles WHERE user_id = ?").get(userId) || null,
    memberships: database.prepare(`
      SELECT group_members.group_id AS groupId, groups.name AS groupName, groups.slug AS groupSlug, group_members.role, group_members.role_id AS roleId, group_members.created_at AS joinedAt
      FROM group_members JOIN groups ON groups.id = group_members.group_id
      WHERE group_members.user_id = ? ORDER BY group_members.created_at
    `).all(userId),
    ownedGroups: database.prepare("SELECT id, name, slug, created_at AS createdAt FROM groups WHERE owner_id = ? ORDER BY created_at").all(userId),
    permissions: database.prepare("SELECT group_id AS groupId, can_chat AS canChat, can_stream AS canStream, can_invite AS canInvite, can_view_voice_members AS canViewVoiceMembers, updated_at AS updatedAt FROM group_member_permissions WHERE user_id = ? ORDER BY updated_at").all(userId),
    joinRequests: database.prepare("SELECT id, group_id AS groupId, status, created_at AS createdAt, updated_at AS updatedAt, decided_at AS decidedAt FROM group_join_requests WHERE user_id = ? ORDER BY created_at").all(userId),
    invitationsReceived: database.prepare("SELECT id, group_id AS groupId, status, expires_at AS expiresAt, created_at AS createdAt FROM group_user_invites WHERE invited_user_id = ? ORDER BY created_at").all(userId),
    notifications: database.prepare("SELECT id, type, entity_id AS entityId, group_id AS groupId, title, body, created_at AS createdAt, read_at AS readAt FROM notifications WHERE user_id = ? ORDER BY created_at").all(userId),
    streams: database.prepare("SELECT id, room_name AS roomName, title, visibility, group_id AS groupId, room_id AS roomId, voice_room_id AS voiceRoomId, started_at AS startedAt, ended_at AS endedAt FROM streams WHERE created_by = ? ORDER BY started_at").all(userId),
    streamMessages: database.prepare("SELECT id, channel_user_id AS channelUserId, stream_id AS streamId, body, display_name AS displayName, username, created_at AS createdAt FROM stream_chat_messages WHERE user_id = ? ORDER BY created_at").all(userId),
    groupMessages: database.prepare("SELECT id, group_id AS groupId, room_id AS roomId, body, created_at AS createdAt FROM group_messages WHERE user_id = ? ORDER BY created_at").all(userId),
    directConversations: database.prepare(`
      SELECT direct_conversations.id, direct_conversations.created_at AS createdAt,
        direct_conversations.updated_at AS updatedAt
      FROM direct_conversations
      JOIN direct_conversation_members ON direct_conversation_members.conversation_id = direct_conversations.id
      WHERE direct_conversation_members.user_id = ?
      ORDER BY direct_conversations.updated_at
    `).all(userId),
    directMessages: database.prepare(`
      SELECT direct_messages.id, direct_messages.conversation_id AS conversationId,
        direct_messages.sender_id AS senderId, direct_messages.body,
        direct_messages.created_at AS createdAt, direct_messages.read_at AS readAt
      FROM direct_messages
      JOIN direct_conversation_members ON direct_conversation_members.conversation_id = direct_messages.conversation_id
      WHERE direct_conversation_members.user_id = ?
      ORDER BY direct_messages.created_at
    `).all(userId),
    follows: database.prepare("SELECT follower_id AS followerId, followed_id AS followedId, created_at AS createdAt FROM follows WHERE follower_id = ? OR followed_id = ? ORDER BY created_at").all(userId, userId),
  };
}

function disconnectUserSockets(userId) {
  if (typeof websocketServer === "undefined") return;
  for (const socket of websocketServer.clients) {
    if (socket.user?.id !== userId) continue;
    try { send(socket, { type: "account-deleted", message: "Sua conta foi excluída." }); } catch {}
    try { socket.close(1000, "Conta excluída"); } catch {}
  }
}

function deleteUserAccount(userId) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = database.prepare("DELETE FROM users WHERE id = ?").run(userId);
    if (!result.changes) throw new Error("account-not-found");
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch {}
    throw error;
  }
  for (const key of groupPresence.keys()) if (key.startsWith(`${userId}:`)) groupPresence.delete(key);
  disconnectUserSockets(userId);
}

function userPreferences(userId) {
  const preferences = database.prepare("SELECT theme, default_quality AS defaultQuality, default_audio AS defaultAudio, button_color AS buttonColor, input_background_color AS inputBackgroundColor, background_color AS backgroundColor, push_to_talk_key AS pushToTalkKey, mute_shortcut AS muteShortcut, live_notification_scope AS liveNotificationScope, voice_microphone_volume AS voiceMicrophoneVolume, voice_output_volume AS voiceOutputVolume, preferred_input_device_id AS preferredInputDeviceId, preferred_output_device_id AS preferredOutputDeviceId FROM user_preferences WHERE user_id = ?").get(userId);
  return {
    theme: preferences?.theme || "dark",
    defaultQuality: preferences?.defaultQuality || "balanced",
    defaultAudio: preferences?.defaultAudio || "source",
    buttonColor: preferences?.buttonColor || null,
    inputBackgroundColor: preferences?.inputBackgroundColor || null,
    backgroundColor: preferences?.backgroundColor || null,
    pushToTalkKey: preferences?.pushToTalkKey || null,
    muteShortcut: preferences?.muteShortcut || null,
    liveNotificationScope: preferences?.liveNotificationScope === "all" ? "all" : "related",
    voiceMicrophoneVolume: normalizePreferenceVolume(preferences?.voiceMicrophoneVolume),
    voiceOutputVolume: normalizePreferenceVolume(preferences?.voiceOutputVolume),
    preferredInputDeviceId: preferences?.preferredInputDeviceId || null,
    preferredOutputDeviceId: preferences?.preferredOutputDeviceId || null,
  };
}

function liveNotificationContext(stream, canRevealPrivate = true) {
  if (!stream || (stream.visibility === "private" && !canRevealPrivate)) return null;
  const initiatorName = String(stream.channelName || stream.channelUsername || "Alguém").trim();
  const isPrivate = stream.visibility === "private";
  const locationParts = isPrivate
    ? [
        stream.groupName ? `grupo ${stream.groupName}` : null,
        stream.voiceRoomName ? `sala de voz ${stream.voiceRoomName}` : null,
        stream.liveRoomName ? `canal ${stream.liveRoomName}` : null,
      ].filter(Boolean)
    : ["canal público"];
  const locationLabel = locationParts.length ? locationParts.join(" · ") : (isPrivate ? "sala privada" : "canal público");
  return {
    initiatorName,
    visibility: isPrivate ? "private" : "public",
    visibilityLabel: isPrivate ? "Privada" : "Pública",
    locationLabel,
    groupName: stream.groupName || null,
    voiceRoomName: stream.voiceRoomName || null,
    liveRoomName: stream.liveRoomName || null,
  };
}

function liveNotificationPresentation(notification, userId) {
  if (notification.type !== "channel_live" || !notification.streamId) return { liveContext: null };
  const stream = {
    visibility: notification.streamVisibility,
    createdBy: notification.streamCreatedBy,
    groupId: notification.streamGroupId,
    channelName: notification.streamChannelName,
    channelUsername: notification.streamChannelUsername,
    groupName: notification.streamGroupName,
    voiceRoomName: notification.streamVoiceRoomName,
    liveRoomName: notification.streamLiveRoomName,
  };
  const liveContext = liveNotificationContext(stream, canAccessStream(userId, stream));
  if (!liveContext) return { liveContext: null, streamPath: null };
  return {
    title: `${liveContext.initiatorName} está ao vivo`,
    body: `${liveContext.visibilityLabel} · ${liveContext.locationLabel}.`,
    liveContext,
  };
}

function syncNotificationsForUser(userId) {
  const notificationScope = userPreferences(userId).liveNotificationScope;
  const liveStreams = notificationScope === "all"
    ? database.prepare(`
        SELECT streams.id, streams.room_name AS roomName, streams.group_id AS groupId, streams.created_by AS createdBy,
          streams.visibility, streams.started_at AS startedAt,
          COALESCE(channel_profiles.display_name, users.display_name) AS channelName, users.username AS channelUsername,
          groups.name AS groupName, group_voice_rooms.name AS voiceRoomName, group_rooms.name AS liveRoomName
        FROM streams JOIN users ON users.id = streams.created_by
          LEFT JOIN channel_profiles ON channel_profiles.user_id = streams.created_by
          LEFT JOIN groups ON groups.id = streams.group_id
          LEFT JOIN group_voice_rooms ON group_voice_rooms.id = streams.voice_room_id
          LEFT JOIN group_rooms ON group_rooms.id = streams.room_id
        WHERE streams.visibility = 'public' AND streams.ended_at IS NULL
      `).all()
    : database.prepare(`
        SELECT streams.id, streams.room_name AS roomName, streams.group_id AS groupId, streams.created_by AS createdBy,
          streams.visibility, streams.started_at AS startedAt,
          COALESCE(channel_profiles.display_name, users.display_name) AS channelName, users.username AS channelUsername,
          groups.name AS groupName, group_voice_rooms.name AS voiceRoomName, group_rooms.name AS liveRoomName
        FROM streams JOIN users ON users.id = streams.created_by
          LEFT JOIN channel_profiles ON channel_profiles.user_id = streams.created_by
          LEFT JOIN groups ON groups.id = streams.group_id
          LEFT JOIN group_voice_rooms ON group_voice_rooms.id = streams.voice_room_id
          LEFT JOIN group_rooms ON group_rooms.id = streams.room_id
        LEFT JOIN follows ON follows.followed_id = streams.created_by AND follows.follower_id = ?
        LEFT JOIN group_members ON group_members.group_id = streams.group_id AND group_members.user_id = ?
        WHERE streams.ended_at IS NULL
          AND (follows.follower_id IS NOT NULL OR group_members.user_id IS NOT NULL)
      `).all(userId, userId);
  for (const stream of liveStreams.filter((stream) => stream.createdBy !== userId && runtimeStreamIsLive(stream))) {
    const liveContext = liveNotificationContext(stream);
    createNotification({
      userId,
      type: "channel_live",
      entityId: stream.id,
      groupId: stream.groupId,
      title: `${liveContext?.initiatorName || "Uma transmissão"} está ao vivo`,
      body: liveContext ? `${liveContext.visibilityLabel} · ${liveContext.locationLabel}.` : "Uma nova transmissão começou.",
      createdAt: stream.startedAt,
    });
  }

  const pendingInvites = database.prepare(`
    SELECT group_user_invites.id, group_user_invites.group_id AS groupId,
      group_user_invites.created_at AS createdAt, groups.name AS groupName,
      users.display_name AS invitedBy
    FROM group_user_invites
    JOIN groups ON groups.id = group_user_invites.group_id
    JOIN users ON users.id = group_user_invites.invited_by
    WHERE group_user_invites.invited_user_id = ? AND group_user_invites.status = 'pending'
      AND group_user_invites.expires_at > ?
  `).all(userId, new Date().toISOString());
  for (const invite of pendingInvites) {
    createNotification({
      userId,
      type: "group_invite",
      entityId: invite.id,
      groupId: invite.groupId,
      title: `Convite para ${invite.groupName}`,
      body: `${invite.invitedBy} convidou você para entrar neste grupo.`,
      createdAt: invite.createdAt,
    });
  }

  const pendingRequests = database.prepare(`
    SELECT group_join_requests.id, group_join_requests.group_id AS groupId,
      group_join_requests.created_at AS createdAt, groups.name AS groupName,
      users.display_name AS requesterName
    FROM group_join_requests
    JOIN groups ON groups.id = group_join_requests.group_id
    JOIN users ON users.id = group_join_requests.user_id
    WHERE groups.owner_id = ? AND group_join_requests.status = 'pending'
  `).all(userId);
  for (const request of pendingRequests) {
    createNotification({
      userId,
      type: "group_join_request",
      entityId: request.id,
      groupId: request.groupId,
      title: `Solicitação para ${request.groupName}`,
      body: `${request.requesterName} pediu para entrar no grupo.`,
      createdAt: request.createdAt,
    });
  }

  const decidedRequests = database.prepare(`
    SELECT group_join_requests.id, group_join_requests.group_id AS groupId,
      group_join_requests.updated_at AS updatedAt, group_join_requests.status,
      groups.name AS groupName
    FROM group_join_requests
    JOIN groups ON groups.id = group_join_requests.group_id
    WHERE group_join_requests.user_id = ? AND group_join_requests.status IN ('approved', 'rejected')
  `).all(userId);
  for (const request of decidedRequests) {
    const approved = request.status === "approved";
    createNotification({
      userId,
      type: "group_join_decision",
      entityId: request.id,
      groupId: request.groupId,
      title: approved ? `Entrada aprovada em ${request.groupName}` : `Solicitação recusada em ${request.groupName}`,
      body: approved ? "Agora você já pode acessar este grupo." : "O administrador recusou sua solicitação de entrada.",
      createdAt: request.updatedAt,
    });
  }
}

function channelProfileForUser(userId) {
  const row = database.prepare("SELECT channel_profiles.user_id AS userId, channel_profiles.display_name AS displayName, channel_profiles.avatar_data AS avatarData, channel_profiles.games FROM channel_profiles WHERE channel_profiles.user_id = ?").get(userId);
  if (row) return { userId: row.userId, displayName: row.displayName, avatarData: compactAvatarData(row.avatarData), games: parseChannelGames(row.games) };
  const user = database.prepare("SELECT id AS userId, display_name AS displayName, avatar_data AS avatarData FROM users WHERE id = ?").get(userId);
  return user ? { userId: user.userId, displayName: user.displayName, avatarData: compactAvatarData(user.avatarData), games: [] } : null;
}

function mergeUsers(targetId, sourceId) {
  if (targetId === sourceId) return;
  const sourceProviders = database.prepare("SELECT provider FROM oauth_accounts WHERE user_id = ?").all(sourceId).map((row) => row.provider);
  const targetProviders = database.prepare("SELECT provider FROM oauth_accounts WHERE user_id = ?").all(targetId).map((row) => row.provider);
  if (sourceProviders.some((provider) => targetProviders.includes(provider))) throw new Error("oauth-provider-conflict");
  const target = database.prepare("SELECT email FROM users WHERE id = ?").get(targetId);
  const source = database.prepare("SELECT email FROM users WHERE id = ?").get(sourceId);
  if (!target || !source) throw new Error("oauth-merge-user-missing");
  try {
    database.exec("BEGIN IMMEDIATE");
    database.prepare("UPDATE groups SET owner_id = ? WHERE owner_id = ?").run(targetId, sourceId);
    database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, created_at) SELECT group_id, ?, role, created_at FROM group_members WHERE user_id = ?")
      .run(targetId, sourceId);
    database.prepare(`
      INSERT OR IGNORE INTO group_member_permissions (group_id, user_id, can_chat, can_stream, can_invite, can_view_voice_members, updated_at)
      SELECT group_id, ?, can_chat, can_stream, can_invite, can_view_voice_members, updated_at
      FROM group_member_permissions WHERE user_id = ?
    `).run(targetId, sourceId);
    database.prepare("UPDATE group_members SET role = 'owner' WHERE user_id = ? AND group_id IN (SELECT group_id FROM group_members WHERE user_id = ? AND role = 'owner')")
      .run(targetId, sourceId);
    database.prepare("DELETE FROM group_members WHERE user_id = ?").run(sourceId);
    database.prepare("UPDATE group_invites SET created_by = ? WHERE created_by = ?").run(targetId, sourceId);
    database.prepare("UPDATE group_rooms SET created_by = ? WHERE created_by = ?").run(targetId, sourceId);
    database.prepare("UPDATE group_messages SET user_id = ? WHERE user_id = ?").run(targetId, sourceId);
    database.prepare("UPDATE streams SET created_by = ? WHERE created_by = ?").run(targetId, sourceId);
    database.prepare("UPDATE channel_profiles SET user_id = ? WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM channel_profiles WHERE user_id = ?)").run(targetId, sourceId, targetId);
    database.prepare(`
      INSERT OR IGNORE INTO follows (follower_id, followed_id, created_at)
      SELECT CASE WHEN follower_id = ? THEN ? ELSE follower_id END,
             CASE WHEN followed_id = ? THEN ? ELSE followed_id END,
             created_at
      FROM follows WHERE (follower_id = ? OR followed_id = ?)
      AND (CASE WHEN follower_id = ? THEN ? ELSE follower_id END) <> (CASE WHEN followed_id = ? THEN ? ELSE followed_id END)
    `).run(sourceId, targetId, sourceId, targetId, sourceId, sourceId, sourceId, targetId, sourceId, targetId);
    database.prepare("DELETE FROM follows WHERE follower_id = ? OR followed_id = ?").run(sourceId, sourceId);
    database.prepare("UPDATE oauth_accounts SET user_id = ? WHERE user_id = ?").run(targetId, sourceId);
    database.prepare("UPDATE user_preferences SET user_id = ? WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = ?)").run(targetId, sourceId, targetId);
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(sourceId);
    database.prepare("DELETE FROM user_preferences WHERE user_id = ?").run(sourceId);
    if (!target.email && source.email) database.prepare("UPDATE users SET email = ? WHERE id = ?").run(source.email, targetId);
    database.prepare("DELETE FROM users WHERE id = ?").run(sourceId);
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

function linkOAuthAccount(providerName, identity, userId) {
  const target = database.prepare("SELECT id, username, display_name AS displayName, email FROM users WHERE id = ?").get(userId);
  if (!target) throw new Error("oauth-link-session-invalid");
  const existing = database.prepare("SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?")
    .get(providerName, identity.providerUserId);
  if (existing && existing.user_id !== userId) {
    mergeUsers(userId, existing.user_id);
    return { merged: true, currentDisplayName: target.displayName, suggestedDisplayName: identity.displayName };
  }
  const now = new Date().toISOString();
  if (existing) {
    database.prepare("UPDATE oauth_accounts SET email = ?, updated_at = ? WHERE provider = ? AND provider_user_id = ?")
      .run(identity.email || null, now, providerName, identity.providerUserId);
    return { alreadyLinked: true, currentDisplayName: target.displayName, suggestedDisplayName: identity.displayName };
  }
  const emailOwner = identity.email && identity.emailVerified
    ? database.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").get(identity.email, userId)
    : null;
  if (emailOwner) throw new Error("oauth-email-linked-other-account");
  database.prepare("INSERT INTO oauth_accounts (id, provider, provider_user_id, user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), providerName, identity.providerUserId, userId, identity.email || null, now, now);
  return { alreadyLinked: false, currentDisplayName: target.displayName, suggestedDisplayName: identity.displayName };
}

function requireUser(request, response) {
  const user = currentUser(request);
  if (!user) json(response, 401, { error: "Entre com sua conta para continuar." });
  return user;
}

function isSiteAdmin(user) {
  return Boolean(user && (siteAdminUserIds.has(user.id) || siteAdminUsernames.has(normalizeUsername(user.username))));
}

function requireSiteAdmin(request, response) {
  const user = currentUser(request);
  if (!user) {
    json(response, 401, { error: "Entre com sua conta para continuar." });
    return null;
  }
  // Não confirmamos a existência do painel para contas autenticadas que não
  // estejam na allowlist. Isso reduz a descoberta por enumeração de rotas.
  if (!isSiteAdmin(user)) {
    json(response, 404, { error: "Not found" });
    return null;
  }
  return user;
}

function hasMaintenanceToken(request) {
  const provided = String(request.headers["x-telai-maintenance-token"] || "");
  if (!maintenanceToken || !provided || provided.length !== maintenanceToken.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(maintenanceToken));
  } catch {
    return false;
  }
}

function requireMaintenanceOperator(request, response) {
  if (hasMaintenanceToken(request)) return { type: "token" };
  const user = currentUser(request);
  if (!user) {
    json(response, 401, { error: "Entre com sua conta para continuar." });
    return null;
  }
  if (!isSiteAdmin(user)) {
    json(response, 404, { error: "Not found" });
    return null;
  }
  return { type: "account", user };
}

function activeMaintenanceNotice() {
  const row = database.prepare(`
    SELECT id, message, starts_at AS startsAt, expires_at AS expiresAt
    FROM maintenance_notices
    WHERE expires_at > ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(new Date().toISOString());
  if (!row) return null;
  return {
    ...row,
    secondsUntilStart: Math.max(0, Math.ceil((Date.parse(row.startsAt) - Date.now()) / 1000)),
  };
}

function siteAdminOverview() {
  const now = new Date().toISOString();
  const activeStreams = database.prepare(`
    SELECT streams.id, streams.room_name AS roomName, streams.title, streams.visibility,
      streams.group_id AS groupId, streams.started_at AS startedAt,
      COALESCE(channel_profiles.display_name, users.display_name) AS creatorName,
      users.username AS creatorUsername, groups.name AS groupName
    FROM streams
    JOIN users ON users.id = streams.created_by
    LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id
    LEFT JOIN groups ON groups.id = streams.group_id
    WHERE streams.ended_at IS NULL
    ORDER BY streams.started_at DESC
  `).all().filter(runtimeStreamIsLive);
  const liveCountByGroup = new Map();
  for (const stream of activeStreams) {
    if (stream.groupId) liveCountByGroup.set(stream.groupId, (liveCountByGroup.get(stream.groupId) || 0) + 1);
  }
  const accounts = database.prepare(`
    SELECT users.id, users.username, users.display_name AS displayName, users.email,
      users.created_at AS createdAt,
      (SELECT COUNT(*) FROM group_members WHERE user_id = users.id) AS groupCount,
      (SELECT COUNT(*) FROM groups WHERE owner_id = users.id) AS ownedGroupCount,
      EXISTS(SELECT 1 FROM sessions WHERE user_id = users.id AND expires_at > ?) AS hasActiveSession
    FROM users
    ORDER BY users.created_at DESC
  `).all(now).map((account) => ({
    ...account,
    hasActiveSession: Boolean(account.hasActiveSession),
  }));
  const groups = database.prepare(`
    SELECT groups.id, groups.name, groups.slug, groups.created_at AS createdAt,
      groups.owner_id AS ownerId,
      COALESCE(users.display_name, users.username) AS ownerName,
      (SELECT COUNT(*) FROM group_members WHERE group_id = groups.id) AS memberCount
    FROM groups
    JOIN users ON users.id = groups.owner_id
    ORDER BY groups.created_at DESC
  `).all().map((group) => ({
    ...group,
    liveCount: liveCountByGroup.get(group.id) || 0,
  }));
  const streams = activeStreams.map((stream) => {
    const room = rooms.get(stream.roomName);
    return {
      id: stream.id,
      roomName: stream.roomName,
      title: stream.title,
      visibility: stream.visibility,
      groupId: stream.groupId,
      groupName: stream.groupName || null,
      creatorName: stream.creatorName,
      creatorUsername: stream.creatorUsername,
      startedAt: stream.startedAt,
      hostConnected: Boolean(room?.host),
      reconnectGrace: Boolean(room?.hostDisconnectedAt),
      viewerCount: room?.viewers?.size || 0,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      accounts: accounts.length,
      groups: groups.length,
      openStreams: streams.length,
      activeSessions: database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at > ?").get(now).count,
      runtimeBroadcastRooms: rooms.size,
      runtimeVoiceRooms: voiceRooms.size,
    },
    accounts,
    groups,
    streams,
  };
}

function siteAdminSummary() {
  const now = new Date().toISOString();
  const activeStreams = database.prepare("SELECT id, group_id AS groupId, room_name AS roomName, started_at AS startedAt FROM streams WHERE ended_at IS NULL")
    .all().filter(runtimeStreamIsLive);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      accounts: Number(database.prepare("SELECT COUNT(*) AS count FROM users").get().count || 0),
      groups: Number(database.prepare("SELECT COUNT(*) AS count FROM groups").get().count || 0),
      openStreams: activeStreams.length,
      activeSessions: Number(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at > ?").get(now).count || 0),
      runtimeBroadcastRooms: rooms.size,
      runtimeVoiceRooms: voiceRooms.size,
    },
  };
}

function adminPagination(requestUrl) {
  const requestedPage = Number.parseInt(requestUrl.searchParams.get("page") || "1", 10);
  const requestedPageSize = Number.parseInt(requestUrl.searchParams.get("pageSize") || "20", 10);
  const pageSize = Number.isInteger(requestedPageSize) ? Math.min(50, Math.max(1, requestedPageSize)) : 20;
  const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function adminPage(items, total, page, pageSize) {
  const safeTotal = Number(total || 0);
  return {
    items,
    pagination: {
      page,
      pageSize,
      total: safeTotal,
      pageCount: Math.max(1, Math.ceil(safeTotal / pageSize)),
    },
  };
}

function siteAdminAccountsPage(requestUrl) {
  const { page, pageSize, offset } = adminPagination(requestUrl);
  const now = new Date().toISOString();
  const total = database.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  const accounts = database.prepare(`
    SELECT users.id, users.username, users.display_name AS displayName, users.email,
      users.created_at AS createdAt,
      (SELECT COUNT(*) FROM group_members WHERE user_id = users.id) AS groupCount,
      (SELECT COUNT(*) FROM groups WHERE owner_id = users.id) AS ownedGroupCount,
      EXISTS(SELECT 1 FROM sessions WHERE user_id = users.id AND expires_at > ?) AS hasActiveSession
    FROM users
    ORDER BY users.created_at DESC
    LIMIT ? OFFSET ?
  `).all(now, pageSize, offset).map((account) => ({
    ...account,
    hasActiveSession: Boolean(account.hasActiveSession),
  }));
  return adminPage(accounts, total, page, pageSize);
}

function siteAdminGroupsPage(requestUrl) {
  const { page, pageSize, offset } = adminPagination(requestUrl);
  const total = database.prepare("SELECT COUNT(*) AS count FROM groups").get().count;
  const liveGroups = new Map();
  database.prepare("SELECT id, group_id AS groupId, room_name AS roomName, started_at AS startedAt FROM streams WHERE ended_at IS NULL").all()
    .filter(runtimeStreamIsLive)
    .forEach((stream) => {
      if (stream.groupId) liveGroups.set(stream.groupId, (liveGroups.get(stream.groupId) || 0) + 1);
    });
  const groups = database.prepare(`
    SELECT groups.id, groups.name, groups.slug, groups.created_at AS createdAt,
      groups.owner_id AS ownerId,
      COALESCE(users.display_name, users.username) AS ownerName,
      (SELECT COUNT(*) FROM group_members WHERE group_id = groups.id) AS memberCount
    FROM groups
    JOIN users ON users.id = groups.owner_id
    ORDER BY groups.created_at DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset).map((group) => ({
    ...group,
    liveCount: liveGroups.get(group.id) || 0,
  }));
  return adminPage(groups, total, page, pageSize);
}

function siteAdminStreamsPage(requestUrl) {
  const { page, pageSize, offset } = adminPagination(requestUrl);
  const streams = siteAdminOverview().streams;
  return adminPage(streams.slice(offset, offset + pageSize), streams.length, page, pageSize);
}

function siteAdminGroupMembersPage(requestUrl, groupId) {
  const { page, pageSize, offset } = adminPagination(requestUrl);
  const group = database.prepare(`
    SELECT groups.id, groups.name, groups.slug,
      COALESCE(users.display_name, users.username) AS ownerName
    FROM groups
    JOIN users ON users.id = groups.owner_id
    WHERE groups.id = ?
  `).get(groupId);
  if (!group) return null;
  const total = database.prepare("SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?").get(groupId).count;
  const members = database.prepare(`
    SELECT users.id, users.username, users.display_name AS displayName,
      group_members.role, group_members.created_at AS joinedAt
    FROM group_members
    JOIN users ON users.id = group_members.user_id
    WHERE group_members.group_id = ?
    ORDER BY CASE group_members.role WHEN 'owner' THEN 0 ELSE 1 END, users.display_name COLLATE NOCASE
    LIMIT ? OFFSET ?
  `).all(groupId, pageSize, offset);
  return { group, ...adminPage(members, total, page, pageSize) };
}

function streamPublicPath(stream) {
  // O endereço amigável acompanha o nome de exibição. O username continua
  // aceito pelo resolvedor apenas para preservar links antigos.
  const channel = slugFor(stream.channelName || stream.displayName || stream.channelUsername || stream.username || "");
  const group = stream.visibility === "private" ? slugFor(stream.groupSlug || "") : "";
  if (!channel) return "";
  return group ? `/${group}/${channel}` : `/${channel}`;
}

function ensureDefaultGroupRooms(groupId, ownerId) {
  const now = new Date().toISOString();
  const insert = database.prepare("INSERT OR IGNORE INTO group_rooms (id, group_id, name, slug, kind, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  insert.run(randomUUID(), groupId, "Geral", "geral", "text", ownerId, now);
}

function migrateLegacyGroupMemberRoles(groupId, ownerId, defaultRoleId) {
  const legacyMembers = database.prepare(`
    SELECT group_members.user_id AS userId,
      group_member_permissions.can_chat AS canChat,
      group_member_permissions.can_stream AS canStream,
      group_member_permissions.can_invite AS canInvite,
      group_member_permissions.can_view_voice_members AS canViewVoiceMembers
    FROM group_members
    LEFT JOIN group_member_permissions
      ON group_member_permissions.group_id = group_members.group_id
      AND group_member_permissions.user_id = group_members.user_id
    WHERE group_members.group_id = ?
      AND group_members.role = 'member'
      AND group_members.role_id IS NULL
  `).all(groupId);
  const roleCache = new Map();
  for (const member of legacyMembers) {
    const hasLegacyRow = [member.canChat, member.canStream, member.canInvite, member.canViewVoiceMembers]
      .some((value) => value !== null && value !== undefined);
    const permissions = {
      canChat: hasLegacyRow ? member.canChat !== 0 : true,
      canStream: hasLegacyRow ? member.canStream !== 0 : true,
      canInvite: hasLegacyRow ? member.canInvite !== 0 : true,
      canViewVoiceMembers: hasLegacyRow ? member.canViewVoiceMembers !== 0 : true,
    };
    const isDefault = Object.values(permissions).every(Boolean);
    let roleId = defaultRoleId;
    if (!isDefault) {
      const signature = Object.values(permissions).map((value) => (value ? 1 : 0)).join("");
      roleId = roleCache.get(signature);
      if (!roleId) {
        const existing = database.prepare(`
          SELECT id FROM group_roles
          WHERE group_id = ? AND can_chat = ? AND can_stream = ? AND can_invite = ?
            AND can_view_voice_members = ? AND can_move_members = 0
          LIMIT 1
        `).get(groupId, permissions.canChat ? 1 : 0, permissions.canStream ? 1 : 0, permissions.canInvite ? 1 : 0, permissions.canViewVoiceMembers ? 1 : 0);
        if (existing) {
          roleId = existing.id;
        } else {
          const baseName = "Membro migrado";
          let name = baseName;
          let suffix = 2;
          while (database.prepare("SELECT 1 FROM group_roles WHERE group_id = ? AND name = ? LIMIT 1").get(groupId, name)) name = `${baseName} ${suffix++}`;
          roleId = randomUUID();
          database.prepare(`
            INSERT INTO group_roles (id, group_id, name, color, can_chat, can_stream, can_invite,
              can_view_voice_members, can_move_members, is_default, created_by, created_at)
            VALUES (?, ?, ?, '#5865f2', ?, ?, ?, ?, 0, 0, ?, ?)
          `).run(roleId, groupId, name, permissions.canChat ? 1 : 0, permissions.canStream ? 1 : 0, permissions.canInvite ? 1 : 0, permissions.canViewVoiceMembers ? 1 : 0, ownerId, new Date().toISOString());
        }
        roleCache.set(signature, roleId);
      }
    }
    database.prepare("UPDATE group_members SET role_id = ? WHERE group_id = ? AND user_id = ? AND role_id IS NULL").run(roleId, groupId, member.userId);
  }
}

function ensureDefaultGroupRoles(groupId, ownerId) {
  let role = database.prepare("SELECT id FROM group_roles WHERE group_id = ? AND is_default = 1 LIMIT 1").get(groupId);
  if (!role) {
    const roleId = randomUUID();
    database.prepare("INSERT INTO group_roles (id, group_id, name, color, is_default, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)")
      .run(roleId, groupId, "Membro", "#5865f2", ownerId, new Date().toISOString());
    role = { id: roleId };
  }
  migrateLegacyGroupMemberRoles(groupId, ownerId, role.id);
  return role.id;
}

function ensureGroupRolePositions(groupId) {
  const roles = database.prepare(`
    SELECT id, sort_order AS sortOrder, is_default AS isDefault, name
    FROM group_roles WHERE group_id = ?
    ORDER BY is_default DESC, name COLLATE NOCASE
  `).all(groupId);
  if (roles.length <= 1 || roles.some((role) => Number(role.sortOrder) !== 0)) return;
  database.exec("BEGIN");
  try {
    const update = database.prepare("UPDATE group_roles SET sort_order = ? WHERE id = ? AND group_id = ?");
    roles.forEach((role, index) => update.run(index, role.id, groupId));
    database.exec("COMMIT");
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

for (const group of database.prepare("SELECT id, owner_id AS ownerId FROM groups").all()) {
  ensureDefaultGroupRooms(group.id, group.ownerId);
  ensureDefaultGroupRoles(group.id, group.ownerId);
  ensureGroupRolePositions(group.id);
}

function presenceKey(groupId, userId) { return `${groupId}:${userId}`; }

function touchGroupPresence(groupId, userId) {
  groupPresence.set(presenceKey(groupId, userId), Date.now());
}

function isPresent(groupId, userId) {
  const lastSeen = groupPresence.get(presenceKey(groupId, userId)) || 0;
  return Date.now() - lastSeen <= 35_000;
}

function canAccessStream(userId, stream) {
  const createdBy = stream.created_by ?? stream.createdBy;
  const groupId = stream.group_id ?? stream.groupId;
  return stream.visibility === "public" || (userId && createdBy === userId) || (userId && groupId && isGroupMember(userId, groupId));
}

function streamForRoom(roomId) {
  return database.prepare(`
    SELECT id, room_name AS roomName, created_by AS createdBy, ended_at AS endedAt
    FROM streams
    WHERE room_name = ?
    ORDER BY started_at DESC
    LIMIT 1
  `).get(roomId);
}

function loadStreamChat(roomId) {
  const stream = streamForRoom(roomId);
  if (!stream) return [];
  return database.prepare(`
    SELECT id, user_id AS userId, body, display_name AS displayName, username, created_at AS createdAt
    FROM stream_chat_messages
    WHERE stream_id = ?
    ORDER BY created_at DESC
    LIMIT 120
  `).all(stream.id).reverse();
}

function endStreamByRoom(roomId) {
  database.prepare("UPDATE streams SET ended_at = ? WHERE room_name = ? AND ended_at IS NULL").run(new Date().toISOString(), roomId);
}

function closeBroadcastRoom(roomId, event = "host-stopped") {
  const room = rooms.get(roomId);
  if (!room || room.closed) return false;
  room.closed = true;
  room.hostDisconnectedAt = null;
  clearHostReconnectTimer(room);
  endRelay(room);
  endStreamByRoom(roomId);
  notifyViewers(room, { type: event });
  return true;
}

function runtimeStreamIsLive(stream) {
  const room = rooms.get(stream.roomName);
  if (room?.host) return true;
  if (room?.hostDisconnectedAt && Date.now() - room.hostDisconnectedAt <= hostReconnectGraceMs) return true;
  if (Date.now() - runtimeStartedAt <= streamOrphanGraceMs) return true;
  // A stream is inserted just before the host joins signaling. Give that
  // handshake a short grace period. After the process startup grace above,
  // never expose an abandoned database row indefinitely.
  const startedAt = Date.parse(stream.startedAt || "");
  if (Number.isFinite(startedAt) && Date.now() - startedAt <= 15_000) return true;
  endStreamByRoom(stream.roomName);
  return false;
}

function decorateRuntimeStream(stream) {
  const room = rooms.get(stream.roomName);
  return { ...stream, viewerCount: room?.viewers?.size || 0 };
}

async function iceConfiguration() {
  if (process.env.ICE_SERVERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.ICE_SERVERS_JSON);
      if (Array.isArray(parsed?.iceServers) && parsed.iceServers.length) return parsed;
    } catch { /* usa a configuração padrão */ }
  }

  const stunUrls = [...new Set([
    ...String(process.env.STUN_URL || "stun:stun.cloudflare.com:3478").split(/[\s,]+/),
    "stun:stun.l.google.com:19302",
  ].map((url) => url.trim()).filter((url) => /^stun:/i.test(url)))];
  const servers = stunUrls.map((urls) => ({ urls }));

  // Coturn com --use-auth-secret usa credenciais temporárias: o segredo
  // permanece apenas no servidor e nunca é entregue ao navegador.
  // Aceite vírgula e espaços para não transformar uma configuração antiga
  // "turn:a turn:b" em uma única URL inválida entregue ao WebRTC.
  const turnUrls = String(process.env.TURN_URL || "").split(/[\s,]+/)
    .map((url) => url.trim())
    .filter((url) => /^turns?:/i.test(url) && !/example\.com/i.test(url));
  const turnSecret = String(process.env.TURN_SECRET || "").trim();
  if (turnUrls.length && turnSecret) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:mirante-${randomUUID()}`;
    const credential = createHmac("sha1", turnSecret).update(username).digest("base64");
    servers.push({ urls: turnUrls, username, credential });
  }

  return { iceServers: servers };
}

function send(socket, message) {
  if (socket?.readyState !== 1) return false;
  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch (error) {
    errorLog("ws_send_error", { clientId: socket.clientId, type: message?.type, error: error.message });
    return false;
  }
}

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

function allowWebsocketConnection(request) {
  return consumeFixedWindow(websocketConnectionRate, `ws:${clientIp(request)}`, websocketConnectionRateLimit, websocketConnectionRateWindowMs);
}

function websocketActiveCount(ip) {
  return websocketActiveByIp.get(ip) || 0;
}

function addWebsocketActive(ip) {
  websocketActiveByIp.set(ip, websocketActiveCount(ip) + 1);
}

function removeWebsocketActive(ip) {
  const next = Math.max(0, websocketActiveCount(ip) - 1);
  if (next) websocketActiveByIp.set(ip, next);
  else websocketActiveByIp.delete(ip);
}

function allowWebsocketControlMessage(socket) {
  const now = Date.now();
  socket.controlMessageTimestamps = (socket.controlMessageTimestamps || []).filter((timestamp) => now - timestamp < 10_000);
  if (socket.controlMessageTimestamps.length >= 240) return false;
  socket.controlMessageTimestamps.push(now);
  return true;
}

function publicOriginForRequest(request) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const forwardedProto = trustedForwardedHeaders(request)
    ? String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim()
    : "";
  const forwardedHost = trustedForwardedHeaders(request)
    ? String(request.headers["x-forwarded-host"] || "").split(",")[0].trim()
    : "";
  const protocol = forwardedProto || (request.socket.encrypted ? "https" : "http");
  const host = forwardedHost || request.headers.host;
  return host ? `${protocol}://${host}` : "";
}

function roomFor(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, {
    host: null,
    hostDisconnectedAt: null,
    hostReconnectTimer: null,
    viewers: new Map(),
    chat: loadStreamChat(roomId),
    closed: false,
    relay: { active: false, mimeType: "", firstChunk: null, recentChunks: [], recentBytes: 0 },
  });
  return rooms.get(roomId);
}

function clearHostReconnectTimer(room) {
  if (room?.hostReconnectTimer) clearTimeout(room.hostReconnectTimer);
  if (room) room.hostReconnectTimer = null;
}

function expireDisconnectedHost(roomId, room) {
  if (rooms.get(roomId) !== room || room.host || !room.hostDisconnectedAt) return;
  room.hostDisconnectedAt = null;
  room.closed = true;
  clearHostReconnectTimer(room);
  endRelay(room);
  endStreamByRoom(roomId);
  notifyViewers(room, { type: "host-left" });
  infoLog("broadcast_host_expired", { roomId, viewers: room.viewers.size });
  if (room.viewers.size === 0) rooms.delete(roomId);
}

function scheduleHostReconnect(roomId, room) {
  clearHostReconnectTimer(room);
  room.hostReconnectTimer = setTimeout(() => expireDisconnectedHost(roomId, room), hostReconnectGraceMs);
}

function notifyViewers(room, message) {
  for (const viewer of room.viewers.values()) send(viewer, message);
}

function notifyViewerCount(room) {
  const message = { type: "viewer-count", count: room.viewers.size };
  send(room.host, message);
  notifyViewers(room, message);
}

function voiceParticipantFor(socket) {
  return {
    id: socket.voiceClientId || socket.clientId,
    userId: socket.user?.id || null,
    displayName: socket.user?.displayName || "Participante",
    username: socket.user?.username || "participante",
    avatarData: compactAvatarData(socket.user?.avatarData),
    muted: Boolean(socket.voiceMuted || socket.voiceServerMuted),
    serverMuted: Boolean(socket.voiceServerMuted),
    deafened: Boolean(socket.voiceDeafened),
    speaking: Boolean(socket.voiceSpeaking),
  };
}

function broadcastVoice(voiceRoom, message) {
  for (const participant of voiceRoom?.participants?.values() || []) send(participant, message);
}

function leaveVoiceRoom(socket) {
  const voiceRoomId = socket.voiceRoomId;
  if (!voiceRoomId) return;
  const voiceRoom = voiceRooms.get(voiceRoomId);
  const participantId = socket.voiceClientId || socket.clientId;
  if (voiceRoom?.participants.get(participantId) === socket) {
    voiceRoom.participants.delete(participantId);
    for (const participant of voiceRoom.participants.values()) send(participant, { type: "voice-user-left", participantId, userId: socket.user?.id || null });
    if (voiceRoom.participants.size === 0) voiceRooms.delete(voiceRoomId);
    debugLog("voice_leave", { clientId: socket.clientId, voiceRoomId, participantId, participants: voiceRoom.participants.size });
  }
  socket.voiceRoomId = null;
  socket.voiceClientId = null;
  socket.voiceMuted = false;
  socket.voiceServerMuted = false;
  socket.voiceDeafened = false;
  socket.voiceSpeaking = false;
}

function removeDuplicateVoiceSessions(voiceRoom, socket) {
  const userId = socket.user?.id;
  if (!voiceRoom || !userId) return;
  for (const participant of [...voiceRoom.participants.values()]) {
    if (participant === socket || participant.user?.id !== userId) continue;
    send(participant, {
      type: "voice-disconnected",
      reason: "replaced",
      roomId: voiceRoom.id,
      message: "Sua sessão de voz foi substituída por uma nova conexão.",
    });
    leaveVoiceRoom(participant);
    // A conexão antiga já não participa da sala; encerrar o socket também
    // evita que uma janela em segundo plano mantenha um estado falso.
    setTimeout(() => {
      if (participant.readyState === 1) participant.close(4001, "Sessão de voz substituída");
    }, 100);
  }
}

function replaceOtherVoiceSessions(socket) {
  const userId = socket.user?.id;
  if (!userId) return;
  for (const room of voiceRooms.values()) {
    for (const participant of [...room.participants.values()]) {
      if (participant === socket || participant.user?.id !== userId) continue;
      send(participant, { type: "voice-disconnected", reason: "replaced", message: "Sua sessão de voz foi substituída por uma nova conexão." });
      leaveVoiceRoom(participant);
      if (participant.readyState === 1) participant.close(4001, "voice session replaced");
    }
  }
}

function authorizeVoiceRoomJoin(voiceRoomId, groupId, socket) {
  if (!socket.user) return { ok: false, message: "Entre com sua conta para entrar numa sala de voz." };
  const voiceRoom = database.prepare("SELECT id, group_id AS groupId, name, COALESCE(max_participants, 8) AS maxParticipants FROM group_voice_rooms WHERE id = ? AND group_id = ?").get(voiceRoomId, groupId);
  if (!voiceRoom || !isGroupMember(socket.user.id, groupId)) return { ok: false, message: "Você não tem acesso a esta sala de voz." };
  if (!canGroupAction(socket.user.id, groupId, "canChat")) return { ok: false, message: "Você não tem permissão para entrar nas salas de voz deste grupo." };
  return { ok: true, voiceRoom };
}

function voiceRoomFor(voiceRoomId, groupId = null) {
  if (!voiceRooms.has(voiceRoomId)) voiceRooms.set(voiceRoomId, { groupId, participants: new Map() });
  const room = voiceRooms.get(voiceRoomId);
  if (groupId) room.groupId = groupId;
  return room;
}

function endRelay(room) {
  room.relay.active = false;
  room.relay.mimeType = "";
  room.relay.firstChunk = null;
  room.relay.recentChunks = [];
  room.relay.recentBytes = 0;
}

function sendRelayChunk(socket, chunk, room) {
  if (socket?.readyState !== 1) return;
  // Não deixe um espectador lento transformar o relay em uma fila infinita.
  // Quando a fila voltar ao normal, reenvie o cabeçalho WebM e faça o player
  // reconstruir o buffer a partir do vídeo atual, em vez de ficar congelado.
  if (socket.bufferedAmount > 768 * 1024) {
    socket.relayNeedsResync = true;
    return;
  }
  if (socket.relayNeedsResync) {
    socket.relayNeedsResync = false;
    try {
      send(socket, { type: "relay-resync", mimeType: room.relay.mimeType });
      if (room.relay.firstChunk) {
        socket.send(room.relay.firstChunk, { binary: true });
        for (const chunk of room.relay.recentChunks || []) {
          if (chunk !== room.relay.firstChunk) socket.send(chunk, { binary: true });
        }
      }
    } catch {
      socket.relayNeedsResync = true;
      return;
    }
  }
  try { socket.send(chunk, { binary: true }); } catch { socket.relayNeedsResync = true; }
}

function resyncRelayViewer(socket, room) {
  if (socket?.readyState !== 1 || !room?.relay.active || !room.relay.firstChunk) return;
  const now = Date.now();
  if (now - (socket.lastRelayResyncAt || 0) < 1000) return;
  socket.lastRelayResyncAt = now;
  if (socket.bufferedAmount > 768 * 1024) {
    socket.relayNeedsResync = true;
    return;
  }
  socket.relayNeedsResync = false;
  try {
    send(socket, { type: "relay-resync", mimeType: room.relay.mimeType });
    socket.send(room.relay.firstChunk, { binary: true });
    for (const chunk of room.relay.recentChunks || []) {
      if (chunk !== room.relay.firstChunk) socket.send(chunk, { binary: true });
    }
  } catch { socket.relayNeedsResync = true; }
}

function notifyRelayStarted(room, target) {
  if (!room.relay.active) return;
  send(target, { type: "relay-start", mimeType: room.relay.mimeType });
  if (room.relay.firstChunk) sendRelayChunk(target, room.relay.firstChunk, room);
  // Um MediaRecorder pode gerar o primeiro fragmento apenas com o cabeçalho
  // WebM. Reenvie uma pequena janela recente para que um espectador que entra
  // depois receba também um keyframe e não fique com a tela preta.
  for (const chunk of room.relay.recentChunks || []) {
    if (chunk !== room.relay.firstChunk) sendRelayChunk(target, chunk, room);
  }
}

function leave(socket) {
  const room = rooms.get(socket.roomId);
  if (!room) return;

  if (room.host === socket) {
    room.host = null;
    endRelay(room);
    if (room.closed) {
      clearHostReconnectTimer(room);
      room.hostDisconnectedAt = null;
    } else {
      room.hostDisconnectedAt = Date.now();
      notifyViewers(room, { type: "host-paused", retryInMs: hostReconnectGraceMs, message: "O transmissor está reconectando…" });
      scheduleHostReconnect(socket.roomId, room);
    }
    debugLog("broadcast_host_leave", { clientId: socket.clientId, roomId: socket.roomId, closed: room.closed, viewers: room.viewers.size });
  } else if (room.viewers.delete(socket.clientId)) {
    send(room.host, { type: "viewer-left", viewerId: socket.clientId });
    notifyViewerCount(room);
    debugLog("broadcast_viewer_leave", { clientId: socket.clientId, roomId: socket.roomId, viewers: room.viewers.size });
  }

  if (!room.host && room.viewers.size === 0 && !room.hostDisconnectedAt) {
    clearHostReconnectTimer(room);
    rooms.delete(socket.roomId);
  }
  socket.roomId = null;
}

async function authorizeRoomJoin(roomId, socket, role) {
  if (!requireLogin) return { ok: true };
  const stream = database.prepare("SELECT id, room_name AS roomName, created_by, visibility, group_id, started_at AS startedAt FROM streams WHERE room_name = ? AND ended_at IS NULL").get(roomId);
  if (!stream) return { ok: false, message: "Esta transmissão não existe ou já foi encerrada." };
  if (!runtimeStreamIsLive(stream)) return { ok: false, message: "Esta transmissão foi encerrada. Abra uma nova live para continuar." };
  if (role === "viewer" && socket.user && stream.created_by === socket.user.id) {
    return { ok: false, message: "Você já está transmitindo esta live pelo painel do Telai." };
  }
  // Links públicos podem ser assistidos sem conta. A autenticação continua
  // obrigatória para abrir lives e para acessar qualquer canal privado.
  if (role === "viewer" && stream.visibility === "public") return { ok: true };
  if (!socket.user) return { ok: false, message: "Entre com sua conta para acessar esta transmissão." };
  if (role === "host" && stream.created_by === socket.user.id) return { ok: true };
  return canAccessStream(socket.user.id, stream)
    ? { ok: true }
    : { ok: false, message: "Você não tem acesso a esta transmissão privada." };
}

async function handleMessage(socket, message) {
  const messageType = String(message?.type || "unknown");
  if (!["signal", "voice-signal", "relay-chunk"].includes(messageType)) {
    debugLog("ws_message", { clientId: socket.clientId, type: messageType, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId });
  }
  if (messageType === "signal" || messageType === "voice-signal") {
    if (!allowRtcSignal(socket)) {
      warnLog("ws_signal_rate_limited", { clientId: socket.clientId, type: messageType, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId });
      // Um bloqueio de sinalização não pode derrubar a sala de voz inteira.
      // O frontend trata este tipo como recuperável e renegocia apenas o par
      // afetado; o erro genérico era interpretado como saída da sala.
      return send(socket, {
        type: messageType === "voice-signal" ? "voice-signal-error" : "error",
        ...(messageType === "voice-signal" ? { target: String(message.target || "").slice(0, 64) } : {}),
        message: "Sinalização temporariamente limitada. Tentando recuperar o áudio.",
      });
    }
  }
  if (message.type === "voice-join") {
    const voiceRoomId = String(message.voiceRoomId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    const groupId = String(message.groupId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (voiceRoomId.length < 12 || groupId.length < 12) return send(socket, { type: "error", message: "Sala de voz inválida." });
    const authorization = authorizeVoiceRoomJoin(voiceRoomId, groupId, socket);
    if (!authorization.ok) return send(socket, { type: "error", message: authorization.message });
    const voiceRoom = voiceRoomFor(voiceRoomId, groupId);
    const maxParticipants = parseVoiceRoomParticipantLimit(authorization.voiceRoom.maxParticipants);
    // Valide a capacidade antes de substituir a eventual sessão de voz
    // anterior desta conta. Assim, tentar entrar numa sala cheia não derruba
    // a conexão que ainda estava funcionando em outra sala.
    const currentUserId = socket.user?.id || null;
    const occupiedByOtherUsers = [...voiceRoom.participants.values()]
      .filter((participant) => participant.user?.id !== currentUserId)
      .length;
    if (occupiedByOtherUsers >= maxParticipants) return send(socket, { type: "voice-error", message: `Esta sala de voz atingiu o limite de ${maxParticipants} participante${maxParticipants === 1 ? "" : "s"}.` });
    replaceOtherVoiceSessions(socket);
    leaveVoiceRoom(socket);
    removeDuplicateVoiceSessions(voiceRoom, socket);
    socket.voiceRoomId = voiceRoomId;
    socket.voiceClientId = randomUUID();
    socket.voiceMuted = false;
    socket.voiceServerMuted = false;
    socket.voiceDeafened = false;
    socket.voiceSpeaking = false;
    const participant = voiceParticipantFor(socket);
    const existingParticipants = [...voiceRoom.participants.values()].map(voiceParticipantFor);
    voiceRoom.participants.set(socket.voiceClientId, socket);
    send(socket, { type: "voice-joined", voiceRoomId, clientId: socket.voiceClientId, participants: existingParticipants });
    for (const existing of voiceRoom.participants.values()) {
      if (existing !== socket) send(existing, { type: "voice-user-joined", participant });
    }
    infoLog("voice_join", { clientId: socket.clientId, voiceRoomId, participants: voiceRoom.participants.size });
    return;
  }

  if (message.type === "voice-move") {
    const sourceRoom = voiceRooms.get(socket.voiceRoomId);
    const participantId = String(message.participantId || "");
    const targetRoomId = String(message.targetRoomId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    const movingParticipant = sourceRoom?.participants.get(participantId);
    const groupId = sourceRoom?.groupId;
    if (!sourceRoom || !movingParticipant || !groupId || !socket.user || !canGroupAction(socket.user.id, groupId, "canMoveMembers")) {
      return send(socket, { type: "voice-error", action: "move", message: "Você não tem permissão para mover pessoas entre salas." });
    }
    const targetRoomRecord = database.prepare("SELECT id, group_id AS groupId, COALESCE(max_participants, 8) AS maxParticipants FROM group_voice_rooms WHERE id = ?").get(targetRoomId);
    if (!targetRoomRecord || targetRoomRecord.groupId !== groupId) return send(socket, { type: "voice-error", action: "move", message: "A sala de destino não pertence a este grupo." });
    if (targetRoomId === socket.voiceRoomId) return;
    const targetRoom = voiceRoomFor(targetRoomId, groupId);
    const targetMaxParticipants = parseVoiceRoomParticipantLimit(targetRoomRecord.maxParticipants);
    if (targetRoom.participants.size >= targetMaxParticipants) return send(socket, { type: "voice-error", action: "move", message: `A sala de destino atingiu o limite de ${targetMaxParticipants} participante${targetMaxParticipants === 1 ? "" : "s"}.` });

    const previousRoomId = movingParticipant.voiceRoomId;
    const movingUserId = movingParticipant.user?.id || null;
    sourceRoom.participants.delete(participantId);
    for (const participant of sourceRoom.participants.values()) send(participant, { type: "voice-user-left", participantId, userId: movingUserId });
    if (sourceRoom.participants.size === 0) voiceRooms.delete(previousRoomId);

    movingParticipant.voiceRoomId = targetRoomId;
    movingParticipant.voiceClientId = randomUUID();
    movingParticipant.voiceSpeaking = false;
    const participant = voiceParticipantFor(movingParticipant);
    const existingParticipants = [...targetRoom.participants.values()].map(voiceParticipantFor);
    targetRoom.participants.set(movingParticipant.voiceClientId, movingParticipant);
    send(movingParticipant, { type: "voice-moved", voiceRoomId: targetRoomId, clientId: movingParticipant.voiceClientId, participants: existingParticipants, previousRoomId, muted: Boolean(movingParticipant.voiceMuted || movingParticipant.voiceServerMuted), serverMuted: Boolean(movingParticipant.voiceServerMuted) });
    for (const existing of targetRoom.participants.values()) {
      if (existing !== movingParticipant) send(existing, { type: "voice-user-joined", participant });
    }
    return;
  }

  if (message.type === "voice-mute") {
    const voiceRoom = voiceRooms.get(socket.voiceRoomId);
    const participantId = String(message.participantId || "");
    const target = voiceRoom?.participants.get(participantId);
    const groupId = voiceRoom?.groupId;
    if (!voiceRoom || !target || !groupId || !socket.user || !canGroupAction(socket.user.id, groupId, "canMoveMembers")) {
      return send(socket, { type: "voice-error", action: "mute", message: "Você não tem permissão para silenciar pessoas nesta sala." });
    }
    target.voiceServerMuted = message.muted !== false;
    if (target.voiceServerMuted && target.voiceSpeaking) {
      target.voiceSpeaking = false;
      broadcastVoice(voiceRoom, { type: "voice-user-speaking", participantId: target.voiceClientId, speaking: false });
    }
    send(target, { type: "voice-force-mute", muted: Boolean(target.voiceServerMuted) });
    broadcastVoice(voiceRoom, { type: "voice-user-muted", participantId: target.voiceClientId, muted: Boolean(target.voiceMuted || target.voiceServerMuted), serverMuted: Boolean(target.voiceServerMuted) });
    return;
  }

  if (message.type === "voice-mute-state") {
    const voiceRoom = voiceRooms.get(socket.voiceRoomId);
    if (!voiceRoom) return;
    socket.voiceMuted = Boolean(message.muted);
    if (socket.voiceMuted && socket.voiceSpeaking) {
      socket.voiceSpeaking = false;
      broadcastVoice(voiceRoom, { type: "voice-user-speaking", participantId: socket.voiceClientId, speaking: false });
    }
    broadcastVoice(voiceRoom, { type: "voice-user-muted", participantId: socket.voiceClientId, muted: Boolean(socket.voiceMuted || socket.voiceServerMuted), serverMuted: Boolean(socket.voiceServerMuted) });
    return;
  }

  if (message.type === "voice-speaking") {
    const voiceRoom = voiceRooms.get(socket.voiceRoomId);
    if (!voiceRoom || !socket.voiceClientId) return;
    if (!allowVoiceSpeakingUpdate(socket)) {
      reportVoiceSpeakingRateLimited(socket);
      return;
    }
    // Um participante silenciado na sala não pode voltar a anunciar voz até
    // que a moderação remova o bloqueio do microfone.
    const speaking = !socket.voiceMuted && !socket.voiceServerMuted && message.speaking === true;
    if (socket.voiceSpeaking === speaking) return;
    socket.voiceSpeaking = speaking;
    broadcastVoice(voiceRoom, { type: "voice-user-speaking", participantId: socket.voiceClientId, speaking });
    return;
  }

  if (message.type === "voice-deafen-state") {
    const voiceRoom = voiceRooms.get(socket.voiceRoomId);
    if (!voiceRoom || !socket.voiceClientId) return;
    socket.voiceDeafened = Boolean(message.deafened);
    broadcastVoice(voiceRoom, { type: "voice-user-deafened", participantId: socket.voiceClientId, deafened: socket.voiceDeafened });
    return;
  }

  if (message.type === "voice-disconnect") {
    const voiceRoom = voiceRooms.get(socket.voiceRoomId);
    const participantId = String(message.participantId || "");
    const target = voiceRoom?.participants.get(participantId);
    const groupId = voiceRoom?.groupId;
    if (!voiceRoom || !target || !groupId || !socket.user || !canGroupAction(socket.user.id, groupId, "canMoveMembers")) {
      return send(socket, { type: "voice-error", action: "disconnect", message: "Você não tem permissão para desconectar pessoas desta sala." });
    }
    if (target === socket) {
      leaveVoiceRoom(socket);
      return;
    }
    send(target, { type: "voice-disconnected", message: "Você foi desconectado da sala por um administrador." });
    leaveVoiceRoom(target);
    return;
  }

  if (message.type === "voice-leave") {
    leaveVoiceRoom(socket);
    return;
  }

  if (message.type === "voice-signal") {
    const voiceRoom = voiceRooms.get(socket.voiceRoomId);
    const targetId = String(message.target || "");
    const target = voiceRoom?.participants.get(targetId);
    if (!target || target === socket) return;
    const payload = normalizeRtcSignalPayload(message.payload);
    if (!payload) return send(socket, { type: "error", message: "Sinalização de voz inválida." });
    send(target, { type: "voice-signal", from: socket.voiceClientId, payload });
    return;
  }

  if (message.type === "join") {
    const roomId = String(message.roomId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    const role = message.role === "host" ? "host" : "viewer";
    if (roomId.length < 6) return send(socket, { type: "error", message: "Sala inválida." });

    const authorization = await authorizeRoomJoin(roomId, socket, role);
    if (!authorization.ok) return send(socket, { type: "error", message: authorization.message });

    leave(socket);
    const room = roomFor(roomId);
    if (room.closed) return send(socket, { type: "error", message: "Esta sala foi encerrada." });
    socket.roomId = roomId;
    socket.role = role;
    socket.chatTimestamps = [];

    if (role === "host") {
      if (room.host) return send(socket, { type: "error", message: "Esta sala já possui um transmissor." });
      clearHostReconnectTimer(room);
      room.hostDisconnectedAt = null;
      room.closed = false;
      room.host = socket;
      send(socket, { type: "joined", role, clientId: socket.clientId, viewerCount: room.viewers.size });
      notifyViewerCount(room);
      send(socket, { type: "chat-history", messages: room.chat });
      for (const viewer of room.viewers.values()) {
        send(viewer, { type: "host-ready", hostId: socket.clientId });
        if (mediaMode === "relay") notifyRelayStarted(room, viewer);
        send(socket, { type: "viewer-joined", viewerId: viewer.clientId });
      }
      infoLog("broadcast_host_join", { clientId: socket.clientId, roomId, viewers: room.viewers.size });
      return;
    }

    room.viewers.set(socket.clientId, socket);
    send(socket, { type: "joined", role, clientId: socket.clientId, hostId: room.host?.clientId || null, viewerCount: room.viewers.size });
    send(socket, { type: "chat-history", messages: room.chat });
    send(room.host, { type: "viewer-joined", viewerId: socket.clientId });
    notifyViewerCount(room);
    if (room.host) send(socket, { type: "host-ready", hostId: room.host.clientId });
    else send(socket, { type: "waiting", message: "Aguardando o transmissor abrir a sala." });
    if (mediaMode === "relay") notifyRelayStarted(room, socket);
    infoLog("broadcast_viewer_join", { clientId: socket.clientId, roomId, hostPresent: Boolean(room.host), viewers: room.viewers.size });
    return;
  }

  if (message.type === "relay-start") {
    const room = rooms.get(socket.roomId);
    if (mediaMode !== "relay" || room?.host !== socket) return;
    const mimeType = String(message.mimeType || "");
    if (!/^video\/webm(?:;codecs=vp8(?:,opus)?)?$/i.test(mimeType)) {
      return send(socket, { type: "error", message: "Formato relay não suportado pelo servidor." });
    }
    room.relay = { active: true, mimeType, firstChunk: null, recentChunks: [] };
    notifyViewers(room, { type: "relay-start", mimeType });
    infoLog("relay_started", { clientId: socket.clientId, roomId: socket.roomId, viewers: room.viewers.size });
    return;
  }

  if (message.type === "relay-resync") {
    const room = rooms.get(socket.roomId);
    if (mediaMode === "relay" && room?.viewers.get(socket.clientId) === socket) resyncRelayViewer(socket, room);
    return;
  }

  if (message.type === "signal") {
    const room = rooms.get(socket.roomId);
    if (!room || !message.target) return;
    const target = room.host?.clientId === message.target
      ? room.host
      : room.viewers.get(message.target);
    const payload = normalizeRtcSignalPayload(message.payload);
    if (!payload) return send(socket, { type: "error", message: "Sinalização de transmissão inválida." });
    send(target, { type: "signal", from: socket.clientId, payload });
    return;
  }

  if (message.type === "quality-lock") {
    const room = rooms.get(socket.roomId);
    const quality = ["high", "balanced", "economy"].includes(message.quality) ? message.quality : "balanced";
    const target = room?.viewers.get(String(message.target || ""));
    if (room?.host !== socket || !target) return;
    send(target, { type: "quality-lock", quality });
    return;
  }

  if (message.type === "quality") {
    // A qualidade da live é definida pelo transmissor. Preferências do
    // espectador não podem elevar o perfil acima do limite do host.
    return;
  }

  if (message.type === "chat-message") {
    const room = rooms.get(socket.roomId);
    if (!room || (room.host !== socket && room.viewers.get(socket.clientId) !== socket)) return;
    const stream = streamForRoom(socket.roomId);
    if (room.closed || !stream || stream.endedAt) return send(socket, { type: "chat-error", message: "Esta transmissão já foi encerrada." });
    const body = String(message.body || "").trim().slice(0, 500);
    if (!body) return;
    const now = Date.now();
    socket.chatTimestamps = (socket.chatTimestamps || []).filter((timestamp) => now - timestamp < 10_000);
    if (socket.chatTimestamps.length >= 8) return send(socket, { type: "chat-error", message: "Aguarde alguns segundos antes de enviar mais mensagens." });
    socket.chatTimestamps.push(now);
    const chatMessage = {
      id: randomUUID(),
      userId: socket.user?.id || null,
      body,
      displayName: socket.user?.displayName || "Visitante",
      username: socket.user?.username || "visitante",
      createdAt: new Date(now).toISOString(),
    };
    database.prepare(`
      INSERT INTO stream_chat_messages (id, channel_user_id, stream_id, user_id, body, display_name, username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(chatMessage.id, stream.createdBy, stream.id, socket.user?.id || null, chatMessage.body, chatMessage.displayName, chatMessage.username, chatMessage.createdAt);
    room.chat.push(chatMessage);
    if (room.chat.length > 120) room.chat.splice(0, room.chat.length - 120);
    send(room.host, { type: "chat-message", message: chatMessage });
    for (const viewer of room.viewers.values()) send(viewer, { type: "chat-message", message: chatMessage });
    return;
  }

  if (message.type === "clear-chat") {
    const room = rooms.get(socket.roomId);
    const stream = streamForRoom(socket.roomId);
    if (!room || room.host !== socket || !stream || stream.createdBy !== socket.user?.id) {
      return send(socket, { type: "chat-error", message: "Somente o dono do canal pode limpar o histórico." });
    }
    database.prepare("DELETE FROM stream_chat_messages WHERE stream_id = ?").run(stream.id);
    room.chat = [];
    send(room.host, { type: "chat-cleared" });
    for (const viewer of room.viewers.values()) send(viewer, { type: "chat-cleared" });
    return;
  }

  if (message.type === "stop") {
    const room = rooms.get(socket.roomId);
    if (room?.host === socket) {
      const requestedReason = String(message.reason || "user");
      const reason = ["user", "logout", "capture-timeout", "capture-ended-before-start"].includes(requestedReason)
        ? requestedReason
        : "user";
      closeBroadcastRoom(socket.roomId);
      infoLog("broadcast_stopped", { clientId: socket.clientId, roomId: socket.roomId, viewers: room.viewers.size, reason });
    }
    return;
  }

  if (message.type === "leave") leave(socket);
}

function handleBinaryMessage(socket, raw) {
  const room = rooms.get(socket.roomId);
  if (mediaMode !== "relay" || !room?.relay.active || room.host !== socket) return;
  if (raw.byteLength > relayChunkMaxBytes) {
    warnLog("ws_relay_chunk_too_large", { clientId: socket.clientId, roomId: socket.roomId, bytes: raw.byteLength });
    socket.close(1009, "Fragmento relay muito grande");
    return;
  }
  const chunk = Buffer.from(raw);
  if (!room.relay.firstChunk) room.relay.firstChunk = chunk;
  room.relay.recentChunks.push(chunk);
  room.relay.recentBytes = (room.relay.recentBytes || 0) + chunk.length;
  while (room.relay.recentChunks.length > 8 || room.relay.recentBytes > relayRecentBytesMax) {
    const removed = room.relay.recentChunks.shift();
    room.relay.recentBytes = Math.max(0, room.relay.recentBytes - (removed?.length || 0));
  }
  for (const viewer of room.viewers.values()) sendRelayChunk(viewer, chunk, room);
}

async function handleHttpRequest(request, response) {
  const requestStartedAt = process.hrtime.bigint();
  const requestId = randomUUID();
  const route = metricRoute(new URL(request.url, `http://${request.headers.host}`).pathname);
  let responseBytes = 0;
  let requestSettled = false;
  const originalWrite = response.write.bind(response);
  const originalEnd = response.end.bind(response);
  response.write = (...args) => {
    const chunkBytes = addResponseBytes(response, args[0]);
    if (Number.isFinite(chunkBytes)) responseBytes += chunkBytes;
    return originalWrite(...args);
  };
  response.end = (...args) => {
    const chunkBytes = addResponseBytes(response, args[0]);
    if (Number.isFinite(chunkBytes)) responseBytes += chunkBytes;
    return originalEnd(...args);
  };
  const finishRequest = (completed) => {
    if (requestSettled) return;
    requestSettled = true;
    observability.activeRequests = Math.max(0, observability.activeRequests - 1);
    if (completed) observability.requestsCompleted += 1;
    else observability.requestsAborted += 1;
    observability.responseBytes += responseBytes;
    addMapCount(observability.statusCounts, String(response.statusCode || 0));
    addMapCount(observability.routeCounts, route);
    addMapCount(observability.routeBytes, route, responseBytes);
    const durationMs = Number(process.hrtime.bigint() - requestStartedAt) / 1e6;
    const requestLog = {
      event: "http_request",
      requestId,
      method: request.method,
      path: request.url?.split("?", 1)[0] || "/",
      route,
      status: response.statusCode || 0,
      durationMs: Math.round(durationMs * 100) / 100,
      bytesOut: responseBytes,
      completed,
    };
    if ((response.statusCode || 0) >= 500) errorLog("http_request", requestLog);
    else if ((response.statusCode || 0) >= 400) warnLog("http_request", requestLog);
    else debugLog("http_request", requestLog);
  };
  observability.activeRequests += 1;
  observability.requestsTotal += 1;
  response.on("finish", () => finishRequest(true));
  response.on("close", () => finishRequest(false));
  request.on("aborted", () => debugLog("http_request_aborted", { requestId, method: request.method, route }));
  response.on("error", (error) => errorLog("http_response_error", { requestId, route, error: error.message }));
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  // O Multistream renderiza cada transmissão em um iframe do próprio
  // Telai. SAMEORIGIN libera apenas esse uso e continua bloqueando
  // incorporações feitas por sites externos.
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Permissions-Policy", "camera=(self), microphone=(self), display-capture=(self)");
  response.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self' http: https: ws: wss:");
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (!enforceApiRateLimit(request, response, requestUrl.pathname)) return;
  if (requestUrl.pathname === "/api/maintenance" && request.method === "GET") {
    return json(response, 200, { notice: activeMaintenanceNotice() });
  }
  if (requestUrl.pathname === "/api/admin/maintenance" && request.method === "POST") {
    const operator = requireMaintenanceOperator(request, response);
    if (!operator) return;
    readJson(request).then((body) => {
      const delaySeconds = Number(body.delaySeconds ?? 60);
      const durationSeconds = Number(body.durationSeconds ?? 600);
      if (!Number.isInteger(delaySeconds) || delaySeconds < 10 || delaySeconds > 3600) {
        return json(response, 400, { error: "O atraso precisa estar entre 10 e 3600 segundos." });
      }
      if (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 86_400) {
        return json(response, 400, { error: "A duração precisa estar entre 60 e 86400 segundos." });
      }
      const message = String(body.message || "O Telai será atualizado para aplicar melhorias. Salve seu trabalho e aguarde a reconexão.").trim().slice(0, 240);
      const now = Date.now();
      const startsAt = new Date(now + delaySeconds * 1000).toISOString();
      const expiresAt = new Date(now + (delaySeconds + durationSeconds) * 1000).toISOString();
      database.prepare("UPDATE maintenance_notices SET expires_at = ? WHERE expires_at > ?").run(new Date(now).toISOString(), new Date(now).toISOString());
      database.prepare(`
        INSERT INTO maintenance_notices (id, message, starts_at, expires_at, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), message, startsAt, expiresAt, operator.user?.id || null, new Date(now).toISOString());
      return json(response, 201, { notice: activeMaintenanceNotice() });
    }).catch(() => json(response, 400, { error: "Não foi possível programar a manutenção." }));
    return;
  }
  if (requestUrl.pathname === "/api/admin/maintenance" && request.method === "DELETE") {
    const operator = requireMaintenanceOperator(request, response);
    if (!operator) return;
    database.prepare("UPDATE maintenance_notices SET expires_at = ? WHERE expires_at > ?").run(new Date().toISOString(), new Date().toISOString());
    return json(response, 200, { ok: true });
  }
  if (requestUrl.pathname === "/api/admin/email/status" && request.method === "GET") {
    if (!requireSiteAdmin(request, response)) return;
    const smtp = requestUrl.searchParams.get("verify") === "1" ? await verifySmtp() : smtpStatus();
    return json(response, 200, { smtp });
  }
  if (requestUrl.pathname === "/api/admin/email/test" && request.method === "POST") {
    if (!requireSiteAdmin(request, response)) return;
    try {
      const body = await readJson(request, 4 * 1024);
      const recipient = String(body.to || "").trim();
      const result = await sendEmail({
        to: recipient,
        subject: "Teste de SMTP do Telai",
        text: "Este é um teste de envio SMTP do Telai. Se você recebeu esta mensagem, o relay está funcionando.",
        html: "<p>Este é um teste de envio SMTP do Telai.</p><p>Se você recebeu esta mensagem, o relay está funcionando.</p>",
      });
      infoLog("smtp_test_sent", { operatorId: currentUser(request)?.id || null, recipientDomain: recipient.split("@").pop() || "" });
      return json(response, 200, { ok: true, smtp: smtpStatus(), messageId: result.messageId });
    } catch (error) {
      warnLog("smtp_test_failed", { errorCode: error?.code || "smtp-test-failed", error: error?.message || String(error) });
      return json(response, 502, { error: "Não foi possível enviar o e-mail de teste.", code: error?.code || "smtp-test-failed" });
    }
  }
  if (requestUrl.pathname === "/api/admin/summary" && request.method === "GET") {
    if (!requireSiteAdmin(request, response)) return;
    try {
      return json(response, 200, siteAdminSummary());
    } catch (error) {
      errorLog("admin_summary_error", { error: error.message });
      return json(response, 500, { error: "Não foi possível carregar o resumo administrativo." });
    }
  }
  if (requestUrl.pathname === "/api/admin/accounts" && request.method === "GET") {
    if (!requireSiteAdmin(request, response)) return;
    try {
      return json(response, 200, siteAdminAccountsPage(requestUrl));
    } catch (error) {
      errorLog("admin_accounts_error", { error: error.message });
      return json(response, 500, { error: "Não foi possível carregar as contas administrativas." });
    }
  }
  if (requestUrl.pathname === "/api/admin/groups" && request.method === "GET") {
    if (!requireSiteAdmin(request, response)) return;
    try {
      return json(response, 200, siteAdminGroupsPage(requestUrl));
    } catch (error) {
      errorLog("admin_groups_error", { error: error.message });
      return json(response, 500, { error: "Não foi possível carregar os grupos administrativos." });
    }
  }
  if (requestUrl.pathname === "/api/admin/streams" && request.method === "GET") {
    if (!requireSiteAdmin(request, response)) return;
    try {
      return json(response, 200, siteAdminStreamsPage(requestUrl));
    } catch (error) {
      errorLog("admin_streams_error", { error: error.message });
      return json(response, 500, { error: "Não foi possível carregar as transmissões administrativas." });
    }
  }
  const adminMembersMatch = requestUrl.pathname.match(/^\/api\/admin\/groups\/([\w-]{1,128})\/members$/);
  if (adminMembersMatch && request.method === "GET") {
    if (!requireSiteAdmin(request, response)) return;
    try {
      const result = siteAdminGroupMembersPage(requestUrl, adminMembersMatch[1]);
      if (!result) return json(response, 404, { error: "Grupo não encontrado." });
      return json(response, 200, result);
    } catch (error) {
      errorLog("admin_group_members_error", { error: error.message });
      return json(response, 500, { error: "Não foi possível carregar os membros do grupo." });
    }
  }
  if (requestUrl.pathname === "/api/admin/overview" && request.method === "GET") {
    if (!requireSiteAdmin(request, response)) return;
    try {
      return json(response, 200, siteAdminOverview());
    } catch (error) {
      errorLog("admin_overview_error", { error: error.message });
      return json(response, 500, { error: "Não foi possível carregar o painel administrativo." });
    }
  }
  if ((requestUrl.pathname === "/admin" || requestUrl.pathname === "/admin/") && ["GET", "HEAD"].includes(request.method)) {
    if (!requireSiteAdmin(request, response)) return;
    const adminPath = path.join(publicDir, "admin", "index.html");
    fs.readFile(adminPath, (error, content) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Cache-Control": "no-store" }).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      });
      if (request.method === "HEAD") response.end();
      else response.end(content);
    });
    return;
  }
  if (requestUrl.pathname === "/metrics") {
    if (!isLocalObservabilityRequest(request)) return json(response, 404, { error: "Not found" });
    return json(response, 200, observabilitySnapshot());
  }
  if (requestUrl.pathname === "/api/client-errors" && request.method === "POST") {
    if (!allowClientErrorRequest(request)) {
      response.setHeader("Retry-After", "60");
      return json(response, 429, { error: "Muitos diagnósticos. Tente novamente em um minuto." });
    }
    try {
      const body = await readJson(request, 12 * 1024);
      const user = currentUser(request);
      const kind = String(body.kind || "client_error").replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 64) || "client_error";
      addMapCount(observability.clientEventCounts, kind);
      const clientDiagnostic = {
        kind,
        message: String(body.message || "Erro sem mensagem").slice(0, 240),
        stack: String(body.stack || "").slice(0, 1200),
        route: String(body.route || request.headers.referer || "").split("?", 1)[0].slice(0, 240),
        appVersion: String(body.appVersion || "").slice(0, 32),
        context: body.context && typeof body.context === "object" ? body.context : {},
        authenticated: Boolean(user),
      };
      const isViewerTelemetry = kind.startsWith("viewer_")
        && !kind.includes("error")
        && !kind.includes("timeout")
        && !kind.endsWith("_stalled")
        && !kind.endsWith("_ended")
        && !kind.endsWith("_closed")
        && !kind.includes("recovery_started");
      const isRoutineClientTelemetry = routineClientDiagnosticKinds.has(kind);
      if (isViewerTelemetry || isRoutineClientTelemetry) infoLog("client_telemetry", clientDiagnostic);
      else errorLog("client_error", clientDiagnostic);
      return json(response, 202, { ok: true });
    } catch (error) {
      warnLog("client_error_rejected", { error: error.message });
      return json(response, 400, { error: "Diagnóstico inválido." });
    }
  }
  const oauthStartMatch = requestUrl.pathname.match(/^\/api\/auth\/(google|discord)$/);
  if (oauthStartMatch && request.method === "GET") {
    const providerName = oauthStartMatch[1];
    const provider = oauthProvider(providerName);
    if (!provider) return oauthErrorRedirect(response, "provider-not-configured");
    const linkMode = requestUrl.searchParams.get("mode") === "link";
    const linkingUser = linkMode ? currentUser(request) : null;
    if (linkMode && !linkingUser) return response.writeHead(302, { Location: "/login?auth_error=login-required" }).end();
    const now = Date.now();
    for (const [key, entry] of oauthStates) {
      if (!entry || entry.expiresAt <= now) oauthStates.delete(key);
    }
    if (oauthStates.size >= maxOAuthStates) {
      warnLog("oauth_state_capacity_reached", { provider: providerName, states: oauthStates.size });
      return oauthErrorRedirect(response, "oauth-temporarily-unavailable");
    }
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    oauthStates.set(hashSessionToken(state), { provider: providerName, verifier, mode: linkMode ? "link" : "login", userId: linkingUser?.id || null, expiresAt: Date.now() + 10 * 60 * 1000 });
    const authorizationUrl = new URL(provider.authorizationEndpoint);
    authorizationUrl.search = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: oauthRedirectUri(providerName, request),
      response_type: "code",
      scope: provider.scope,
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
      ...(providerName === "google" ? { access_type: "online", prompt: "select_account" } : {}),
    });
    response.setHeader("Set-Cookie", oauthStateCookie(hashSessionToken(state), request));
    return response.writeHead(302, { Location: authorizationUrl.toString() }).end();
  }
  const oauthCallbackMatch = requestUrl.pathname.match(/^\/api\/auth\/(google|discord)\/callback$/);
  if (oauthCallbackMatch && request.method === "GET") {
    const providerName = oauthCallbackMatch[1];
    const state = String(requestUrl.searchParams.get("state") || "");
    const stateHash = hashSessionToken(state);
    const stateCookie = parseCookies(request).mirante_oauth_state;
    const stateData = oauthStates.get(stateHash);
    oauthStates.delete(stateHash);
    response.setHeader("Set-Cookie", oauthStateCookie("", request, 0));
    if (requestUrl.searchParams.get("error")) return oauthErrorRedirect(response, "provider-cancelled");
    if (!state || !stateData || stateData.provider !== providerName || stateData.expiresAt < Date.now() || stateCookie !== stateHash) {
      return oauthErrorRedirect(response, "invalid-oauth-state");
    }
    const code = String(requestUrl.searchParams.get("code") || "");
    if (!code) return oauthErrorRedirect(response, "missing-oauth-code");
    try {
      const identity = await fetchOAuthIdentity(providerName, code, stateData.verifier, request);
      if (stateData.mode === "link") {
        const linkingUser = currentUser(request);
        if (!linkingUser || linkingUser.id !== stateData.userId) throw new Error("oauth-link-session-invalid");
        const linkResult = linkOAuthAccount(providerName, identity, linkingUser.id);
        const linkQuery = new URLSearchParams({ account: "1", linked: providerName });
        if (linkResult.suggestedDisplayName && linkResult.suggestedDisplayName !== linkResult.currentDisplayName) linkQuery.set("name", linkResult.suggestedDisplayName);
        return response.writeHead(302, { Location: `/?${linkQuery.toString()}` }).end();
      }
      const user = upsertOAuthUser(providerName, identity);
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .run(hashSessionToken(token), user.id, expiresAt, new Date().toISOString());
      response.setHeader("Set-Cookie", [sessionCookie(token, request), oauthStateCookie("", request, 0)]);
      return response.writeHead(302, { Location: "/" }).end();
    } catch (error) {
      console.error(`OAuth ${providerName} callback failed:`, error.message);
      const errorCode = ["oauth-account-linked", "oauth-email-linked-other-account", "oauth-link-session-invalid", "oauth-provider-conflict", "oauth-merge-user-missing"].includes(error.message) ? error.message : "oauth-login-failed";
      return oauthErrorRedirect(response, errorCode, { provider: providerName });
    }
  }
  if (requestUrl.pathname === "/api/auth/providers" && request.method === "GET") {
    return json(response, 200, { google: Boolean(oauthProvider("google")), discord: Boolean(oauthProvider("discord")) });
  }
  if (requestUrl.pathname === "/api/auth/session" && request.method === "GET") {
    return json(response, 200, { user: userWithLinkedAccounts(currentUser(request)) });
  }
  if (requestUrl.pathname === "/api/auth/consent" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const origin = String(request.headers.origin || "").trim();
    if (origin) {
      let sameOrigin = false;
      try { sameOrigin = new URL(origin).origin === publicOriginForRequest(request); } catch {}
      if (!sameOrigin) return json(response, 403, { error: "Origem não permitida." });
    }
    readJson(request).then((body) => {
      if (body.termsAccepted !== true || body.privacyAccepted !== true) return json(response, 400, { error: "É necessário aceitar os dois documentos." });
      recordLegalConsents(user.id);
      return json(response, 200, { legal: legalConsentStatus(user.id) });
    }).catch(() => json(response, 400, { error: "Não foi possível registrar seu aceite." }));
    return;
  }
  if (requestUrl.pathname === "/api/account/export" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    try {
      const exportData = userDataExport(user.id);
      if (!exportData) return json(response, 404, { error: "Conta não encontrada." });
      const body = JSON.stringify(exportData, null, 2);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="telai-dados-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
      }).end(body);
    } catch (error) {
      errorLog("account_export_error", { error: error.message });
      return json(response, 500, { error: "Não foi possível gerar sua exportação." });
    }
    return;
  }
  if (requestUrl.pathname === "/api/account/delete" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const origin = String(request.headers.origin || "").trim();
    if (origin) {
      let sameOrigin = false;
      try { sameOrigin = new URL(origin).origin === publicOriginForRequest(request); } catch {}
      if (!sameOrigin) return json(response, 403, { error: "Origem não permitida." });
    }
    readJson(request).then((body) => {
      const confirmation = String(body.confirmation || "").trim();
      const expected = `EXCLUIR ${user.username.toUpperCase()}`;
      if (confirmation !== expected) return json(response, 400, { error: `Digite exatamente: ${expected}` });
      deleteUserAccount(user.id);
      response.setHeader("Set-Cookie", expiredSessionCookie(request));
      return json(response, 200, { ok: true });
    }).catch((error) => {
      if (error.message === "account-not-found") return json(response, 404, { error: "Conta não encontrada." });
      errorLog("account_delete_error", { error: error.message });
      return json(response, 500, { error: "Não foi possível excluir sua conta." });
    });
    return;
  }
  if (requestUrl.pathname === "/api/auth/register" && request.method === "POST") {
    readJson(request).then((body) => {
      const username = normalizeUsername(body.username);
      const displayName = String(body.displayName || username).trim().slice(0, 48);
      const password = String(body.password || "");
      if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) return json(response, 400, { error: "Use um usuário de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado." });
      if (displayName.length < 2) return json(response, 400, { error: "Informe um nome para exibição." });
      if (password.length < 8 || password.length > 128) return json(response, 400, { error: "A senha deve ter entre 8 e 128 caracteres." });
      if (body.termsAccepted !== true || body.privacyAccepted !== true) return json(response, 400, { error: "Leia e aceite os Termos de Uso e a Política de Privacidade para criar sua conta." });
      const user = { id: randomUUID(), username, displayName };
      try {
        const now = new Date().toISOString();
        database.exec("BEGIN IMMEDIATE");
        database.prepare("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(user.id, user.username, user.displayName, hashPassword(password), now);
        recordLegalConsents(user.id, now);
        database.exec("COMMIT");
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch {}
        if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Esse nome de usuário já está em uso." });
        throw error;
      }
      createSession(user.id, request, response);
      return json(response, 201, { user: { ...user, avatarData: null, linkedAccounts: [], legal: legalConsentStatus(user.id) } });
    }).catch((error) => json(response, 400, { error: error.message === "body-too-large" ? "Dados inválidos." : "Não foi possível criar a conta." }));
    return;
  }
  if (requestUrl.pathname === "/api/auth/login" && request.method === "POST") {
    readJson(request).then((body) => {
      const username = normalizeUsername(body.username);
      const password = String(body.password || "");
      const failureRetryAfter = loginIsBlocked(request, username);
      if (failureRetryAfter) {
        response.setHeader("Retry-After", String(failureRetryAfter));
        return json(response, 429, { error: "Muitas tentativas de login. Aguarde antes de tentar novamente.", retryAfter: failureRetryAfter });
      }
      if (!allowLoginAttempt(request, username)) {
        const retryAfter = Math.max(1, Math.ceil((loginRate.get(clientIp(request))?.startedAt + loginRateWindowMs - Date.now()) / 1000));
        response.setHeader("Retry-After", String(retryAfter));
        return json(response, 429, { error: "Muitas tentativas de login. Aguarde um minuto e tente novamente.", retryAfter });
      }
      const row = database.prepare("SELECT id, username, display_name AS displayName, avatar_data AS avatarData, password_hash FROM users WHERE username = ?").get(username);
      if (!row || !passwordMatches(password, row.password_hash)) {
        recordLoginFailure(request, username);
        return json(response, 401, { error: "Usuário ou senha incorretos." });
      }
      clearLoginFailure(request, username);
      createSession(row.id, request, response);
      return json(response, 200, { user: userWithLinkedAccounts({ id: row.id, username: row.username, displayName: row.displayName, avatarData: row.avatarData }) });
    }).catch(() => json(response, 400, { error: "Não foi possível entrar." }));
    return;
  }
  if (requestUrl.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = parseCookies(request).mirante_session;
    if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
    response.setHeader("Set-Cookie", expiredSessionCookie(request));
    return json(response, 200, { ok: true });
  }
  if (requestUrl.pathname === "/api/auth/profile" && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    readJson(request, 8 * 1024 * 1024).then((body) => {
      const displayName = String(body.displayName || "").trim().slice(0, 48);
      if (displayName.length < 2) return json(response, 400, { error: "Informe um nome de exibição válido." });
      const avatarWasProvided = Object.prototype.hasOwnProperty.call(body, "avatarData");
      const avatarData = avatarWasProvided && body.avatarData ? String(body.avatarData) : (avatarWasProvided ? null : user.avatarData || null);
      if (avatarData && (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(avatarData) || avatarData.length > maxAvatarUploadLength)) {
        return json(response, 400, { error: "A foto deve ser PNG, JPG, WEBP ou GIF com até 5 MB." });
      }
      database.prepare("UPDATE users SET display_name = ?, avatar_data = ? WHERE id = ?").run(displayName, avatarData, user.id);
      return json(response, 200, { user: userWithLinkedAccounts(currentUser(request)) });
    }).catch((error) => json(response, 400, { error: error.message === "body-too-large" ? "A foto é muito grande. Use um arquivo de até 5 MB." : "Não foi possível atualizar o perfil." }));
    return;
  }
  if (requestUrl.pathname === "/api/auth/channel" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    return json(response, 200, { channel: channelProfileForUser(user.id) });
  }
  if (requestUrl.pathname === "/api/auth/channel" && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    readJson(request, 8 * 1024 * 1024).then((body) => {
      const current = channelProfileForUser(user.id);
      const displayName = String(body.displayName || "").trim().slice(0, 48);
      if (displayName.length < 2) return json(response, 400, { error: "Informe um nome válido para o canal." });
      const avatarWasProvided = Object.prototype.hasOwnProperty.call(body, "avatarData");
      const avatarData = avatarWasProvided && body.avatarData ? String(body.avatarData) : (avatarWasProvided ? null : current?.avatarData || null);
      if (avatarData && (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(avatarData) || avatarData.length > maxAvatarUploadLength)) {
        return json(response, 400, { error: "A foto do canal deve ser PNG, JPG, WEBP ou GIF com até 5 MB." });
      }
      const games = Array.isArray(body.games) ? parseChannelGames(body.games) : (current?.games || []);
      database.prepare(`
        INSERT INTO channel_profiles (user_id, display_name, avatar_data, games, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, avatar_data = excluded.avatar_data, games = excluded.games, updated_at = excluded.updated_at
      `).run(user.id, displayName, avatarData, JSON.stringify(games), new Date().toISOString());
      return json(response, 200, { channel: channelProfileForUser(user.id) });
    }).catch((error) => json(response, 400, { error: error.message === "body-too-large" ? "A foto é muito grande. Use um arquivo de até 5 MB." : "Não foi possível atualizar o canal." }));
    return;
  }
  if (requestUrl.pathname === "/api/auth/preferences" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    return json(response, 200, { preferences: userPreferences(user.id) });
  }
  if (requestUrl.pathname === "/api/auth/preferences" && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    readJson(request).then((body) => {
      const existing = database.prepare(`
        SELECT theme, default_quality AS defaultQuality, default_audio AS defaultAudio,
          button_color AS buttonColor, input_background_color AS inputBackgroundColor,
          background_color AS backgroundColor, push_to_talk_key AS pushToTalkKey,
          mute_shortcut AS muteShortcut, live_notification_scope AS liveNotificationScope,
          voice_microphone_volume AS voiceMicrophoneVolume, voice_output_volume AS voiceOutputVolume,
          preferred_input_device_id AS preferredInputDeviceId, preferred_output_device_id AS preferredOutputDeviceId
        FROM user_preferences WHERE user_id = ?
      `).get(user.id);
      const theme = Object.prototype.hasOwnProperty.call(body, "theme")
        ? (["dark", "light"].includes(body.theme) ? body.theme : "dark")
        : (existing?.theme || "dark");
      const defaultQuality = Object.prototype.hasOwnProperty.call(body, "defaultQuality")
        ? (["economy", "balanced", "high"].includes(body.defaultQuality) ? body.defaultQuality : "balanced")
        : (existing?.defaultQuality || "balanced");
      const defaultAudio = Object.prototype.hasOwnProperty.call(body, "defaultAudio")
        ? (["source", "system"].includes(body.defaultAudio) ? body.defaultAudio : "source")
        : (existing?.defaultAudio || "source");
      const buttonColor = Object.prototype.hasOwnProperty.call(body, "buttonColor") ? safePreferenceColor(body.buttonColor) : (existing?.buttonColor || null);
      const inputBackgroundColor = Object.prototype.hasOwnProperty.call(body, "inputBackgroundColor") ? safePreferenceColor(body.inputBackgroundColor) : (existing?.inputBackgroundColor || null);
      const backgroundColor = Object.prototype.hasOwnProperty.call(body, "backgroundColor") ? safePreferenceColor(body.backgroundColor) : (existing?.backgroundColor || null);
      const pushToTalkKey = Object.prototype.hasOwnProperty.call(body, "pushToTalkKey")
        ? String(body.pushToTalkKey || "").trim().slice(0, 40) || null
        : existing?.pushToTalkKey || null;
      const muteShortcut = Object.prototype.hasOwnProperty.call(body, "muteShortcut")
        ? String(body.muteShortcut || "").trim().slice(0, 40) || null
        : existing?.muteShortcut || null;
      const liveNotificationScope = ["related", "all"].includes(body.liveNotificationScope)
        ? body.liveNotificationScope
        : (existing?.liveNotificationScope || "related");
      const voiceMicrophoneVolume = Object.prototype.hasOwnProperty.call(body, "voiceMicrophoneVolume")
        ? normalizePreferenceVolume(body.voiceMicrophoneVolume)
        : normalizePreferenceVolume(existing?.voiceMicrophoneVolume);
      const voiceOutputVolume = Object.prototype.hasOwnProperty.call(body, "voiceOutputVolume")
        ? normalizePreferenceVolume(body.voiceOutputVolume)
        : normalizePreferenceVolume(existing?.voiceOutputVolume);
      const preferredInputDeviceId = Object.prototype.hasOwnProperty.call(body, "preferredInputDeviceId")
        ? normalizePreferenceDeviceId(body.preferredInputDeviceId)
        : normalizePreferenceDeviceId(existing?.preferredInputDeviceId);
      const preferredOutputDeviceId = Object.prototype.hasOwnProperty.call(body, "preferredOutputDeviceId")
        ? normalizePreferenceDeviceId(body.preferredOutputDeviceId)
        : normalizePreferenceDeviceId(existing?.preferredOutputDeviceId);
      database.prepare(`
        INSERT INTO user_preferences (user_id, theme, default_quality, default_audio, button_color, input_background_color, background_color, push_to_talk_key, mute_shortcut, live_notification_scope, voice_microphone_volume, voice_output_volume, preferred_input_device_id, preferred_output_device_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, default_quality = excluded.default_quality, default_audio = excluded.default_audio, button_color = excluded.button_color, input_background_color = excluded.input_background_color, background_color = excluded.background_color, push_to_talk_key = excluded.push_to_talk_key, mute_shortcut = excluded.mute_shortcut, live_notification_scope = excluded.live_notification_scope, voice_microphone_volume = excluded.voice_microphone_volume, voice_output_volume = excluded.voice_output_volume, preferred_input_device_id = excluded.preferred_input_device_id, preferred_output_device_id = excluded.preferred_output_device_id, updated_at = excluded.updated_at
      `).run(user.id, theme, defaultQuality, defaultAudio, buttonColor, inputBackgroundColor, backgroundColor, pushToTalkKey, muteShortcut, liveNotificationScope, voiceMicrophoneVolume, voiceOutputVolume, preferredInputDeviceId, preferredOutputDeviceId, new Date().toISOString());
      return json(response, 200, { preferences: userPreferences(user.id) });
    }).catch(() => json(response, 400, { error: "Não foi possível salvar suas preferências." }));
    return;
  }
  if (requestUrl.pathname === "/api/auth/voice-preferences" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const preferences = database.prepare(`
      SELECT target_user_id AS targetUserId, volume, locally_muted AS locallyMuted, updated_at AS updatedAt
      FROM user_voice_preferences
      WHERE user_id = ?
      ORDER BY updated_at
    `).all(user.id).map((item) => ({ ...item, locallyMuted: Boolean(item.locallyMuted) }));
    return json(response, 200, { preferences });
  }
  if (requestUrl.pathname === "/api/auth/voice-preferences" && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    readJson(request).then((body) => {
      const targetUserId = String(body.targetUserId || "").trim().slice(0, 128);
      if (!targetUserId || targetUserId === user.id) return json(response, 400, { error: "Informe um usuário de voz válido." });
      if (!database.prepare("SELECT id FROM users WHERE id = ?").get(targetUserId)) return json(response, 404, { error: "Usuário de voz não encontrado." });
      const current = database.prepare("SELECT volume, locally_muted AS locallyMuted FROM user_voice_preferences WHERE user_id = ? AND target_user_id = ?").get(user.id, targetUserId);
      const volume = Object.prototype.hasOwnProperty.call(body, "volume")
        ? normalizePreferenceVolume(body.volume)
        : normalizePreferenceVolume(current?.volume);
      const locallyMuted = Object.prototype.hasOwnProperty.call(body, "locallyMuted")
        ? Boolean(body.locallyMuted)
        : Boolean(current?.locallyMuted);
      const updatedAt = new Date().toISOString();
      database.prepare(`
        INSERT INTO user_voice_preferences (user_id, target_user_id, volume, locally_muted, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, target_user_id) DO UPDATE SET volume = excluded.volume, locally_muted = excluded.locally_muted, updated_at = excluded.updated_at
      `).run(user.id, targetUserId, volume, locallyMuted ? 1 : 0, updatedAt);
      return json(response, 200, { preference: { targetUserId, volume, locallyMuted, updatedAt } });
    }).catch(() => json(response, 400, { error: "Não foi possível salvar a preferência de áudio do usuário." }));
    return;
  }
  if (requestUrl.pathname === "/api/auth/voice-preferences" && request.method === "DELETE") {
    const user = requireUser(request, response);
    if (!user) return;
    database.prepare("DELETE FROM user_voice_preferences WHERE user_id = ?").run(user.id);
    return json(response, 200, { preferences: [] });
  }
  if (requestUrl.pathname === "/api/users/search" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const query = String(requestUrl.searchParams.get("q") || "").trim().replace(/^@/, "").slice(0, 48);
    if (query.length < 2) return json(response, 200, { users: [] });
    const like = `%${query}%`;
    const users = database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData,
        CASE WHEN EXISTS(SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = users.id)
          OR EXISTS(SELECT 1 FROM friendships WHERE user_id = users.id AND friend_id = ?) THEN 'accepted'
          WHEN EXISTS(SELECT 1 FROM friend_requests WHERE sender_id = ? AND recipient_id = users.id AND status = 'pending') THEN 'pending_sent'
          WHEN EXISTS(SELECT 1 FROM friend_requests WHERE sender_id = users.id AND recipient_id = ? AND status = 'pending') THEN 'pending_received'
          ELSE 'none' END AS friendshipStatus,
        (SELECT id FROM friend_requests WHERE sender_id = ? AND recipient_id = users.id AND status = 'pending' LIMIT 1) AS friendRequestId,
        EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = users.id) AS following
      FROM users
      WHERE users.id <> ? AND (users.username LIKE ? COLLATE NOCASE OR users.display_name LIKE ? COLLATE NOCASE)
      ORDER BY CASE WHEN users.username = ? COLLATE NOCASE THEN 0 ELSE 1 END, users.display_name COLLATE NOCASE
      LIMIT 20
    `).all(user.id, user.id, user.id, user.id, user.id, user.id, user.id, like, like, query).map((item) => ({
      ...item,
      avatarData: compactAvatarData(item.avatarData),
      following: Boolean(item.following),
    }));
    return json(response, 200, { users });
  }
  if (requestUrl.pathname === "/api/social" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const friends = database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData,
        friendships.created_at AS createdAt
      FROM friendships JOIN users ON users.id = friendships.friend_id
      WHERE friendships.user_id = ?
      UNION ALL
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData,
        friendships.created_at AS createdAt
      FROM friendships JOIN users ON users.id = friendships.user_id
      WHERE friendships.friend_id = ?
      ORDER BY displayName COLLATE NOCASE
    `).all(user.id, user.id).map((item) => ({ ...item, avatarData: compactAvatarData(item.avatarData) }));
    const incomingRequests = database.prepare(`
      SELECT friend_requests.id, friend_requests.created_at AS createdAt,
        users.id AS userId, users.username, users.display_name AS displayName, users.avatar_data AS avatarData
      FROM friend_requests JOIN users ON users.id = friend_requests.sender_id
      WHERE friend_requests.recipient_id = ? AND friend_requests.status = 'pending'
      ORDER BY friend_requests.created_at DESC
    `).all(user.id).map((item) => ({ ...item, avatarData: compactAvatarData(item.avatarData) }));
    const outgoingRequests = database.prepare(`
      SELECT friend_requests.id, friend_requests.created_at AS createdAt,
        users.id AS userId, users.username, users.display_name AS displayName, users.avatar_data AS avatarData
      FROM friend_requests JOIN users ON users.id = friend_requests.recipient_id
      WHERE friend_requests.sender_id = ? AND friend_requests.status = 'pending'
      ORDER BY friend_requests.created_at DESC
    `).all(user.id).map((item) => ({ ...item, avatarData: compactAvatarData(item.avatarData) }));
    const following = database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData,
        follows.created_at AS createdAt,
        COALESCE(channel_profiles.display_name, users.display_name) AS channelName,
        COALESCE(channel_profiles.avatar_data, users.avatar_data) AS channelAvatarData
      FROM follows JOIN users ON users.id = follows.followed_id
      LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id
      WHERE follows.follower_id = ?
      ORDER BY channelName COLLATE NOCASE
    `).all(user.id).map((item) => ({
      ...item,
      avatarData: compactAvatarData(item.avatarData),
      channelAvatarData: compactAvatarData(item.channelAvatarData),
    }));
    return json(response, 200, {
      friends,
      incomingRequests,
      outgoingRequests,
      following,
      counts: { friends: friends.length, incomingRequests: incomingRequests.length, following: following.length },
    });
  }
  const friendRequestActionMatch = requestUrl.pathname.match(/^\/api\/friends\/requests\/([\w-]{16,64})\/(accept|decline)$/);
  if (friendRequestActionMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const requestId = friendRequestActionMatch[1];
    const action = friendRequestActionMatch[2];
    const friendRequest = database.prepare(`
      SELECT friend_requests.id, friend_requests.sender_id AS senderId, friend_requests.recipient_id AS recipientId,
        users.display_name AS senderName
      FROM friend_requests JOIN users ON users.id = friend_requests.sender_id
      WHERE friend_requests.id = ? AND friend_requests.recipient_id = ? AND friend_requests.status = 'pending'
    `).get(requestId, user.id);
    if (!friendRequest) return json(response, 404, { error: "Solicitação de amizade não encontrada." });
    const now = new Date().toISOString();
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
        .run(action === "accept" ? "accepted" : "declined", now, requestId);
      if (action === "accept") {
        database.prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?), (?, ?, ?)")
          .run(user.id, friendRequest.senderId, now, friendRequest.senderId, user.id, now);
      }
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      return json(response, 400, { error: "Não foi possível atualizar a solicitação de amizade." });
    }
    if (action === "accept") {
      createNotification({
        userId: friendRequest.senderId,
        type: "friend_accepted",
        entityId: requestId,
        title: `${user.displayName} aceitou sua amizade`,
        body: "Agora vocês podem conversar pelo Telai.",
        createdAt: now,
      });
    }
    return json(response, 200, { ok: true, status: action === "accept" ? "accepted" : "declined" });
  }
  const friendRequestCancelMatch = requestUrl.pathname.match(/^\/api\/friends\/requests\/([\w-]{16,64})$/);
  if (friendRequestCancelMatch && request.method === "DELETE") {
    const user = requireUser(request, response);
    if (!user) return;
    const result = database.prepare("UPDATE friend_requests SET status = 'canceled', updated_at = ? WHERE id = ? AND sender_id = ? AND status = 'pending'")
      .run(new Date().toISOString(), friendRequestCancelMatch[1], user.id);
    if (!result.changes) return json(response, 404, { error: "Solicitação de amizade não encontrada." });
    return json(response, 200, { ok: true });
  }
  const friendTargetMatch = requestUrl.pathname.match(/^\/api\/friends\/([\w-]{16,64})$/);
  if (friendTargetMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const targetUserId = friendTargetMatch[1];
    if (targetUserId === user.id) return json(response, 400, { error: "Você não pode adicionar a si mesmo." });
    const target = database.prepare("SELECT id, display_name AS displayName FROM users WHERE id = ?").get(targetUserId);
    if (!target) return json(response, 404, { error: "Usuário não encontrado." });
    const alreadyFriends = database.prepare("SELECT 1 FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1")
      .get(user.id, targetUserId, targetUserId, user.id);
    if (alreadyFriends) return json(response, 409, { error: "Vocês já são amigos." });
    const pendingIncoming = database.prepare("SELECT id FROM friend_requests WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'")
      .get(targetUserId, user.id);
    if (pendingIncoming) return json(response, 409, { error: "Essa pessoa já enviou uma solicitação. Aceite-a na área de amigos." });
    const pendingOutgoing = database.prepare("SELECT id FROM friend_requests WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'")
      .get(user.id, targetUserId);
    if (pendingOutgoing) return json(response, 200, { ok: true, requestId: pendingOutgoing.id, status: "pending" });
    const requestId = randomUUID();
    const now = new Date().toISOString();
    database.prepare("INSERT INTO friend_requests (id, sender_id, recipient_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)")
      .run(requestId, user.id, targetUserId, now, now);
    createNotification({ userId: targetUserId, type: "friend_request", entityId: requestId, title: `${user.displayName} quer ser seu amigo`, body: "Abra Amigos para aceitar ou recusar a solicitação.", createdAt: now });
    return json(response, 201, { ok: true, requestId, status: "pending" });
  }
  if (friendTargetMatch && request.method === "DELETE") {
    const user = requireUser(request, response);
    if (!user) return;
    const targetUserId = friendTargetMatch[1];
    const result = database.prepare("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")
      .run(user.id, targetUserId, targetUserId, user.id);
    if (!result.changes) return json(response, 404, { error: "Amizade não encontrada." });
    return json(response, 200, { ok: true });
  }
  const userFollowMatch = requestUrl.pathname.match(/^\/api\/users\/([\w-]{16,64})\/follow$/);
  if (userFollowMatch && ["POST", "DELETE"].includes(request.method)) {
    const user = requireUser(request, response);
    if (!user) return;
    const targetUserId = userFollowMatch[1];
    if (targetUserId === user.id) return json(response, 400, { error: "Você não pode seguir o próprio canal." });
    const target = database.prepare("SELECT id FROM users WHERE id = ?").get(targetUserId);
    if (!target) return json(response, 404, { error: "Canal não encontrado." });
    if (request.method === "POST") {
      database.prepare("INSERT OR IGNORE INTO follows (follower_id, followed_id, created_at) VALUES (?, ?, ?)").run(user.id, targetUserId, new Date().toISOString());
      return json(response, 200, { ok: true, following: true });
    }
    database.prepare("DELETE FROM follows WHERE follower_id = ? AND followed_id = ?").run(user.id, targetUserId);
    return json(response, 200, { ok: true, following: false });
  }
  if (requestUrl.pathname === "/api/groups" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const groups = database.prepare(`
      SELECT groups.id, groups.name, groups.slug, group_members.role,
        (SELECT COUNT(*) FROM group_members members WHERE members.group_id = groups.id) AS memberCount
      FROM group_members JOIN groups ON groups.id = group_members.group_id
      WHERE group_members.user_id = ? ORDER BY groups.name COLLATE NOCASE
    `).all(user.id);
    return json(response, 200, { groups });
  }
  if (requestUrl.pathname === "/api/groups/search" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const query = String(requestUrl.searchParams.get("q") || "").trim().slice(0, 64);
    if (query.length < 2) return json(response, 200, { groups: [] });
    const like = `%${query}%`;
    const groups = database.prepare(`
      SELECT groups.id, groups.name, groups.slug, groups.owner_id AS ownerId,
        COALESCE(users.display_name, users.username) AS ownerName,
        (SELECT COUNT(*) FROM group_members members WHERE members.group_id = groups.id) AS memberCount,
        CASE WHEN joined.user_id IS NOT NULL THEN 'member'
          WHEN requests.status IS NOT NULL THEN requests.status ELSE 'none' END AS requestStatus
      FROM groups
      JOIN users ON users.id = groups.owner_id
      LEFT JOIN group_members joined ON joined.group_id = groups.id AND joined.user_id = ?
      LEFT JOIN group_join_requests requests ON requests.group_id = groups.id AND requests.user_id = ?
      WHERE (groups.name LIKE ? COLLATE NOCASE OR groups.slug LIKE ? COLLATE NOCASE)
        AND joined.user_id IS NULL
      ORDER BY CASE WHEN groups.name = ? COLLATE NOCASE THEN 0 ELSE 1 END, groups.name COLLATE NOCASE
      LIMIT 30
    `).all(user.id, user.id, like, like, query);
    return json(response, 200, { groups });
  }
  if (requestUrl.pathname === "/api/groups" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    readJson(request).then((body) => {
      const name = String(body.name || "").trim().slice(0, 64);
      const slug = slugFor(body.slug || name);
      if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para o grupo." });
      const group = { id: randomUUID(), name, slug, role: "owner" };
      try {
        database.exec("BEGIN");
        database.prepare("INSERT INTO groups (id, name, slug, owner_id, created_at) VALUES (?, ?, ?, ?, ?)").run(group.id, name, slug, user.id, new Date().toISOString());
        database.prepare("INSERT INTO group_members (group_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(group.id, user.id, new Date().toISOString());
        ensureDefaultGroupRooms(group.id, user.id);
        ensureDefaultGroupRoles(group.id, user.id);
        database.exec("COMMIT");
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch {}
        if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Já existe um grupo com esse nome." });
        throw error;
      }
      return json(response, 201, { group });
    }).catch(() => json(response, 400, { error: "Não foi possível criar o grupo." }));
    return;
  }

  const groupMembershipMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/membership$/);
  if (groupMembershipMatch && request.method === "DELETE") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupMembershipMatch[1];
    const group = database.prepare("SELECT id, name, owner_id AS ownerId FROM groups WHERE id = ?").get(groupId);
    if (!group) return json(response, 404, { error: "Grupo não encontrado." });
    const membership = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (!membership) return json(response, 404, { error: "Você não participa deste grupo." });
    if (membership.role === "owner" || group.ownerId === user.id) {
      return json(response, 400, { error: "O dono não pode sair do próprio grupo. Transfira a propriedade ou exclua o grupo." });
    }
    database.exec("BEGIN");
    try {
      database.prepare("DELETE FROM group_member_permissions WHERE group_id = ? AND user_id = ?").run(groupId, user.id);
      database.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, user.id);
      database.exec("COMMIT");
      return json(response, 200, { ok: true, group: { id: group.id, name: group.name } });
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      return json(response, 400, { error: "Não foi possível sair deste grupo agora." });
    }
  }
  const groupDeleteMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})$/);
  if (groupDeleteMatch && request.method === "DELETE") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupDeleteMatch[1];
    const group = database.prepare("SELECT id, name, owner_id AS ownerId FROM groups WHERE id = ?").get(groupId);
    if (!group) return json(response, 404, { error: "Grupo não encontrado." });
    if (group.ownerId !== user.id) return json(response, 403, { error: "Somente o dono pode excluir este grupo." });
    for (const [voiceRoomId, voiceRoom] of voiceRooms) {
      if (voiceRoom.groupId !== groupId) continue;
      for (const participant of [...voiceRoom.participants.values()]) {
        send(participant, { type: "voice-disconnected", message: "O grupo foi excluído pelo proprietário." });
        leaveVoiceRoom(participant);
      }
      voiceRooms.delete(voiceRoomId);
    }
    database.prepare("DELETE FROM groups WHERE id = ?").run(groupId);
    return json(response, 200, { ok: true, group: { id: group.id, name: group.name } });
  }
  const groupJoinRequestMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/join-requests$/);
  if (groupJoinRequestMatch && ["POST", "GET"].includes(request.method)) {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupJoinRequestMatch[1];
    const group = database.prepare("SELECT id, name, owner_id AS ownerId FROM groups WHERE id = ?").get(groupId);
    if (!group) return json(response, 404, { error: "Grupo não encontrado." });
    if (request.method === "GET") {
      if (group.ownerId !== user.id) return json(response, 403, { error: "Somente o administrador pode ver as solicitações." });
      const requests = database.prepare(`
        SELECT group_join_requests.id, group_join_requests.status, group_join_requests.created_at AS createdAt,
          group_join_requests.updated_at AS updatedAt, users.id AS userId, users.display_name AS displayName,
          users.username, users.avatar_data AS avatarData
        FROM group_join_requests JOIN users ON users.id = group_join_requests.user_id
        WHERE group_join_requests.group_id = ? AND group_join_requests.status = 'pending'
        ORDER BY group_join_requests.created_at ASC
      `).all(groupId).map((item) => ({ ...item, avatarData: compactAvatarData(item.avatarData) }));
      return json(response, 200, { requests });
    }
    if (isGroupMember(user.id, groupId)) return json(response, 409, { error: "Você já participa deste grupo." });
    const now = new Date().toISOString();
    const existing = database.prepare("SELECT id, status FROM group_join_requests WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (existing?.status === "pending") return json(response, 409, { error: "Sua solicitação já está pendente." });
    if (existing) {
      database.prepare("UPDATE group_join_requests SET status = 'pending', updated_at = ?, decided_at = NULL, decided_by = NULL WHERE id = ?").run(now, existing.id);
      createNotification({ userId: group.ownerId, type: "group_join_request", entityId: existing.id, groupId, title: `Solicitação para ${group.name}`, body: `${user.displayName} pediu para entrar no grupo.`, createdAt: now });
      return json(response, 200, { request: { id: existing.id, groupId, status: "pending", createdAt: now, updatedAt: now } });
    }
    const joinRequest = { id: randomUUID(), groupId, userId: user.id, status: "pending", createdAt: now, updatedAt: now };
    database.prepare("INSERT INTO group_join_requests (id, group_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)")
      .run(joinRequest.id, joinRequest.groupId, joinRequest.userId, joinRequest.createdAt, joinRequest.updatedAt);
    createNotification({ userId: group.ownerId, type: "group_join_request", entityId: joinRequest.id, groupId, title: `Solicitação para ${group.name}`, body: `${user.displayName} pediu para entrar no grupo.`, createdAt: now });
    return json(response, 201, { request: joinRequest });
  }
  const groupJoinRequestActionMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/join-requests\/([\w-]{16,64})$/);
  if (groupJoinRequestActionMatch && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    const [, groupId, requestId] = groupJoinRequestActionMatch;
    const group = database.prepare("SELECT id, owner_id AS ownerId FROM groups WHERE id = ?").get(groupId);
    if (!group) return json(response, 404, { error: "Grupo não encontrado." });
    if (group.ownerId !== user.id) return json(response, 403, { error: "Somente o administrador pode responder solicitações." });
    readJson(request).then((body) => {
      const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : "";
      if (!status) return json(response, 400, { error: "Escolha aprovar ou recusar a solicitação." });
      const joinRequest = database.prepare("SELECT id, group_id AS groupId, user_id AS userId, status FROM group_join_requests WHERE id = ? AND group_id = ?").get(requestId, groupId);
      if (!joinRequest) return json(response, 404, { error: "Solicitação não encontrada." });
      if (joinRequest.status !== "pending") return json(response, 409, { error: "Essa solicitação já foi respondida." });
      const now = new Date().toISOString();
      try {
        database.exec("BEGIN");
        if (status === "approved") {
          const roleId = ensureDefaultGroupRoles(groupId, group.ownerId);
          database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, role_id, created_at) VALUES (?, ?, 'member', ?, ?)")
            .run(groupId, joinRequest.userId, roleId, now);
          ensureGroupPermissionRow(groupId, joinRequest.userId);
        }
        database.prepare("UPDATE group_join_requests SET status = ?, updated_at = ?, decided_at = ?, decided_by = ? WHERE id = ?")
          .run(status, now, now, user.id, requestId);
        const groupName = database.prepare("SELECT name FROM groups WHERE id = ?").get(groupId)?.name || "o grupo";
        createNotification({ userId: joinRequest.userId, type: "group_join_decision", entityId: requestId, groupId, title: status === "approved" ? `Entrada aprovada em ${groupName}` : `Solicitação recusada em ${groupName}`, body: status === "approved" ? "Agora você já pode acessar este grupo." : "O administrador recusou sua solicitação de entrada.", createdAt: now });
        database.exec("COMMIT");
        return json(response, 200, { request: { ...joinRequest, status, updatedAt: now, decidedAt: now, decidedBy: user.id } });
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch {}
        return json(response, 400, { error: status === "approved" ? "Não foi possível aprovar a entrada." : "Não foi possível recusar a solicitação." });
      }
    }).catch(() => json(response, 400, { error: "Não foi possível responder a solicitação." }));
    return;
  }
  const groupSettingsMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})$/);
  if (groupSettingsMatch && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupSettingsMatch[1];
    const owner = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (owner?.role !== "owner") return json(response, 403, { error: "Somente o dono pode alterar as configurações do grupo." });
    readJson(request).then((body) => {
      const name = String(body.name || "").trim().slice(0, 64);
      const slug = slugFor(body.slug || name);
      if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para o grupo." });
      const duplicate = database.prepare("SELECT id FROM groups WHERE slug = ? AND id <> ?").get(slug, groupId);
      if (duplicate) return json(response, 409, { error: "Já existe um grupo com esse nome." });
      database.prepare("UPDATE groups SET name = ?, slug = ? WHERE id = ?").run(name, slug, groupId);
      return json(response, 200, { group: database.prepare("SELECT id, name, slug FROM groups WHERE id = ?").get(groupId) });
    }).catch(() => json(response, 400, { error: "Não foi possível salvar as configurações do grupo." }));
    return;
  }
  const groupAdminMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/admin$/);
  if (groupAdminMatch && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupAdminMatch[1];
    if (!isGroupMember(user.id, groupId)) return json(response, 403, { error: "Você não participa deste grupo." });
    const group = database.prepare("SELECT id, name, slug, owner_id AS ownerId FROM groups WHERE id = ?").get(groupId);
    if (!group) return json(response, 404, { error: "Grupo não encontrado." });
    ensureDefaultGroupRoles(groupId, group.ownerId);
    const roles = database.prepare(`
      SELECT id, name, color, can_chat AS canChat, can_stream AS canStream,
        can_invite AS canInvite, can_view_voice_members AS canViewVoiceMembers,
        can_move_members AS canMoveMembers, is_default AS isDefault, sort_order AS sortOrder
      FROM group_roles WHERE group_id = ? ORDER BY sort_order ASC, name COLLATE NOCASE
    `).all(groupId).map((role) => ({
      ...role,
      sortOrder: Number(role.sortOrder),
      canChat: Boolean(role.canChat),
      canStream: Boolean(role.canStream),
      canInvite: Boolean(role.canInvite),
      canViewVoiceMembers: Boolean(role.canViewVoiceMembers),
      canMoveMembers: Boolean(role.canMoveMembers),
      isDefault: Boolean(role.isDefault),
    }));
    const invites = database.prepare(`
      SELECT group_invites.token_hash AS tokenHash, group_invites.created_at AS createdAt, group_invites.expires_at AS expiresAt,
        group_invites.max_uses AS maxUses, group_invites.uses,
        users.display_name AS createdBy
      FROM group_invites JOIN users ON users.id = group_invites.created_by
      WHERE group_invites.group_id = ? ORDER BY group_invites.created_at DESC LIMIT 20
    `).all(groupId);
    const joinRequests = group.ownerId === user.id ? database.prepare(`
      SELECT group_join_requests.id, group_join_requests.status, group_join_requests.created_at AS createdAt,
        group_join_requests.updated_at AS updatedAt, users.id AS userId, users.display_name AS displayName,
        users.username, users.avatar_data AS avatarData
      FROM group_join_requests JOIN users ON users.id = group_join_requests.user_id
      WHERE group_join_requests.group_id = ? AND group_join_requests.status = 'pending'
      ORDER BY group_join_requests.created_at ASC
    `).all(groupId).map(compactUserSummary) : [];
    return json(response, 200, { group, roles, invites, joinRequests });
  }
  const groupRoleCreateMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/roles$/);
  if (groupRoleCreateMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupRoleCreateMatch[1];
    const owner = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (owner?.role !== "owner") return json(response, 403, { error: "Somente o dono pode criar cargos." });
    readJson(request).then((body) => {
      const name = String(body.name || "").trim().slice(0, 32);
      const color = /^#[0-9a-f]{6}$/i.test(String(body.color || "")) ? String(body.color).toLowerCase() : "#5865f2";
      if (name.length < 2) return json(response, 400, { error: "Informe um nome válido para o cargo." });
      const canChat = body.canChat !== false;
      const canStream = body.canStream !== false;
      const canInvite = body.canInvite !== false;
      const canViewVoiceMembers = body.canViewVoiceMembers !== false;
      const canMoveMembers = body.canMoveMembers === true;
      const nextSortOrder = Number(database.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS sortOrder FROM group_roles WHERE group_id = ?").get(groupId)?.sortOrder || 0);
      const role = { id: randomUUID(), groupId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers, isDefault: false, sortOrder: nextSortOrder };
      try {
        database.prepare(`
          INSERT INTO group_roles (id, group_id, name, color, can_chat, can_stream, can_invite,
            can_view_voice_members, can_move_members, is_default, sort_order, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `).run(role.id, groupId, name, color, canChat ? 1 : 0, canStream ? 1 : 0, canInvite ? 1 : 0, canViewVoiceMembers ? 1 : 0, canMoveMembers ? 1 : 0, nextSortOrder, user.id, new Date().toISOString());
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Já existe um cargo com esse nome." });
        throw error;
      }
      return json(response, 201, { role });
    }).catch(() => json(response, 400, { error: "Não foi possível criar o cargo." }));
    return;
  }
  const groupRoleOrderMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/roles\/order$/);
  if (groupRoleOrderMatch && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupRoleOrderMatch[1];
    const owner = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (owner?.role !== "owner") return json(response, 403, { error: "Somente o dono pode ordenar cargos." });
    readJson(request).then((body) => {
      const roleIds = Array.isArray(body.roleIds) ? body.roleIds.map((roleId) => String(roleId || "").trim()) : null;
      const roles = database.prepare("SELECT id FROM group_roles WHERE group_id = ?").all(groupId);
      const knownRoleIds = new Set(roles.map((role) => role.id));
      if (!roleIds || roleIds.length !== roles.length || roleIds.some((roleId) => !roleId || !knownRoleIds.has(roleId)) || new Set(roleIds).size !== roleIds.length) {
        return json(response, 400, { error: "A ordem precisa conter todos os cargos do grupo uma única vez." });
      }
      try {
        database.exec("BEGIN");
        const update = database.prepare("UPDATE group_roles SET sort_order = ? WHERE id = ? AND group_id = ?");
        roleIds.forEach((roleId, index) => update.run(index, roleId, groupId));
        database.exec("COMMIT");
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch {}
        throw error;
      }
      const orderedRoles = database.prepare(`
        SELECT id, name, color, can_chat AS canChat, can_stream AS canStream,
          can_invite AS canInvite, can_view_voice_members AS canViewVoiceMembers,
          can_move_members AS canMoveMembers, is_default AS isDefault, sort_order AS sortOrder
        FROM group_roles WHERE group_id = ? ORDER BY sort_order ASC, name COLLATE NOCASE
      `).all(groupId).map((role) => ({
        ...role,
        sortOrder: Number(role.sortOrder),
        canChat: Boolean(role.canChat),
        canStream: Boolean(role.canStream),
        canInvite: Boolean(role.canInvite),
        canViewVoiceMembers: Boolean(role.canViewVoiceMembers),
        canMoveMembers: Boolean(role.canMoveMembers),
        isDefault: Boolean(role.isDefault),
      }));
      return json(response, 200, { roles: orderedRoles });
    }).catch(() => json(response, 400, { error: "Não foi possível salvar a ordem dos cargos." }));
    return;
  }
  const groupRoleMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/roles\/([\w-]{1,64})$/);
  if (groupRoleMatch && ["PATCH", "DELETE"].includes(request.method)) {
    const user = requireUser(request, response);
    if (!user) return;
    const [, groupId, roleId] = groupRoleMatch;
    const owner = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (owner?.role !== "owner") return json(response, 403, { error: "Somente o dono pode administrar cargos." });
    const role = database.prepare(`
      SELECT id, name, color, can_chat AS canChat, can_stream AS canStream,
        can_invite AS canInvite, can_view_voice_members AS canViewVoiceMembers,
        can_move_members AS canMoveMembers, is_default AS isDefault, sort_order AS sortOrder
      FROM group_roles WHERE id = ? AND group_id = ?
    `).get(roleId, groupId);
    if (!role) return json(response, 404, { error: "Cargo não encontrado neste grupo." });
    if (request.method === "DELETE") {
      if (role.isDefault) return json(response, 400, { error: "O cargo padrão não pode ser removido." });
      const defaultRole = database.prepare("SELECT id FROM group_roles WHERE group_id = ? AND is_default = 1 LIMIT 1").get(groupId);
      if (!defaultRole) return json(response, 500, { error: "O grupo não possui um cargo padrão disponível." });
      database.prepare("UPDATE group_members SET role_id = ? WHERE group_id = ? AND role_id = ?").run(defaultRole.id, groupId, roleId);
      database.prepare("DELETE FROM group_roles WHERE id = ? AND group_id = ?").run(roleId, groupId);
      return json(response, 200, { ok: true, fallbackRoleId: defaultRole.id });
    }
    readJson(request).then((body) => {
      const name = String(body.name || role.name).trim().slice(0, 32);
      const color = /^#[0-9a-f]{6}$/i.test(String(body.color || role.color)) ? String(body.color || role.color).toLowerCase() : role.color;
      const canChat = body.canChat === undefined ? Boolean(role.canChat) : body.canChat === true;
      const canStream = body.canStream === undefined ? Boolean(role.canStream) : body.canStream === true;
      const canInvite = body.canInvite === undefined ? Boolean(role.canInvite) : body.canInvite === true;
      const canViewVoiceMembers = body.canViewVoiceMembers === undefined ? Boolean(role.canViewVoiceMembers) : body.canViewVoiceMembers === true;
      const canMoveMembers = body.canMoveMembers === undefined ? Boolean(role.canMoveMembers) : body.canMoveMembers === true;
      if (name.length < 2) return json(response, 400, { error: "Informe um nome válido para o cargo." });
      try {
        database.prepare(`
          UPDATE group_roles SET name = ?, color = ?, can_chat = ?, can_stream = ?, can_invite = ?,
            can_view_voice_members = ?, can_move_members = ? WHERE id = ? AND group_id = ?
        `).run(name, color, canChat ? 1 : 0, canStream ? 1 : 0, canInvite ? 1 : 0, canViewVoiceMembers ? 1 : 0, canMoveMembers ? 1 : 0, roleId, groupId);
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Já existe um cargo com esse nome." });
        throw error;
      }
      return json(response, 200, { role: { id: roleId, groupId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers, isDefault: Boolean(role.isDefault), sortOrder: Number(role.sortOrder) } });
    }).catch(() => json(response, 400, { error: "Não foi possível atualizar o cargo." }));
    return;
  }
  const groupMemberRoleMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/members\/([\w-]{1,64})\/role$/);
  if (groupMemberRoleMatch && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    const [, groupId, memberId] = groupMemberRoleMatch;
    const owner = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (owner?.role !== "owner") return json(response, 403, { error: "Somente o dono pode atribuir cargos." });
    const member = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, memberId);
    if (!member) return json(response, 404, { error: "Membro não encontrado neste grupo." });
    if (member.role === "owner") return json(response, 400, { error: "O dono mantém o cargo de dono." });
    readJson(request).then((body) => {
      const roleId = String(body.roleId || "").trim();
      if (roleId && !database.prepare("SELECT 1 FROM group_roles WHERE id = ? AND group_id = ?").get(roleId, groupId)) return json(response, 400, { error: "Esse cargo não pertence ao grupo." });
      database.prepare("UPDATE group_members SET role_id = ? WHERE group_id = ? AND user_id = ?").run(roleId || null, groupId, memberId);
      return json(response, 200, { roleId: roleId || null });
    }).catch(() => json(response, 400, { error: "Não foi possível atribuir o cargo." }));
    return;
  }
  const memberInviteCreateMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/member-invites$/);
  if (memberInviteCreateMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = memberInviteCreateMatch[1];
    if (!isGroupMember(user.id, groupId)) return json(response, 403, { error: "Você não participa deste grupo." });
    if (!canGroupAction(user.id, groupId, "canInvite")) return json(response, 403, { error: "Você não tem permissão para convidar pessoas neste grupo." });
    readJson(request).then((body) => {
      const group = database.prepare("SELECT id, name FROM groups WHERE id = ?").get(groupId);
      const invitedUserId = String(body.userId || "").trim();
      const target = database.prepare("SELECT id, username, display_name AS displayName, email, avatar_data AS avatarData FROM users WHERE id = ?").get(invitedUserId);
      if (!target || target.id === user.id) return json(response, 404, { error: "Usuário não encontrado." });
      if (isGroupMember(target.id, groupId)) return json(response, 409, { error: "Essa pessoa já está no grupo." });
      const now = new Date().toISOString();
      const pending = database.prepare(`SELECT id FROM group_user_invites WHERE group_id = ? AND invited_user_id = ? AND status = 'pending' AND expires_at > ? LIMIT 1`).get(groupId, target.id, now);
      if (pending) return json(response, 409, { error: "Já existe um convite pendente para essa pessoa." });
      const invite = { id: randomUUID(), groupId, invitedUserId: target.id, invitedBy: user.id, expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(), createdAt: now };
      database.prepare("INSERT INTO group_user_invites (id, group_id, invited_user_id, invited_by, status, expires_at, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)").run(invite.id, invite.groupId, invite.invitedUserId, invite.invitedBy, invite.expiresAt, invite.createdAt);
      createNotification({ userId: target.id, type: "group_invite", entityId: invite.id, groupId, title: `Convite para ${group?.name || "um grupo"}`, body: `${user.displayName} convidou você para entrar neste grupo.`, createdAt: now });
      if (target.email) {
        void sendGroupInviteEmail({ to: target.email, displayName: target.displayName, groupName: group?.name, baseUrl: publicOriginForRequest(request) })
          .catch((error) => warnLog("email_send_failed", { kind: "group_invite", groupId, targetUserId: target.id, errorCode: error?.code || "smtp-send-failed", error: error?.message || String(error) }));
      }
      return json(response, 201, { invite: { id: invite.id, user: compactUserSummary(target), expiresAt: invite.expiresAt } });
    }).catch(() => json(response, 400, { error: "Não foi possível enviar o convite." }));
    return;
  }
  const groupOverviewMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/overview$/);
  if (groupOverviewMatch && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupOverviewMatch[1];
    if (!isGroupMember(user.id, groupId)) return json(response, 403, { error: "Você não participa deste grupo." });
    touchGroupPresence(groupId, user.id);
    const group = database.prepare("SELECT id, name, slug FROM groups WHERE id = ?").get(groupId);
    if (!group) return json(response, 404, { error: "Grupo não encontrado." });
    const rooms = database.prepare(`
      SELECT id, name, slug, kind, created_at AS createdAt
      FROM group_rooms WHERE group_id = ? AND kind = 'text' ORDER BY CASE WHEN slug = 'geral' THEN 0 ELSE 1 END, name COLLATE NOCASE
    `).all(groupId);
    const voiceRoomsForGroup = database.prepare(`
      SELECT id, name, slug, 'voice' AS kind, COALESCE(max_participants, 8) AS maxParticipants, created_at AS createdAt
      FROM group_voice_rooms WHERE group_id = ? ORDER BY name COLLATE NOCASE
    `).all(groupId).map((room) => {
      const runtimeRoom = voiceRooms.get(room.id);
      const canView = groupPermissions(groupId, user.id)?.canViewVoiceMembers !== false;
      return { ...room, participants: canView ? [...(runtimeRoom?.participants?.values() || [])].map(voiceParticipantFor) : [] };
    });
    rooms.push(...voiceRoomsForGroup);
    rooms.sort((left, right) => {
      const order = { text: 0, live: 1, voice: 2 };
      return (order[left.kind] ?? 9) - (order[right.kind] ?? 9) || String(left.name).localeCompare(String(right.name), "pt-BR");
    });
    const members = database.prepare(`
      SELECT users.id, users.display_name AS displayName, users.username, group_members.role,
        group_members.role_id AS roleId, group_roles.name AS roleName, group_roles.color AS roleColor,
        group_roles.sort_order AS roleSortOrder,
        COALESCE(group_roles.can_chat, group_member_permissions.can_chat, 1) AS canChat,
        COALESCE(group_roles.can_stream, group_member_permissions.can_stream, 1) AS canStream,
        COALESCE(group_roles.can_invite, group_member_permissions.can_invite, 1) AS canInvite,
        COALESCE(group_roles.can_view_voice_members, group_member_permissions.can_view_voice_members, 1) AS canViewVoiceMembers,
        COALESCE(group_roles.can_move_members, 0) AS canMoveMembers,
        users.avatar_data AS avatarData
      FROM group_members JOIN users ON users.id = group_members.user_id
      LEFT JOIN group_roles ON group_roles.id = group_members.role_id AND group_roles.group_id = group_members.group_id
      LEFT JOIN group_member_permissions ON group_member_permissions.group_id = group_members.group_id AND group_member_permissions.user_id = group_members.user_id
      WHERE group_members.group_id = ? ORDER BY CASE WHEN group_members.role = 'owner' THEN 0 ELSE 1 END, COALESCE(group_roles.sort_order, 2147483647), users.display_name COLLATE NOCASE
    `).all(groupId).map((member) => ({ ...member, roleName: member.role === "owner" ? "Dono" : member.roleName || "Membro", roleColor: member.roleColor || "#5865f2", roleSortOrder: member.roleSortOrder === null || member.roleSortOrder === undefined ? null : Number(member.roleSortOrder), canMoveMembers: member.role === "owner" || Boolean(member.canMoveMembers), canChat: member.role === "owner" || Boolean(member.canChat), canStream: member.role === "owner" || Boolean(member.canStream), canInvite: member.role === "owner" || Boolean(member.canInvite), canViewVoiceMembers: member.role === "owner" || Boolean(member.canViewVoiceMembers), online: isPresent(groupId, member.id) }));
    const messages = database.prepare(`
      WITH ranked_messages AS (
        SELECT group_messages.id, group_messages.room_id AS roomId, group_messages.user_id AS userId, group_messages.body, group_messages.created_at AS createdAt,
          users.display_name AS displayName, users.username,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(group_messages.room_id, '__general__') ORDER BY group_messages.created_at DESC) AS messageRank
        FROM group_messages JOIN users ON users.id = group_messages.user_id
        WHERE group_messages.group_id = ?
      )
      SELECT id, roomId, userId, body, createdAt, displayName, username
      FROM ranked_messages
      WHERE messageRank <= 80
      ORDER BY createdAt ASC
    `).all(groupId);
    const streams = database.prepare(`
      SELECT streams.id, streams.room_name AS roomName, streams.room_id AS roomId, streams.voice_room_id AS voiceRoomId, streams.title, streams.visibility, streams.started_at AS startedAt,
        COALESCE(channel_profiles.display_name, users.display_name) AS channelName,
        COALESCE(channel_profiles.avatar_data, users.avatar_data) AS channelAvatarData,
        channel_profiles.games AS channelGames, users.username AS channelUsername, streams.created_by AS createdBy, groups.slug AS groupSlug
      FROM streams JOIN users ON users.id = streams.created_by LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id JOIN groups ON groups.id = streams.group_id
      WHERE streams.group_id = ? AND streams.ended_at IS NULL ORDER BY streams.started_at DESC
    `).all(groupId).filter(runtimeStreamIsLive);
    return json(response, 200, {
      group,
      rooms,
      members: members.map((member) => ({ ...member, avatarData: compactAvatarData(member.avatarData) })),
      messages,
      streams: streams.map((stream) => ({ ...stream, channelAvatarData: compactAvatarData(stream.channelAvatarData), channelGames: parseChannelGames(stream.channelGames), publicPath: streamPublicPath(stream) })),
    });
  }
  const groupRoomsMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/rooms$/);
  if (groupRoomsMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupRoomsMatch[1];
    if (!isGroupMember(user.id, groupId)) return json(response, 403, { error: "Você não participa deste grupo." });
    readJson(request).then((body) => {
      const name = String(body.name || "").trim().slice(0, 48);
      const slug = roomSlugFor(body.slug || name);
      const kind = body.kind === "voice" ? "voice" : body.kind === "text" ? "text" : null;
      if (!kind) return json(response, 400, { error: "Escolha uma sala de texto ou de voz." });
      if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para a sala." });
      const maxParticipants = kind === "voice" ? parseVoiceRoomParticipantLimit(body.maxParticipants) : null;
      const room = { id: randomUUID(), groupId, name, slug, kind, ...(kind === "voice" ? { maxParticipants } : {}), createdAt: new Date().toISOString() };
      if (kind === "voice" && !canGroupAction(user.id, groupId, "canChat")) return json(response, 403, { error: "Você não tem permissão para criar salas de voz." });
      try {
        const duplicate = database.prepare("SELECT 1 FROM group_rooms WHERE group_id = ? AND slug = ? UNION ALL SELECT 1 FROM group_voice_rooms WHERE group_id = ? AND slug = ? LIMIT 1").get(groupId, slug, groupId, slug);
        if (duplicate) return json(response, 409, { error: "Já existe uma sala com esse nome neste grupo." });
        if (kind === "voice") database.prepare("INSERT INTO group_voice_rooms (id, group_id, name, slug, max_participants, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(room.id, groupId, name, slug, maxParticipants, user.id, room.createdAt);
        else database.prepare("INSERT INTO group_rooms (id, group_id, name, slug, kind, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(room.id, groupId, name, slug, kind, user.id, room.createdAt);
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Já existe uma sala com esse nome neste grupo." });
        throw error;
      }
      return json(response, 201, { room });
    }).catch(() => json(response, 400, { error: "Não foi possível criar a sala." }));
    return;
  }
  const groupRoomActionMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/rooms\/([\w-]{1,64})$/);
  if (groupRoomActionMatch && ["PATCH", "DELETE"].includes(request.method)) {
    const user = requireUser(request, response);
    if (!user) return;
    const [, groupId, roomId] = groupRoomActionMatch;
    const member = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (member?.role !== "owner") return json(response, 403, { error: "Somente o dono pode gerenciar canais." });
    const textRoom = database.prepare("SELECT id, name, slug, kind FROM group_rooms WHERE id = ? AND group_id = ?").get(roomId, groupId);
    const voiceRoom = textRoom ? null : database.prepare("SELECT id, name, slug, 'voice' AS kind, COALESCE(max_participants, 8) AS maxParticipants FROM group_voice_rooms WHERE id = ? AND group_id = ?").get(roomId, groupId);
    const room = textRoom || voiceRoom;
    if (!room) return json(response, 404, { error: "Canal não encontrado." });
    if (room.slug === "geral") return json(response, 400, { error: "O canal Geral não pode ser alterado ou excluído." });
    if (request.method === "DELETE") {
      database.prepare(`DELETE FROM ${room.kind === "voice" ? "group_voice_rooms" : "group_rooms"} WHERE id = ? AND group_id = ?`).run(roomId, groupId);
      return json(response, 200, { ok: true });
    }
    readJson(request).then((body) => {
      const name = String(body.name || "").trim().slice(0, 48);
      const slug = roomSlugFor(name);
      if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para o canal." });
      const duplicate = database.prepare("SELECT 1 FROM group_rooms WHERE group_id = ? AND slug = ? AND id <> ? UNION ALL SELECT 1 FROM group_voice_rooms WHERE group_id = ? AND slug = ? AND id <> ? LIMIT 1").get(groupId, slug, roomId, groupId, slug, roomId);
      if (duplicate) return json(response, 409, { error: "Já existe um canal com esse nome neste grupo." });
      if (room.kind === "voice") {
        const maxParticipants = parseVoiceRoomParticipantLimit(body.maxParticipants, room.maxParticipants);
        database.prepare("UPDATE group_voice_rooms SET name = ?, slug = ?, max_participants = ? WHERE id = ? AND group_id = ?").run(name, slug, maxParticipants, roomId, groupId);
        return json(response, 200, { room: { ...room, name, slug, maxParticipants } });
      }
      database.prepare("UPDATE group_rooms SET name = ?, slug = ? WHERE id = ? AND group_id = ?").run(name, slug, roomId, groupId);
      return json(response, 200, { room: { ...room, name, slug } });
    }).catch(() => json(response, 400, { error: "Não foi possível atualizar o canal." }));
    return;
  }
  const groupPresenceMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/presence$/);
  if (groupPresenceMatch && ["GET", "POST"].includes(request.method)) {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupPresenceMatch[1];
    if (!isGroupMember(user.id, groupId)) return json(response, 403, { error: "Você não participa deste grupo." });
    touchGroupPresence(groupId, user.id);
    if (request.method === "POST") return json(response, 200, { ok: true });
    const members = database.prepare(`
      SELECT users.id
      FROM group_members JOIN users ON users.id = group_members.user_id
      WHERE group_members.group_id = ?
      ORDER BY users.id
    `).all(groupId).map(({ id }) => ({ id, online: isPresent(groupId, id) }));
    return json(response, 200, { groupId, members });
  }
  const groupMessageMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/messages$/);
  if (groupMessageMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupMessageMatch[1];
    if (!isGroupMember(user.id, groupId)) return json(response, 403, { error: "Você não participa deste grupo." });
    if (!canGroupAction(user.id, groupId, "canChat")) return json(response, 403, { error: "Você não tem permissão para enviar mensagens neste grupo." });
    readJson(request).then((body) => {
      const messageBody = String(body.body || "").trim().slice(0, 1000);
      if (!messageBody) return json(response, 400, { error: "Escreva uma mensagem antes de enviar." });
      const requestedRoomId = String(body.roomId || "");
      const room = requestedRoomId ? database.prepare("SELECT id, kind FROM group_rooms WHERE id = ? AND group_id = ?").get(requestedRoomId, groupId) : null;
      if (requestedRoomId && !room) return json(response, 400, { error: "Essa sala não existe neste grupo." });
      if (room?.kind === "live") return json(response, 400, { error: "Salas de transmissão não recebem mensagens de chat." });
      const message = { id: randomUUID(), roomId: room?.id || null, userId: user.id, body: messageBody, displayName: user.displayName, username: user.username, createdAt: new Date().toISOString() };
      database.prepare("INSERT INTO group_messages (id, group_id, room_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(message.id, groupId, message.roomId, user.id, message.body, message.createdAt);
      return json(response, 201, { message });
    }).catch(() => json(response, 400, { error: "Não foi possível enviar a mensagem." }));
    return;
  }
  const groupPermissionsMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/permissions$/);
  if (groupPermissionsMatch && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = groupPermissionsMatch[1];
    const owner = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (owner?.role !== "owner") return json(response, 403, { error: "Somente o dono pode alterar permissões." });
    readJson(request).then((body) => {
      const memberId = String(body.userId || "");
      const member = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, memberId);
      if (!member) return json(response, 404, { error: "Membro não encontrado neste grupo." });
      if (member.role === "owner") return json(response, 400, { error: "As permissões do dono são sempre completas." });
      const canChat = body.canChat === false ? 0 : 1;
      const canStream = body.canStream === false ? 0 : 1;
      const canInvite = body.canInvite === false ? 0 : 1;
      ensureGroupPermissionRow(groupId, memberId);
      const currentPermissions = database.prepare("SELECT can_view_voice_members AS canViewVoiceMembers FROM group_member_permissions WHERE group_id = ? AND user_id = ?").get(groupId, memberId);
      const canViewVoiceMembers = body.canViewVoiceMembers === undefined
        ? (currentPermissions?.canViewVoiceMembers ?? 1)
        : body.canViewVoiceMembers === false ? 0 : 1;
      database.prepare(`
        UPDATE group_member_permissions SET can_chat = ?, can_stream = ?, can_invite = ?, can_view_voice_members = ?, updated_at = ?
        WHERE group_id = ? AND user_id = ?
      `).run(canChat, canStream, canInvite, canViewVoiceMembers, new Date().toISOString(), groupId, memberId);
      return json(response, 200, { permissions: { userId: memberId, canChat: Boolean(canChat), canStream: Boolean(canStream), canInvite: Boolean(canInvite), canViewVoiceMembers: Boolean(canViewVoiceMembers) } });
    }).catch(() => json(response, 400, { error: "Não foi possível atualizar as permissões." }));
    return;
  }
  const inviteMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/invites$/);
  if (inviteMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const groupId = inviteMatch[1];
    const member = database.prepare("SELECT role FROM group_members WHERE group_id = ? AND user_id = ?").get(groupId, user.id);
    if (!member) return json(response, 403, { error: "Você não participa deste grupo." });
    if (!canGroupAction(user.id, groupId, "canInvite")) return json(response, 403, { error: "Você não tem permissão para criar convites neste grupo." });
    readJson(request).then((body) => {
      const rawToken = randomBytes(24).toString("base64url");
      const hours = Math.max(1, Math.min(Number(body.hours) || 72, 168));
      const maxUses = Math.max(1, Math.min(Number(body.maxUses) || 5, 50));
      database.prepare("INSERT INTO group_invites (token_hash, group_id, created_by, expires_at, max_uses, uses, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
        .run(hashSessionToken(rawToken), groupId, user.id, new Date(Date.now() + hours * 3600000).toISOString(), maxUses, new Date().toISOString());
      return json(response, 201, { token: rawToken, expiresInHours: hours, maxUses });
    }).catch(() => json(response, 400, { error: "Não foi possível criar o convite." }));
    return;
  }
  const inviteDeleteMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/invites\/([a-f0-9]{32,128})$/i);
  if (inviteDeleteMatch && request.method === "DELETE") {
    const user = requireUser(request, response);
    if (!user) return;
    const [, groupId, tokenHash] = inviteDeleteMatch;
    const group = database.prepare("SELECT owner_id AS ownerId FROM groups WHERE id = ?").get(groupId);
    if (!group) return json(response, 404, { error: "Grupo não encontrado." });
    if (group.ownerId !== user.id) return json(response, 403, { error: "Somente o dono pode revogar convites." });
    const deleted = database.prepare("DELETE FROM group_invites WHERE group_id = ? AND token_hash = ?").run(groupId, tokenHash);
    if (!deleted.changes) return json(response, 404, { error: "Convite não encontrado." });
    return json(response, 200, { ok: true });
  }
  if (requestUrl.pathname === "/api/member-invites/pending" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const now = new Date().toISOString();
    database.prepare("UPDATE group_user_invites SET status = 'expired' WHERE invited_user_id = ? AND status = 'pending' AND expires_at <= ?").run(user.id, now);
    const invites = database.prepare(`
      SELECT group_user_invites.id, group_user_invites.group_id AS groupId,
        group_user_invites.expires_at AS expiresAt, group_user_invites.created_at AS createdAt,
        groups.name AS groupName, groups.slug AS groupSlug,
        users.display_name AS invitedBy, users.username AS invitedByUsername
      FROM group_user_invites
      JOIN groups ON groups.id = group_user_invites.group_id
      JOIN users ON users.id = group_user_invites.invited_by
      WHERE group_user_invites.invited_user_id = ? AND group_user_invites.status = 'pending'
      ORDER BY group_user_invites.created_at DESC
    `).all(user.id);
    return json(response, 200, { invites });
  }
  if (requestUrl.pathname === "/api/direct/conversations" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const conversations = database.prepare(`
      SELECT conversations.id, conversations.created_at AS createdAt,
        conversations.updated_at AS updatedAt, other.id AS userId,
        other.username, other.display_name AS displayName, other.avatar_data AS avatarData,
        (SELECT body FROM direct_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS lastBody,
        (SELECT created_at FROM direct_messages WHERE conversation_id = conversations.id ORDER BY created_at DESC LIMIT 1) AS lastMessageAt,
        (SELECT COUNT(*) FROM direct_messages unread_messages
          WHERE unread_messages.conversation_id = conversations.id
            AND unread_messages.sender_id <> ? AND unread_messages.read_at IS NULL) AS unreadCount
      FROM direct_conversations conversations
      JOIN direct_conversation_members mine ON mine.conversation_id = conversations.id AND mine.user_id = ?
      JOIN direct_conversation_members other_member ON other_member.conversation_id = conversations.id AND other_member.user_id <> ?
      JOIN users other ON other.id = other_member.user_id
      ORDER BY conversations.updated_at DESC
    `).all(user.id, user.id, user.id).map((conversation) => ({
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      otherUser: compactUserSummary({ id: conversation.userId, username: conversation.username, displayName: conversation.displayName, avatarData: conversation.avatarData }),
      lastBody: conversation.lastBody || "",
      lastMessageAt: conversation.lastMessageAt || null,
      unreadCount: Number(conversation.unreadCount || 0),
    }));
    return json(response, 200, { conversations });
  }
  if (requestUrl.pathname === "/api/direct/conversations" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    readJson(request).then((body) => {
      const targetUserId = String(body.userId || "").trim();
      if (!targetUserId || targetUserId === user.id) return json(response, 400, { error: "Escolha outra pessoa para iniciar a conversa." });
      const target = database.prepare("SELECT id, username, display_name AS displayName, avatar_data AS avatarData FROM users WHERE id = ?").get(targetUserId);
      if (!target) return json(response, 404, { error: "Usuário não encontrado." });
      const existing = database.prepare(`
        SELECT conversations.id FROM direct_conversations conversations
        JOIN direct_conversation_members mine ON mine.conversation_id = conversations.id AND mine.user_id = ?
        JOIN direct_conversation_members other ON other.conversation_id = conversations.id AND other.user_id = ?
        WHERE (SELECT COUNT(*) FROM direct_conversation_members members WHERE members.conversation_id = conversations.id) = 2
        LIMIT 1
      `).get(user.id, targetUserId);
      let conversationId = existing?.id;
      if (!conversationId) {
        conversationId = randomUUID();
        const now = new Date().toISOString();
        try {
          database.exec("BEGIN");
          database.prepare("INSERT INTO direct_conversations (id, created_at, updated_at) VALUES (?, ?, ?)").run(conversationId, now, now);
          database.prepare("INSERT INTO direct_conversation_members (conversation_id, user_id, created_at) VALUES (?, ?, ?), (?, ?, ?)").run(conversationId, user.id, now, conversationId, targetUserId, now);
          database.exec("COMMIT");
        } catch (error) {
          try { database.exec("ROLLBACK"); } catch {}
          throw error;
        }
      }
      return json(response, 201, { conversation: directConversationPayload(conversationId, user.id) });
    }).catch((error) => {
      errorLog("direct_conversation_create_error", { error });
      return json(response, 400, { error: "Não foi possível iniciar a conversa." });
    });
    return;
  }
  const directConversationMatch = requestUrl.pathname.match(/^\/api\/direct\/conversations\/([\w-]{16,64})(?:\/(messages|read))?$/);
  if (directConversationMatch && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const conversationId = directConversationMatch[1];
    const conversation = directConversationPayload(conversationId, user.id);
    if (!conversation) return json(response, 404, { error: "Conversa não encontrada." });
    if (directConversationMatch[2] === "messages") {
      const includeConversationAvatar = requestUrl.searchParams.get("includeAvatar") === "1";
      const readAt = new Date().toISOString();
      database.prepare("UPDATE direct_messages SET read_at = COALESCE(read_at, ?) WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL").run(readAt, conversationId, user.id);
      database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND type = 'direct_message' AND entity_id IN (SELECT id FROM direct_messages WHERE conversation_id = ?)").run(readAt, user.id, conversationId);
      const messages = database.prepare(`
        SELECT direct_messages.id, direct_messages.conversation_id AS conversationId,
          direct_messages.sender_id AS senderId, direct_messages.body,
          direct_messages.created_at AS createdAt, direct_messages.read_at AS readAt,
          users.display_name AS displayName, users.username
        FROM direct_messages JOIN users ON users.id = direct_messages.sender_id
        WHERE direct_messages.conversation_id = ?
        ORDER BY direct_messages.created_at ASC LIMIT 200
      `).all(conversationId);
      const responseConversation = includeConversationAvatar
        ? conversation
        : { ...conversation, otherUser: null };
      return json(response, 200, { conversation: responseConversation, messages });
    }
    return json(response, 200, { conversation });
  }
  if (directConversationMatch && directConversationMatch[2] === "read" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const conversationId = directConversationMatch[1];
    if (!directConversationForUser(conversationId, user.id)) return json(response, 404, { error: "Conversa não encontrada." });
    const readAt = new Date().toISOString();
    database.prepare("UPDATE direct_messages SET read_at = COALESCE(read_at, ?) WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL").run(readAt, conversationId, user.id);
    database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND type = 'direct_message' AND entity_id IN (SELECT id FROM direct_messages WHERE conversation_id = ?)").run(readAt, user.id, conversationId);
    return json(response, 200, { ok: true });
  }
  const directMessagesMatch = requestUrl.pathname.match(/^\/api\/direct\/conversations\/([\w-]{16,64})\/messages$/);
  if (directMessagesMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const conversationId = directMessagesMatch[1];
    if (!directConversationForUser(conversationId, user.id)) return json(response, 404, { error: "Conversa não encontrada." });
    readJson(request).then((body) => {
      const messageBody = String(body.body || "").trim().slice(0, 1000);
      if (!messageBody) return json(response, 400, { error: "Escreva uma mensagem antes de enviar." });
      const recipient = database.prepare(`
        SELECT users.id FROM direct_conversation_members
        JOIN users ON users.id = direct_conversation_members.user_id
        WHERE direct_conversation_members.conversation_id = ? AND direct_conversation_members.user_id <> ?
        LIMIT 1
      `).get(conversationId, user.id);
      if (!recipient) return json(response, 400, { error: "Essa conversa não possui outro participante." });
      const createdAt = new Date().toISOString();
      const message = { id: randomUUID(), conversationId, senderId: user.id, body: messageBody, createdAt, readAt: null, displayName: user.displayName, username: user.username };
      try {
        database.exec("BEGIN");
        database.prepare("INSERT INTO direct_messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)").run(message.id, conversationId, user.id, messageBody, createdAt);
        database.prepare("UPDATE direct_conversations SET updated_at = ? WHERE id = ?").run(createdAt, conversationId);
        createNotification({ userId: recipient.id, type: "direct_message", entityId: message.id, title: `${user.displayName} enviou uma mensagem`, body: messageBody.slice(0, 160), createdAt });
        database.exec("COMMIT");
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch {}
        throw error;
      }
      return json(response, 201, { message });
    }).catch((error) => {
      errorLog("direct_message_create_error", { error });
      return json(response, 400, { error: "Não foi possível enviar a mensagem." });
    });
    return;
  }
  if (requestUrl.pathname === "/api/notifications" && request.method === "GET") {
    const user = requireUser(request, response);
    if (!user) return;
    const now = new Date().toISOString();
    database.prepare("UPDATE group_user_invites SET status = 'expired' WHERE invited_user_id = ? AND status = 'pending' AND expires_at <= ?").run(user.id, now);
    syncNotificationsForUser(user.id);
    const notifications = database.prepare(`
      SELECT notifications.id, notifications.type, notifications.entity_id AS entityId,
        notifications.group_id AS groupId, notifications.title, notifications.body,
        notifications.created_at AS createdAt, notifications.read_at AS readAt,
        groups.name AS groupName, group_user_invites.status AS inviteStatus,
        group_user_invites.expires_at AS inviteExpiresAt,
        group_join_requests.status AS joinRequestStatus,
        streams.id AS streamId, streams.visibility AS streamVisibility,
        streams.group_id AS streamGroupId, streams.created_by AS streamCreatedBy,
        COALESCE(stream_channel_profiles.display_name, stream_users.display_name) AS streamChannelName,
        stream_users.username AS streamChannelUsername,
        stream_groups.name AS streamGroupName,
        stream_groups.slug AS streamGroupSlug,
        stream_voice_rooms.name AS streamVoiceRoomName,
        stream_live_rooms.name AS streamLiveRoomName,
        direct_messages.conversation_id AS directConversationId
      FROM notifications
      LEFT JOIN groups ON groups.id = notifications.group_id
      LEFT JOIN group_user_invites ON notifications.type = 'group_invite' AND group_user_invites.id = notifications.entity_id
      LEFT JOIN group_join_requests ON notifications.type IN ('group_join_request', 'group_join_decision') AND group_join_requests.id = notifications.entity_id
      LEFT JOIN streams ON notifications.type = 'channel_live' AND streams.id = notifications.entity_id
      LEFT JOIN users AS stream_users ON stream_users.id = streams.created_by
      LEFT JOIN channel_profiles AS stream_channel_profiles ON stream_channel_profiles.user_id = streams.created_by
      LEFT JOIN groups AS stream_groups ON stream_groups.id = streams.group_id
      LEFT JOIN group_voice_rooms AS stream_voice_rooms ON stream_voice_rooms.id = streams.voice_room_id
      LEFT JOIN group_rooms AS stream_live_rooms ON stream_live_rooms.id = streams.room_id
      LEFT JOIN direct_messages ON notifications.type = 'direct_message' AND direct_messages.id = notifications.entity_id
      WHERE notifications.user_id = ?
        AND (
          notifications.type <> 'group_invite'
          OR (group_user_invites.status = 'pending' AND group_user_invites.expires_at > ?)
          OR notifications.read_at IS NOT NULL
        )
      ORDER BY notifications.created_at DESC
      LIMIT 100
  `).all(user.id, now).map((notification) => {
      const presentation = liveNotificationPresentation(notification, user.id);
      const streamPath = notification.streamId && presentation.liveContext
        ? streamPublicPath({ visibility: notification.streamVisibility, channelName: notification.streamChannelName, channelUsername: notification.streamChannelUsername, groupSlug: notification.streamGroupSlug })
        : null;
      const {
        streamId, streamVisibility, streamGroupId, streamCreatedBy, streamChannelName, streamChannelUsername,
        streamGroupName, streamGroupSlug, streamVoiceRoomName, streamLiveRoomName, ...safeNotification
      } = notification;
      return {
        ...safeNotification,
        ...presentation,
        streamPath,
        unread: !notification.readAt,
        actionable: notification.type === "group_invite" ? notification.inviteStatus === "pending" : notification.type === "group_join_request" ? notification.joinRequestStatus === "pending" : notification.type === "channel_live" ? Boolean(streamPath) : notification.type === "direct_message" ? Boolean(notification.directConversationId) : false,
      };
    });
    return json(response, 200, { notifications, unreadCount: notifications.filter((notification) => notification.unread).length });
  }
  if (requestUrl.pathname === "/api/notifications/read-all" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?").run(new Date().toISOString(), user.id);
    return json(response, 200, { ok: true });
  }
  const notificationMatch = requestUrl.pathname.match(/^\/api\/notifications\/([\w-]{16,64})$/);
  if (notificationMatch && request.method === "PATCH") {
    const user = requireUser(request, response);
    if (!user) return;
    const notificationId = notificationMatch[1];
    const notification = database.prepare("SELECT id FROM notifications WHERE id = ? AND user_id = ?").get(notificationId, user.id);
    if (!notification) return json(response, 404, { error: "Notificação não encontrada." });
    database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?").run(new Date().toISOString(), notificationId);
    return json(response, 200, { ok: true });
  }
  const memberInviteActionMatch = requestUrl.pathname.match(/^\/api\/member-invites\/([\w-]{16,})\/(accept|decline)$/);
  if (memberInviteActionMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const [, inviteId, action] = memberInviteActionMatch;
    const invite = database.prepare("SELECT id, group_id AS groupId, expires_at AS expiresAt, status FROM group_user_invites WHERE id = ? AND invited_user_id = ?").get(inviteId, user.id);
    if (!invite) return json(response, 404, { error: "Convite não encontrado." });
    if (invite.status !== "pending") return json(response, 400, { error: "Esse convite já foi respondido." });
    if (invite.expiresAt <= new Date().toISOString()) {
      database.prepare("UPDATE group_user_invites SET status = 'expired' WHERE id = ?").run(inviteId);
      return json(response, 400, { error: "Esse convite expirou." });
    }
    if (action === "decline") {
      database.prepare("UPDATE group_user_invites SET status = 'declined' WHERE id = ?").run(inviteId);
      return json(response, 200, { ok: true, status: "declined" });
    }
    try {
      database.exec("BEGIN");
      const roleId = ensureDefaultGroupRoles(invite.groupId, database.prepare("SELECT owner_id FROM groups WHERE id = ?").get(invite.groupId)?.owner_id);
      database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, role_id, created_at) VALUES (?, ?, 'member', ?, ?)").run(invite.groupId, user.id, roleId, new Date().toISOString());
      ensureGroupPermissionRow(invite.groupId, user.id);
      database.prepare("UPDATE group_user_invites SET status = 'accepted' WHERE id = ?").run(inviteId);
      database.exec("COMMIT");
      return json(response, 200, { ok: true, status: "accepted", groupId: invite.groupId });
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      return json(response, 400, { error: "Não foi possível aceitar o convite." });
    }
  }
  const redeemMatch = requestUrl.pathname.match(/^\/api\/invites\/([\w-]{16,})\/redeem$/);
  if (redeemMatch && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    const invite = database.prepare("SELECT group_id, expires_at, max_uses, uses FROM group_invites WHERE token_hash = ?").get(hashSessionToken(redeemMatch[1]));
    if (!invite || invite.expires_at <= new Date().toISOString() || invite.uses >= invite.max_uses) return json(response, 400, { error: "Este convite expirou ou não está mais disponível." });
    database.exec("BEGIN");
    try {
      const ownerId = database.prepare("SELECT owner_id AS ownerId FROM groups WHERE id = ?").get(invite.group_id)?.ownerId;
      const roleId = ensureDefaultGroupRoles(invite.group_id, ownerId);
      const joined = database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, role_id, created_at) VALUES (?, ?, 'member', ?, ?)").run(invite.group_id, user.id, roleId, new Date().toISOString());
      if (joined.changes) database.prepare("UPDATE group_invites SET uses = uses + 1 WHERE token_hash = ?").run(hashSessionToken(redeemMatch[1]));
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    return json(response, 200, { ok: true, groupId: invite.group_id });
  }
  if (requestUrl.pathname === "/api/streams/resolve" && request.method === "GET") {
    const parts = String(requestUrl.searchParams.get("path") || "").split("/").filter(Boolean).map(slugFor);
    if (![1, 2].includes(parts.length) || parts.some((part) => !part)) return json(response, 400, { error: "Endereço de transmissão inválido." });
    const user = currentUser(request);
    const activeStreams = database.prepare(`
      SELECT streams.id, streams.room_name AS roomName, streams.room_id AS roomId, streams.voice_room_id AS voiceRoomId, streams.title, streams.visibility, streams.group_id AS groupId,
        COALESCE(channel_profiles.display_name, users.display_name) AS channelName, COALESCE(channel_profiles.avatar_data, users.avatar_data) AS channelAvatarData,
          channel_profiles.games AS channelGames, users.username AS channelUsername, groups.name AS groupName, groups.slug AS groupSlug,
          streams.created_by AS createdBy, streams.started_at AS startedAt
      FROM streams JOIN users ON users.id = streams.created_by LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id LEFT JOIN groups ON groups.id = streams.group_id
      WHERE streams.ended_at IS NULL ORDER BY streams.started_at DESC
    `).all().filter(runtimeStreamIsLive);
    const channelPart = parts.length === 1 ? parts[0] : parts[1];
    const scopedStreams = activeStreams.filter((item) => parts.length === 1
      ? item.visibility === "public"
      : item.visibility === "private" && slugFor(item.groupSlug) === parts[0]);
    const displayNameStreams = scopedStreams.filter((item) => slugFor(item.channelName) === channelPart);
    const exactUsernameStream = scopedStreams.find((item) => slugFor(item.channelUsername) === channelPart);
    const stream = displayNameStreams.length === 1 ? displayNameStreams[0] : exactUsernameStream;
    if (stream) {
      // Do not reveal that a private stream exists to users outside its group.
      if (!canAccessStream(user?.id, stream)) return json(response, 404, { error: "Canal não encontrado." });
      return json(response, 200, { stream: { ...stream, channelAvatarData: compactAvatarData(stream.channelAvatarData), channelGames: parseChannelGames(stream.channelGames), publicPath: streamPublicPath(stream) } });
    }
    const users = database.prepare("SELECT users.id, users.username, COALESCE(channel_profiles.display_name, users.display_name) AS channelName, COALESCE(channel_profiles.avatar_data, users.avatar_data) AS channelAvatarData, channel_profiles.games AS channelGames FROM users LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id").all().map((item) => ({ ...item, channelAvatarData: compactAvatarData(item.channelAvatarData), channelGames: parseChannelGames(item.channelGames) }));
    const displayNameMatches = users.filter((item) => slugFor(item.channelName) === channelPart);
    const exactUsername = users.find((item) => slugFor(item.username) === channelPart);
    const channel = displayNameMatches.length === 1 ? displayNameMatches[0] : exactUsername;
    if (!channel) return json(response, 404, { error: "Canal não encontrado." });
    if (parts.length === 1) return json(response, 200, { stream: { channelName: channel.channelName, channelUsername: channel.username, channelAvatarData: compactAvatarData(channel.channelAvatarData), channelGames: channel.channelGames, visibility: "public", publicPath: `/${slugFor(channel.channelName || channel.username)}`, offline: true } });
    const group = database.prepare("SELECT id, name, slug FROM groups").all().find((item) => slugFor(item.slug) === parts[0]);
    if (!group) return json(response, 404, { error: "Grupo não encontrado." });
    if (!user || !isGroupMember(user.id, group.id)) return json(response, 404, { error: "Canal não encontrado." });
    return json(response, 200, { stream: { channelName: channel.channelName, channelUsername: channel.username, channelAvatarData: compactAvatarData(channel.channelAvatarData), channelGames: channel.channelGames, visibility: "private", groupSlug: group.slug, groupName: group.name, publicPath: `/${slugFor(group.slug)}/${slugFor(channel.channelName || channel.username)}`, offline: true } });
  }
  if (requestUrl.pathname === "/api/streams" && request.method === "GET") {
    const user = currentUser(request);
    const followingOnly = requestUrl.searchParams.get("following") === "1";
    if (!user && followingOnly) return json(response, 401, { error: "Entre para ver os canais que você segue." });
    if (!user) {
      const streams = database.prepare(`
        SELECT streams.id, streams.room_name AS roomName, streams.room_id AS roomId, streams.voice_room_id AS voiceRoomId, streams.title, streams.visibility, streams.group_id AS groupId, streams.started_at AS startedAt,
          COALESCE(channel_profiles.display_name, users.display_name) AS channelName, COALESCE(channel_profiles.avatar_data, users.avatar_data) AS channelAvatarData,
          channel_profiles.games AS channelGames, users.username AS channelUsername, groups.name AS groupName, groups.slug AS groupSlug,
          0 AS following
        FROM streams JOIN users ON users.id = streams.created_by LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id LEFT JOIN groups ON groups.id = streams.group_id
        WHERE streams.ended_at IS NULL AND streams.visibility = 'public'
        ORDER BY streams.started_at DESC
      `).all().filter(runtimeStreamIsLive);
      return json(response, 200, { streams: streams.map((stream) => decorateRuntimeStream({ ...stream, channelAvatarData: compactAvatarData(stream.channelAvatarData), channelGames: parseChannelGames(stream.channelGames), publicPath: streamPublicPath(stream) })) });
    }
    const streams = database.prepare(`
      SELECT streams.id, streams.room_name AS roomName, streams.room_id AS roomId, streams.voice_room_id AS voiceRoomId, streams.title, streams.visibility, streams.group_id AS groupId, streams.started_at AS startedAt,
        COALESCE(channel_profiles.display_name, users.display_name) AS channelName, COALESCE(channel_profiles.avatar_data, users.avatar_data) AS channelAvatarData,
        channel_profiles.games AS channelGames, users.username AS channelUsername, groups.name AS groupName, groups.slug AS groupSlug,
        EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = streams.created_by) AS following
      FROM streams JOIN users ON users.id = streams.created_by LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id LEFT JOIN groups ON groups.id = streams.group_id
      WHERE streams.ended_at IS NULL AND streams.visibility = 'public'
        AND (? = 0 OR EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = streams.created_by))
      ORDER BY streams.started_at DESC
    `).all(user.id, followingOnly ? 1 : 0, user.id).filter(runtimeStreamIsLive);
    return json(response, 200, { streams: streams.map((stream) => decorateRuntimeStream({ ...stream, channelAvatarData: compactAvatarData(stream.channelAvatarData), channelGames: parseChannelGames(stream.channelGames), publicPath: streamPublicPath(stream) })) });
  }
  if (requestUrl.pathname === "/api/streams" && request.method === "POST") {
    const user = requireUser(request, response);
    if (!user) return;
    readJson(request).then((body) => {
      const roomName = String(body.roomName || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
      const visibility = body.visibility === "private" ? "private" : "public";
      const groupId = visibility === "private" ? String(body.groupId || "") : null;
      const roomId = visibility === "private" ? String(body.roomId || "") : null;
      const voiceRoomId = visibility === "private" ? String(body.voiceRoomId || "") : null;
      if (roomName.length < 6) return json(response, 400, { error: "Sala inválida." });
      if (visibility === "private" && (!groupId || !isGroupMember(user.id, groupId))) return json(response, 403, { error: "Escolha um grupo do qual você participa." });
      if (visibility === "private" && !canGroupAction(user.id, groupId, "canStream")) return json(response, 403, { error: "Você não tem permissão para abrir lives neste grupo." });
      if (visibility === "private" && roomId) {
        const room = database.prepare("SELECT id, kind FROM group_rooms WHERE id = ? AND group_id = ?").get(roomId, groupId);
        if (!room || room.kind !== "live") return json(response, 400, { error: "Escolha uma sala de transmissão válida." });
      }
      if (visibility === "private" && voiceRoomId) {
        const voiceRoom = database.prepare("SELECT id FROM group_voice_rooms WHERE id = ? AND group_id = ?").get(voiceRoomId, groupId);
        if (!voiceRoom) return json(response, 400, { error: "Escolha uma sala de voz válida." });
      }
      // Os links amigáveis são baseados no nome do transmissor (e, nas
      // privadas, no grupo). Impedir duplicatas mantém cada link apontando
      // para uma única transmissão, sem esconder uma live atrás de outra.
      let transactionStarted = false;
      try {
        // A verificação e a inserção precisam ser atômicas: dois cliques, abas
        // ou clientes concorrentes não podem abrir duas lives do mesmo escopo.
        database.exec("BEGIN IMMEDIATE");
        transactionStarted = true;
        const activeStreams = visibility === "public"
          ? database.prepare("SELECT room_name AS roomName, started_at AS startedAt FROM streams WHERE created_by = ? AND visibility = 'public' AND ended_at IS NULL ORDER BY started_at DESC").all(user.id)
          : database.prepare("SELECT room_name AS roomName, started_at AS startedAt FROM streams WHERE created_by = ? AND visibility = 'private' AND group_id = ? AND ended_at IS NULL ORDER BY started_at DESC").all(user.id, groupId);
        if (activeStreams.some(runtimeStreamIsLive)) {
          database.exec("ROLLBACK");
          transactionStarted = false;
          return json(response, 409, {
            error: visibility === "public"
              ? "Você já tem uma live pública ativa. Encerre-a antes de abrir outra."
              : "Você já tem uma live privada ativa neste grupo. Encerre-a antes de abrir outra.",
          });
        }
        const groupSlug = groupId ? database.prepare("SELECT slug FROM groups WHERE id = ?").get(groupId)?.slug || "" : "";
        const channel = channelProfileForUser(user.id) || { displayName: user.displayName, avatarData: user.avatarData, games: [] };
        const stream = { id: randomUUID(), roomName, visibility, groupId, roomId: roomId || null, voiceRoomId: voiceRoomId || null, title: String(body.title || `Transmissão de ${channel.displayName}`).trim().slice(0, 120), channelName: channel.displayName, channelAvatarData: compactAvatarData(channel.avatarData), channelGames: channel.games, channelUsername: user.username, createdBy: user.id, groupSlug };
        database.prepare("INSERT INTO streams (id, room_name, created_by, title, visibility, group_id, room_id, voice_room_id, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(stream.id, stream.roomName, user.id, stream.title, stream.visibility, stream.groupId, stream.roomId, stream.voiceRoomId, new Date().toISOString());
        database.exec("COMMIT");
        transactionStarted = false;
        if (stream.visibility === "public") {
          const followers = database.prepare("SELECT follower_id AS followerId FROM follows WHERE followed_id = ?").all(user.id);
          const createdAt = new Date().toISOString();
          for (const follower of followers) {
            createNotification({
              userId: follower.followerId,
              type: "channel_live",
              entityId: stream.id,
              title: `${stream.channelName} está ao vivo`,
              body: `${stream.channelName} começou uma transmissão pública.`,
              createdAt,
            });
          }
        }
        return json(response, 201, { stream: { ...stream, publicPath: streamPublicPath(stream) } });
      } catch (error) {
        if (transactionStarted) {
          try { database.exec("ROLLBACK"); } catch {}
        }
        return json(response, 409, { error: "Não foi possível abrir este canal." });
      }
    }).catch(() => json(response, 400, { error: "Não foi possível abrir o canal." }));
    return;
  }
  const streamActionMatch = requestUrl.pathname.match(/^\/api\/streams\/([\w-]{1,64})\/(end|follow)$/);
  if (streamActionMatch && ["POST", "DELETE"].includes(request.method)) {
    const user = requireUser(request, response);
    if (!user) return;
    const stream = database.prepare("SELECT id, created_by, room_name AS roomName, ended_at AS endedAt FROM streams WHERE id = ?").get(streamActionMatch[1]);
    if (!stream) return json(response, 404, { error: "Canal não encontrado." });
    if (streamActionMatch[2] === "end") {
      if (stream.created_by !== user.id) return json(response, 403, { error: "Somente o transmissor pode encerrar este canal." });
      if (stream.endedAt) {
        closeBroadcastRoom(stream.roomName);
        return json(response, 200, { ok: true, alreadyEnded: true });
      }
      database.prepare("UPDATE streams SET ended_at = ? WHERE id = ?").run(new Date().toISOString(), stream.id);
      closeBroadcastRoom(stream.roomName);
      return json(response, 200, { ok: true });
    }
    if (stream.created_by === user.id) return json(response, 400, { error: "Você não pode seguir seu próprio canal." });
    if (request.method === "POST") {
      database.prepare("INSERT OR IGNORE INTO follows (follower_id, followed_id, created_at) VALUES (?, ?, ?)").run(user.id, stream.created_by, new Date().toISOString());
      return json(response, 200, { ok: true, following: true });
    }
    database.prepare("DELETE FROM follows WHERE follower_id = ? AND followed_id = ?").run(user.id, stream.created_by);
    return json(response, 200, { ok: true, following: false });
  }
  if (requestUrl.pathname === "/ice-config") {
    iceConfiguration().then((config) => {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(config));
    }).catch(() => response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ iceServers: [] })));
    return;
  }
  if (requestUrl.pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ ok: true, mediaMode, requireLogin }));
    return;
  }
  if (requestUrl.pathname === "/runtime-config") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({
      publicBaseUrl: publicOriginForRequest(request),
      mediaMode,
      requireLogin,
      internalAuth: true,
    }));
    return;
  }
  const seoPages = {
    "/": "seo/index.html",
    "/compartilhar-tela": "seo/compartilhar-tela.html",
    "/transmissao-ao-vivo": "seo/transmissao-ao-vivo.html",
    "/salas-de-voz-e-comunidades": "seo/salas-de-voz-e-comunidades.html",
  };
  const seoPage = seoPages[requestUrl.pathname.replace(/\/$/, "") || "/"];
  if (seoPage && ["GET", "HEAD"].includes(request.method) && (requestUrl.pathname !== "/" || !currentUser(request))) {
    const seoPath = path.resolve(publicDir, seoPage);
    fs.readFile(seoPath, (error, content) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" });
      if (request.method === "HEAD") response.end();
      else response.end(content);
    });
    return;
  }
  const legalPages = {
    "/privacidade": "privacidade.html",
    "/termos-de-uso": "termos-de-uso.html",
  };
  const legalPage = legalPages[requestUrl.pathname.replace(/\/$/, "")];
  if (legalPage && ["GET", "HEAD"].includes(request.method)) {
    const legalPath = path.resolve(publicDir, legalPage);
    fs.readFile(legalPath, (error, content) => {
      if (error) {
        response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Cache-Control": "no-store" }).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Robots-Tag": "noindex, follow",
      });
      if (request.method === "HEAD") response.end();
      else response.end(content);
    });
    return;
  }
  if (requestUrl.pathname === "/download" && ["GET", "HEAD"].includes(request.method)) {
    if (!allowLargeArtifactRequest(request)) {
      response.setHeader("Retry-After", "60");
      return json(response, 429, { error: "Muitas solicitações de download. Tente novamente em um minuto." });
    }
    const externalUrl = String(process.env.MIRANTE_DESKTOP_DOWNLOAD_URL || "").trim();
    if (externalUrl && /^https?:\/\//i.test(externalUrl)) {
      response.writeHead(302, { Location: externalUrl, "Cache-Control": "no-store" }).end();
      return;
    }
    fs.stat(desktopArtifactPath, (error, stats) => {
      if (error || !stats.isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("Instalador ainda não publicado.");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/vnd.microsoft.portable-executable",
        "Content-Disposition": `attachment; filename="${desktopArtifactName}"`,
        "Content-Length": stats.size,
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      fs.createReadStream(desktopArtifactPath).on("error", () => response.destroy()).pipe(response);
    });
    return;
  }
  if (requestUrl.pathname.startsWith("/updates/") && ["GET", "HEAD"].includes(request.method)) {
    let updateName;
    try {
      updateName = decodeURIComponent(requestUrl.pathname.slice("/updates/".length));
    } catch {
      response.writeHead(400, { "Cache-Control": "no-store" }).end("Nome de atualização inválido.");
      return;
    }
    if (!/^(latest\.yml|latest\.yaml|(?:Telai|Mirante-TV)-Setup-[0-9.]+\.exe(?:\.blockmap)?)$/.test(updateName)) {
      response.writeHead(404, { "Cache-Control": "no-store" }).end();
      return;
    }
    if (/\.exe$/i.test(updateName) && !allowLargeArtifactRequest(request)) {
      response.setHeader("Retry-After", "60");
      return json(response, 429, { error: "Muitas solicitações de atualização. Tente novamente em um minuto." });
    }
    const updatePath = path.join(desktopReleaseDir, updateName);
    fs.stat(updatePath, (error, stats) => {
      if (error || !stats.isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("Atualização ainda não publicada.");
        return;
      }
      const contentType = updateName.endsWith(".yml") || updateName.endsWith(".yaml")
        ? "text/yaml; charset=utf-8"
        : updateName.endsWith(".blockmap")
          ? "application/json; charset=utf-8"
          : "application/vnd.microsoft.portable-executable";
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stats.size,
        "Cache-Control": updateName.startsWith("latest.") ? "no-store" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      fs.createReadStream(updatePath).on("error", () => response.destroy()).pipe(response);
    });
    return;
  }
  const isFriendlyStreamRoute = !requestUrl.pathname.startsWith("/api/")
    && !/\.[a-z0-9]+$/i.test(requestUrl.pathname)
    && /^\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?\/?$/.test(requestUrl.pathname);
  const isSvelteRoute = requestUrl.pathname === "/svelte" || requestUrl.pathname === "/svelte/";
  const isAppRoute = requestUrl.pathname === "/"
    || requestUrl.pathname === "/login"
    || isSvelteRoute
    || isFriendlyStreamRoute;
  const hasSvelteBuild = fs.existsSync(path.join(publicDir, "svelte", "index.html"));
  const relativePath = isAppRoute && hasSvelteBuild
    ? "svelte/index.html"
    : requestUrl.pathname.replace(/^\//, "");
  const filePath = path.resolve(publicDir, relativePath);
  const relativeToPublic = path.relative(publicDir, filePath);
  if (relativeToPublic.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToPublic)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
      return;
    }
    const extension = path.extname(filePath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".txt": "text/plain; charset=utf-8",
      ".xml": "application/xml; charset=utf-8",
    }[extension] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" }).end(content);
  });
}

const server = http.createServer((request, response) => {
  handleHttpRequest(request, response).catch((error) => {
    errorLog("http_request_error", {
      method: request.method,
      path: request.url?.split("?", 1)[0] || "/",
      error: error?.message || String(error),
      stack: error?.stack,
    });
    if (response.headersSent) response.destroy();
    else json(response, 500, { error: "Erro interno do servidor." });
  });
});
// Evita conexões HTTP que ficam abertas indefinidamente antes de enviar o
// corpo. O timeout é compatível com os uploads de avatar permitidos e reduz a
// superfície de slowloris sem afetar o WebSocket após o upgrade.
server.requestTimeout = 120_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;

function websocketOriginAllowed(request) {
  const origin = String(request.headers.origin || "").trim();
  // Clientes nativos e ferramentas de diagnóstico podem não enviar Origin.
  // CSWSH depende de um Origin de navegador, portanto só validamos quando ele
  // existe, sem quebrar esses clientes.
  if (!origin) return true;
  let normalizedOrigin;
  try { normalizedOrigin = new URL(origin).origin; } catch { return false; }
  const configured = String(process.env.MIRANTE_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const candidates = [publicOriginForRequest(request), process.env.PUBLIC_BASE_URL, process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "", ...configured];
  const allowed = new Set(candidates.map((value) => {
    try { return new URL(value).origin; } catch { return null; }
  }).filter(Boolean));
  return allowed.has(normalizedOrigin);
}

const websocketServer = new WebSocketServer({
  server,
  path: "/signal",
  maxPayload: 16 * 1024 * 1024,
  verifyClient: ({ req }, done) => {
    if (!websocketOriginAllowed(req)) {
      warnLog("ws_origin_rejected", { origin: String(req.headers.origin || "").slice(0, 200), host: String(req.headers.host || "").slice(0, 200) });
      return done(false, 403, "Origin não permitido");
    }
    const ip = clientIp(req);
    const connectionRate = allowWebsocketConnection(req);
    if (!connectionRate.allowed) {
      warnLog("ws_connection_rate_limited", { retryAfter: connectionRate.retryAfter });
      return done(false, 429, "Muitas conexões. Aguarde um instante.");
    }
    if (websocketActiveCount(ip) >= websocketActiveConnectionLimit) {
      warnLog("ws_active_connection_limit", { active: websocketActiveCount(ip), limit: websocketActiveConnectionLimit });
      return done(false, 429, "Limite de conexões atingido.");
    }
    return done(true);
  },
});
installWebsocketHeartbeat(websocketServer);
websocketServer.on("connection", (socket, request) => {
  socket.clientId = randomUUID();
  socket.clientIpAddress = clientIp(request);
  addWebsocketActive(socket.clientIpAddress);
  socket.user = currentUser(request);
  observability.websocket.active += 1;
  observability.websocket.connections += 1;
  const originalSocketSend = socket.send.bind(socket);
  socket.send = (...args) => {
    const payload = args[0];
    if (payload != null) {
      observability.websocket.messagesOut += 1;
      observability.websocket.bytesOut += addResponseBytes(null, payload);
    }
    return originalSocketSend(...args);
  };
  infoLog("ws_connected", { clientId: socket.clientId, authenticated: Boolean(socket.user) });
  socket.on("message", (raw, isBinary) => {
    observability.websocket.messagesIn += 1;
    observability.websocket.bytesIn += addResponseBytes(null, raw);
    if (isBinary) return Promise.resolve(handleBinaryMessage(socket, raw)).catch((error) => {
      errorLog("ws_binary_message_error", { clientId: socket.clientId, roomId: socket.roomId, error: error.message });
      send(socket, { type: "error", message: "Não foi possível processar a transmissão." });
    });
    if (!allowWebsocketControlMessage(socket)) {
      warnLog("ws_control_rate_limited", { clientId: socket.clientId, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId });
      // Não derrube uma live/sala inteira por uma rajada de ICE, renegociação
      // ou mensagens de um cliente abusivo. O excesso é descartado e a janela
      // volta a aceitar mensagens normalmente após 10 segundos.
      return send(socket, { type: "rate-limit", message: "Mensagens temporariamente limitadas. O excesso foi descartado." });
    }
    if (Buffer.byteLength(raw) > websocketTextMessageMaxBytes) {
      warnLog("ws_text_message_too_large", { clientId: socket.clientId, bytes: Buffer.byteLength(raw) });
      return socket.close(1009, "Mensagem de controle muito grande");
    }
    try {
      const message = JSON.parse(raw.toString());
      Promise.resolve(handleMessage(socket, message)).catch((error) => {
        errorLog("ws_message_error", { clientId: socket.clientId, type: message?.type, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId, error: error.message, stack: error.stack });
        send(socket, { type: "error", message: "Não foi possível processar a mensagem." });
      });
    } catch (error) {
      warnLog("ws_invalid_message", { clientId: socket.clientId, error: error.message });
      send(socket, { type: "error", message: "Mensagem inválida." });
    }
  });
  socket.on("error", (error) => {
    errorLog("ws_error", { clientId: socket.clientId, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId, error: error.message });
  });
  socket.on("close", (code, reason) => {
    observability.websocket.active = Math.max(0, observability.websocket.active - 1);
    removeWebsocketActive(socket.clientIpAddress);
    observability.websocket.closed += 1;
    infoLog("ws_closed", { clientId: socket.clientId, code, reason: reason?.toString().slice(0, 120), roomId: socket.roomId, voiceRoomId: socket.voiceRoomId });
    leave(socket);
    leaveVoiceRoom(socket);
  });
});

export function getRoomCountForTests() {
  return rooms.size;
}

export function getVoiceRoomCountForTests() {
  return voiceRooms.size;
}

export function closeDatabaseForTests() {
  if (database?.open) database.close();
}

export function startServer({ host = defaultHost, port = defaultPort } = {}) {
  if (server.listening) return Promise.resolve(server);
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      infoLog("server_started", { message: `Telai em ${host === "0.0.0.0" ? "http://0.0.0.0" : `http://${host}`}:${port}`, host, port, mediaMode, requireLogin, logLevel });
      resolve(server);
    };
    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port, host);
  });
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === path.resolve(fileURLToPath(import.meta.url))) startServer();
