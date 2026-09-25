import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash, createHmac } from "node:crypto";
import { sendEmail, sendGroupInviteEmail, smtpStatus, verifySmtp } from "./mailer.mjs";
import { createRuntimeConfig } from "./server/config/runtime.mjs";
import { createWebsocketGateway } from "./server/gateway/websocket.mjs";
import { createBinaryMessageHandler } from "./server/gateway/binary-message.mjs";
import { createDirectConversationRepository } from "./server/repositories/direct-conversations.mjs";
import { createGroupAccessRepository, createGroupRepository } from "./server/repositories/groups.mjs";
import { createNotificationRepository } from "./server/repositories/notifications.mjs";
import { createChannelProfileRepository } from "./server/repositories/channel-profiles.mjs";
import { createUserPreferenceRepository } from "./server/repositories/user-preferences.mjs";
import { createNotificationSyncService } from "./server/services/notification-sync.mjs";
import { openSqliteDatabase } from "./server/repositories/sqlite.mjs";
import { ensureCompatibilityColumns, ensureCompatibilityIndexes } from "./server/database/sqlite-compatibility.mjs";
import { createSessionRepository } from "./server/repositories/sessions.mjs";
import { createAuthRepository } from "./server/repositories/auth.mjs";
import { createOAuthRepository } from "./server/repositories/oauth.mjs";
import { createAccountRepository } from "./server/repositories/accounts.mjs";
import { createSocialRepository } from "./server/repositories/social.mjs";
import { createGroupSetupRepository } from "./server/repositories/group-setup.mjs";
import { createGroupMessageRepository } from "./server/repositories/group-messages.mjs";
import { createGroupInviteRepository } from "./server/repositories/group-invites.mjs";
import { createGroupJoinRequestRepository } from "./server/repositories/group-join-requests.mjs";
import { createGroupRoleRepository } from "./server/repositories/group-roles.mjs";
import { createGroupRoomRepository } from "./server/repositories/group-rooms.mjs";
import { createGroupPermissionRepository } from "./server/repositories/group-permissions.mjs";
import { createGroupMemberRepository } from "./server/repositories/group-members.mjs";
import { createStreamRepository } from "./server/repositories/streams.mjs";
import { createGroupSettingsRepository } from "./server/repositories/group-settings.mjs";
import { createUserProfileRepository } from "./server/repositories/user-profile.mjs";
import { createSiteAdminRepository } from "./server/repositories/site-admin.mjs";
import { createMaintenanceRepository } from "./server/repositories/maintenance.mjs";
import { json, readJson } from "./server/http/body.mjs";
import { createUserSettingsRoutes } from "./server/http/user-settings-routes.mjs";
import { createSocialRoutes } from "./server/http/social-routes.mjs";
import { createNotificationRoutes } from "./server/http/notification-routes.mjs";
import { createDirectRoutes } from "./server/http/direct-routes.mjs";
import { createMemberInviteRoutes } from "./server/http/member-invite-routes.mjs";
import { createAdminRoutes } from "./server/http/admin-routes.mjs";
import { createAuthRoutes } from "./server/http/auth-routes.mjs";
import { createObservabilityRoutes } from "./server/http/observability-routes.mjs";
import { createGroupDiscoveryRoutes } from "./server/http/group-discovery-routes.mjs";
import { createGroupManagementRoutes } from "./server/http/group-management-routes.mjs";
import { createGroupRoleRoutes } from "./server/http/group-role-routes.mjs";
import { createGroupRoomRoutes } from "./server/http/group-room-routes.mjs";
import { createGroupContentRoutes } from "./server/http/group-content-routes.mjs";
import { createGroupInviteRoutes } from "./server/http/group-invite-routes.mjs";
import { createGroupRuntimeRoutes } from "./server/http/group-runtime-routes.mjs";
import { createMediaRoutes } from "./server/http/media-routes.mjs";
import { createOAuthRoutes } from "./server/http/oauth-routes.mjs";
import { createStaticRoutes } from "./server/http/static-routes.mjs";
import { createStreamRoutes } from "./server/http/stream-routes.mjs";
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

ensureCompatibilityColumns(database);
ensureCompatibilityIndexes(database);
const { isGroupMember, ensureGroupPermissionRow, groupPermissions, canGroupAction } = createGroupAccessRepository(database);
const directConversationRepository = createDirectConversationRepository(database, { compactUserSummary, createId: randomUUID });
const { directConversationForUser, directConversationPayload } = directConversationRepository;
const sessionRepository = createSessionRepository(database, { hashSessionToken });
const { userWithLinkedAccounts, legalConsentStatus, recordLegalConsents, createUserWithConsents } = createAuthRepository(database, {
  compactAvatarData,
  legalPolicyVersion,
  createId: randomUUID,
});
const notificationRepository = createNotificationRepository(database);
const { createNotification } = notificationRepository;
const handleDirectRoutes = createDirectRoutes({
  json,
  readJson,
  requireUser,
  directConversationRepository,
  directConversationForUser,
  directConversationPayload,
  createNotification,
  errorLog,
});
const channelProfileRepository = createChannelProfileRepository(database, { compactAvatarData, parseChannelGames });
const { channelProfileForUser } = channelProfileRepository;
const userPreferenceRepository = createUserPreferenceRepository(database, { normalizePreferenceVolume });
const notificationSyncService = createNotificationSyncService(database, {
  getNotificationScope: (userId) => userPreferenceRepository.getPreferences(userId).liveNotificationScope,
  isStreamLive: runtimeStreamIsLive,
  createLiveContext: liveNotificationContext,
  createNotification,
});
const accountRepository = createAccountRepository(database, { legalPolicyVersion, createId: randomUUID });
const socialRepository = createSocialRepository(database, { compactAvatarData, createId: randomUUID });
const handleSocialRoutes = createSocialRoutes({ json, requireUser, socialRepository, createNotification });
const groupSetupRepository = createGroupSetupRepository(database, { createId: randomUUID });
const groupMessageRepository = createGroupMessageRepository(database, { createId: randomUUID });
const groupRepository = createGroupRepository(database, { createId: randomUUID, groupSetupRepository });
const groupInviteRepository = createGroupInviteRepository(database, {
  createId: randomUUID,
  hashToken: hashSessionToken,
  groupSetupRepository,
  ensureGroupPermissionRow,
});
const handleNotificationRoutes = createNotificationRoutes({
  json,
  requireUser,
  groupInviteRepository,
  notificationRepository,
  syncNotificationsForUser,
  liveNotificationPresentation,
  streamPublicPath,
});
const handleMemberInviteRoutes = createMemberInviteRoutes({ json, requireUser, groupInviteRepository });
const groupJoinRequestRepository = createGroupJoinRequestRepository(database, {
  createId: randomUUID,
  groupSetupRepository,
  ensureGroupPermissionRow,
  compactAvatarData,
});
const groupRoleRepository = createGroupRoleRepository(database, { createId: randomUUID });
const groupRoomRepository = createGroupRoomRepository(database, { createId: randomUUID });
const groupPermissionRepository = createGroupPermissionRepository(database);
const groupMemberRepository = createGroupMemberRepository(database, { compactAvatarData });
const streamRepository = createStreamRepository(database, { createId: randomUUID });
const groupSettingsRepository = createGroupSettingsRepository(database);
const handleGroupDiscoveryRoutes = createGroupDiscoveryRoutes({
  json,
  readJson,
  requireUser,
  groupRepository,
  groupSettingsRepository,
  groupMemberRepository,
  slugFor,
});
const handleGroupManagementRoutes = createGroupManagementRoutes({
  json,
  readJson,
  requireUser,
  groupJoinRequestRepository,
  groupSettingsRepository,
  groupPermissionRepository,
  groupSetupRepository,
  groupRoleRepository,
  groupInviteRepository,
  isGroupMember,
  createNotification,
  slugFor,
});
const handleGroupRoleRoutes = createGroupRoleRoutes({ json, readJson, requireUser, groupRoleRepository, groupPermissionRepository });
const handleGroupRoomRoutes = createGroupRoomRoutes({
  json,
  readJson,
  requireUser,
  isGroupMember,
  canGroupAction,
  groupPermissionRepository,
  groupRoomRepository,
  roomSlugFor,
  parseVoiceRoomParticipantLimit,
});
const handleGroupContentRoutes = createGroupContentRoutes({
  json,
  readJson,
  requireUser,
  isGroupMember,
  canGroupAction,
  groupMessageRepository,
  groupPermissionRepository,
});
const handleGroupInviteRoutes = createGroupInviteRoutes({
  json,
  readJson,
  requireUser,
  groupInviteRepository,
  groupPermissionRepository,
  groupSettingsRepository,
  isGroupMember,
  canGroupAction,
  createNotification,
  sendGroupInviteEmail,
  publicOriginForRequest,
  warnLog,
  compactUserSummary,
  randomBytes,
});
const handleStreamRoutes = createStreamRoutes({
  json,
  readJson,
  requireUser,
  currentUser,
  streamRepository,
  channelProfileRepository,
  channelProfileForUser,
  groupSettingsRepository,
  groupRoomRepository,
  isGroupMember,
  canGroupAction,
  canAccessStream,
  runtimeStreamIsLive,
  decorateRuntimeStream,
  streamPublicPath,
  closeBroadcastRoom,
  compactAvatarData,
  parseChannelGames,
  slugFor,
  createNotification,
});
const handleGroupRuntimeRoutes = createGroupRuntimeRoutes({
  json,
  requireUser,
  groupJoinRequestRepository,
  groupSettingsRepository,
  groupRoomRepository,
  groupMemberRepository,
  groupMessageRepository,
  streamRepository,
  groupPermissions,
  isGroupMember,
  runtimeStreamIsLive,
  streamPublicPath,
  compactAvatarData,
  parseChannelGames,
  voiceRooms,
  send,
  leaveVoiceRoom,
  voiceParticipantFor,
  touchGroupPresence,
  isPresent,
});
const handleMediaRoutes = createMediaRoutes({ iceConfiguration, mediaMode, requireLogin, publicOriginForRequest });
const userProfileRepository = createUserProfileRepository(database);
const handleUserSettingsRoutes = createUserSettingsRoutes({
  json,
  readJson,
  requireUser,
  currentUser,
  userWithLinkedAccounts,
  userProfileRepository,
  channelProfileForUser,
  channelProfileRepository,
  userPreferenceRepository,
  parseChannelGames,
  safePreferenceColor,
  normalizePreferenceVolume,
  normalizePreferenceDeviceId,
  maxAvatarUploadLength,
});
const siteAdminRepository = createSiteAdminRepository(database);
const maintenanceRepository = createMaintenanceRepository(database);
const handleAdminRoutes = createAdminRoutes({
  json,
  readJson,
  requireMaintenanceOperator,
  requireSiteAdmin,
  activeMaintenanceNotice,
  maintenanceRepository,
  smtpStatus,
  verifySmtp,
  sendEmail,
  currentUser,
  infoLog,
  warnLog,
  errorLog,
  siteAdminSummary,
  siteAdminAccountsPage,
  siteAdminGroupsPage,
  siteAdminStreamsPage,
  siteAdminGroupMembersPage,
  siteAdminOverview,
});
const { upsertOAuthUser, linkOAuthAccount } = createOAuthRepository(database, {
  slugFor,
  createPasswordHash: () => hashPassword(randomBytes(48).toString("base64url")),
  createId: randomUUID,
  mergeUsers: (targetId, sourceId) => mergeUsers(targetId, sourceId),
});

function pruneExpiredRuntimeState() {
  const now = Date.now();
  for (const [key, entry] of oauthStates) {
    if (!entry || entry.expiresAt <= now) oauthStates.delete(key);
  }
  for (const [key, lastSeen] of groupPresence) {
    if (now - lastSeen > 35_000) groupPresence.delete(key);
  }
  try {
    sessionRepository.deleteExpired(new Date(now).toISOString());
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

const userDataExport = (userId) => accountRepository.userDataExport(userId);

function disconnectUserSockets(userId) {
  if (typeof websocketServer === "undefined") return;
  for (const socket of websocketServer.clients) {
    if (socket.user?.id !== userId) continue;
    try { send(socket, { type: "account-deleted", message: "Sua conta foi excluída." }); } catch {}
    try { socket.close(1000, "Conta excluída"); } catch {}
  }
}

function deleteUserAccount(userId) {
  accountRepository.deleteUserAccount(userId);
  for (const key of groupPresence.keys()) if (key.startsWith(`${userId}:`)) groupPresence.delete(key);
  disconnectUserSockets(userId);
}

const handleAuthRoutes = createAuthRoutes({
  json,
  readJson,
  requireUser,
  currentUser,
  userWithLinkedAccounts,
  oauthProvider,
  publicOriginForRequest,
  recordLegalConsents,
  legalConsentStatus,
  userDataExport,
  deleteUserAccount,
  errorLog,
  randomUUID,
  normalizeUsername,
  hashPassword,
  createUserWithConsents,
  userProfileRepository,
  createSession,
  loginIsBlocked,
  allowLoginAttempt,
  clientIp,
  loginRate,
  loginRateWindowMs,
  recordLoginFailure,
  passwordMatches,
  clearLoginFailure,
  parseCookies,
  sessionRepository,
  expiredSessionCookie,
});
const handleOAuthRoutes = createOAuthRoutes({
  oauthProvider,
  currentUser,
  oauthStateCookie,
  oauthRedirectUri,
  oauthErrorRedirect,
  pkceChallenge,
  oauthStates,
  maxOAuthStates,
  hashSessionToken,
  randomBytes,
  warnLog,
  parseCookies,
  fetchOAuthIdentity,
  linkOAuthAccount,
  upsertOAuthUser,
  sessionRepository,
  sessionCookie,
});
const handleStaticRoutes = createStaticRoutes({
  json,
  publicDir,
  desktopArtifactPath,
  desktopArtifactName,
  desktopReleaseDir,
  allowLargeArtifactRequest,
  currentUser,
});
const handleObservabilityRoutes = createObservabilityRoutes({
  json,
  readJson,
  isLocalObservabilityRequest,
  observabilitySnapshot,
  allowClientErrorRequest,
  currentUser,
  addMapCount,
  observability,
  routineClientDiagnosticKinds,
  infoLog,
  errorLog,
  warnLog,
});

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
  notificationSyncService.sync(userId);
}

const mergeUsers = (targetId, sourceId) => accountRepository.mergeUsers(targetId, sourceId);

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
  const row = maintenanceRepository.active(new Date().toISOString());
  if (!row) return null;
  return {
    ...row,
    secondsUntilStart: Math.max(0, Math.ceil((Date.parse(row.startsAt) - Date.now()) / 1000)),
  };
}

function siteAdminOverview() {
  const now = new Date().toISOString();
  const activeStreams = streamRepository.listAdminStreams().filter(runtimeStreamIsLive);
  const liveCountByGroup = new Map();
  for (const stream of activeStreams) {
    if (stream.groupId) liveCountByGroup.set(stream.groupId, (liveCountByGroup.get(stream.groupId) || 0) + 1);
  }
  const accounts = siteAdminRepository.listAccounts(now);
  const groups = siteAdminRepository.listGroups().map((group) => ({ ...group, liveCount: liveCountByGroup.get(group.id) || 0 }));
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
      activeSessions: siteAdminRepository.countActiveSessions(now),
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
  const activeStreams = streamRepository.listActiveStreams().filter(runtimeStreamIsLive);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      accounts: siteAdminRepository.countAccounts(),
      groups: siteAdminRepository.countGroups(),
      openStreams: activeStreams.length,
      activeSessions: siteAdminRepository.countActiveSessions(now),
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
  const total = siteAdminRepository.countAccounts();
  const accounts = siteAdminRepository.listAccounts(now, pageSize, offset);
  return adminPage(accounts, total, page, pageSize);
}

function siteAdminGroupsPage(requestUrl) {
  const { page, pageSize, offset } = adminPagination(requestUrl);
  const total = siteAdminRepository.countGroups();
  const liveGroups = new Map();
  streamRepository.listActiveStreams()
    .filter(runtimeStreamIsLive)
    .forEach((stream) => {
      if (stream.groupId) liveGroups.set(stream.groupId, (liveGroups.get(stream.groupId) || 0) + 1);
    });
  const groups = siteAdminRepository.listGroups(pageSize, offset).map((group) => ({ ...group, liveCount: liveGroups.get(group.id) || 0 }));
  return adminPage(groups, total, page, pageSize);
}

function siteAdminStreamsPage(requestUrl) {
  const { page, pageSize, offset } = adminPagination(requestUrl);
  const streams = siteAdminOverview().streams;
  return adminPage(streams.slice(offset, offset + pageSize), streams.length, page, pageSize);
}

function siteAdminGroupMembersPage(requestUrl, groupId) {
  const { page, pageSize, offset } = adminPagination(requestUrl);
  const group = siteAdminRepository.findGroupWithOwner(groupId);
  if (!group) return null;
  const total = siteAdminRepository.countGroupMembers(groupId);
  const members = siteAdminRepository.listGroupMembers(groupId, pageSize, offset);
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

groupSetupRepository.initializeExistingGroups();

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
  return streamRepository.findForRoom(roomId);
}

function loadStreamChat(roomId) {
  return streamRepository.loadChatForRoom(roomId);
}

function endStreamByRoom(roomId) {
  streamRepository.endByRoom(roomId);
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
  const room = groupRoomRepository.findRoom(groupId, voiceRoomId);
  const voiceRoom = room?.kind === "voice" ? { ...room, groupId } : null;
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
  const stream = streamRepository.findActiveForRoom(roomId);
  if (!stream) return { ok: false, message: "Esta transmissão não existe ou já foi encerrada." };
  if (!runtimeStreamIsLive(stream)) return { ok: false, message: "Esta transmissão foi encerrada. Abra uma nova live para continuar." };
  if (role === "viewer" && socket.user && stream.createdBy === socket.user.id) {
    return { ok: false, message: "Você já está transmitindo esta live pelo painel do Telai." };
  }
  // Links públicos podem ser assistidos sem conta. A autenticação continua
  // obrigatória para abrir lives e para acessar qualquer canal privado.
  if (role === "viewer" && stream.visibility === "public") return { ok: true };
  if (!socket.user) return { ok: false, message: "Entre com sua conta para acessar esta transmissão." };
  if (role === "host" && stream.createdBy === socket.user.id) return { ok: true };
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
    const targetRoomRecord = groupRoomRepository.findVoiceRoomById(targetRoomId);
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
    streamRepository.insertChatMessage({
      id: chatMessage.id,
      channelUserId: stream.createdBy,
      streamId: stream.id,
      userId: socket.user?.id || null,
      body: chatMessage.body,
      displayName: chatMessage.displayName,
      username: chatMessage.username,
      createdAt: chatMessage.createdAt,
    });
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
    streamRepository.clearChat(stream.id);
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
  if (await handleAdminRoutes(request, response, requestUrl)) return;
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
  if (await handleObservabilityRoutes(request, response, requestUrl)) return;
  if (await handleOAuthRoutes(request, response, requestUrl)) return;
  if (await handleAuthRoutes(request, response, requestUrl)) return;
  if (await handleUserSettingsRoutes(request, response, requestUrl)) return;
  if (await handleSocialRoutes(request, response, requestUrl)) return;
  if (await handleGroupDiscoveryRoutes(request, response, requestUrl)) return;
  if (await handleGroupRuntimeRoutes(request, response, requestUrl)) return;
  if (await handleGroupManagementRoutes(request, response, requestUrl)) return;
  if (await handleGroupRoleRoutes(request, response, requestUrl)) return;
  if (await handleGroupRoomRoutes(request, response, requestUrl)) return;
  if (await handleGroupContentRoutes(request, response, requestUrl)) return;
  if (await handleGroupInviteRoutes(request, response, requestUrl)) return;
  if (await handleDirectRoutes(request, response, requestUrl)) return;
  if (await handleNotificationRoutes(request, response, requestUrl)) return;
  if (await handleMemberInviteRoutes(request, response, requestUrl)) return;
  if (await handleStreamRoutes(request, response, requestUrl)) return;
  if (await handleMediaRoutes(request, response, requestUrl)) return;
  if (await handleStaticRoutes(request, response, requestUrl)) return;
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

const handleBinaryMessage = createBinaryMessageHandler({
  rooms,
  mediaMode,
  relayChunkMaxBytes,
  relayRecentBytesMax,
  warnLog,
  sendRelayChunk,
});

const websocketServer = createWebsocketGateway({
  server,
  currentUser,
  clientIp,
  publicOriginForRequest,
  allowWebsocketConnection,
  websocketActiveCount,
  websocketActiveConnectionLimit,
  addWebsocketActive,
  removeWebsocketActive,
  observability,
  addResponseBytes,
  randomUUID,
  infoLog,
  warnLog,
  errorLog,
  send,
  handleBinaryMessage,
  allowWebsocketControlMessage,
  websocketTextMessageMaxBytes,
  handleMessage,
  leave,
  leaveVoiceRoom,
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
