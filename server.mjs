import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, timingSafeEqual, createHmac } from "node:crypto";
import { sendEmail, sendGroupInviteEmail, smtpStatus, verifySmtp } from "./mailer.mjs";
import { createRuntimeConfig } from "./server/config/runtime.mjs";
import { createDatabaseConfig } from "./server/config/database.mjs";
import { createWebsocketGateway } from "./server/gateway/websocket.mjs";
import { createEventGateway } from "./server/gateway/events.mjs";
import { createGatewayPolicy } from "./server/gateway/policy.mjs";
import { createGatewayMessageDispatcher } from "./server/gateway/message-dispatcher.mjs";
import { createBinaryMessageHandler } from "./server/gateway/binary-message.mjs";
import { createVoiceMessageHandler } from "./server/gateway/voice-message-handler.mjs";
import { createBroadcastMessageHandler } from "./server/gateway/broadcast-message-handler.mjs";
import { createBroadcastRuntime } from "./server/gateway/broadcast-runtime.mjs";
import { createIceConfiguration } from "./server/media/ice-configuration.mjs";
import { createLocalAttachmentStorage } from "./server/media/attachments.mjs";
import { createAuthRuntime } from "./server/auth/runtime.mjs";
import { hashPassword, hashSessionToken } from "./server/auth/crypto.mjs";
import { createStreamRuntime } from "./server/domain/streams/runtime.mjs";
import { createVoiceRuntime } from "./server/domain/voice/runtime.mjs";
import { createDirectConversationRepository } from "./server/repositories/direct-conversations.mjs";
import { createGroupAccessRepository, createGroupRepository } from "./server/repositories/groups.mjs";
import { createNotificationRepository } from "./server/repositories/notifications.mjs";
import { createChannelProfileRepository } from "./server/repositories/channel-profiles.mjs";
import { createUserPreferenceRepository } from "./server/repositories/user-preferences.mjs";
import { createNotificationSyncService } from "./server/services/notification-sync.mjs";
import { createNotificationRuntime, liveNotificationContext } from "./server/notifications/runtime.mjs";
import { openSqliteDatabase } from "./server/repositories/sqlite.mjs";
import { SQLITE_SCHEMA } from "./server/database/sqlite-schema.mjs";
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
import { createGroupRoomPermissionRepository } from "./server/repositories/group-room-permissions.mjs";
import { createGroupAuditRepository } from "./server/repositories/group-audit.mjs";
import { createGroupModerationRepository } from "./server/repositories/group-moderation.mjs";
import { createGroupAttachmentRepository } from "./server/repositories/group-attachments.mjs";
import { createGroupRoomReadRepository } from "./server/repositories/group-room-reads.mjs";
import { createGroupPermissionRepository } from "./server/repositories/group-permissions.mjs";
import { createGroupMemberRepository } from "./server/repositories/group-members.mjs";
import { createStreamRepository } from "./server/repositories/streams.mjs";
import { createGroupSettingsRepository } from "./server/repositories/group-settings.mjs";
import { createUserProfileRepository } from "./server/repositories/user-profile.mjs";
import { createSiteAdminRepository } from "./server/repositories/site-admin.mjs";
import { createMaintenanceRepository, createPostgresMaintenanceRepository } from "./server/repositories/maintenance.mjs";
import { createPostgresPool } from "./server/repositories/postgres.mjs";
import { json, readJson } from "./server/http/body.mjs";
import { createHttpRateLimit } from "./server/http/rate-limit.mjs";
import { createHttpRequestHandler } from "./server/http/request-handler.mjs";
import { createUserSettingsRoutes } from "./server/http/user-settings-routes.mjs";
import { createSocialRoutes } from "./server/http/social-routes.mjs";
import { createNotificationRoutes } from "./server/http/notification-routes.mjs";
import { createDirectRoutes } from "./server/http/direct-routes.mjs";
import { createMemberInviteRoutes } from "./server/http/member-invite-routes.mjs";
import { createAdminRoutes } from "./server/http/admin-routes.mjs";
import { createAdminRuntime } from "./server/admin/runtime.mjs";
import { createAuthRoutes } from "./server/http/auth-routes.mjs";
import { createObservabilityRoutes } from "./server/http/observability-routes.mjs";
import { createHttpRouter } from "./server/http/router.mjs";
import { createGroupDiscoveryRoutes } from "./server/http/group-discovery-routes.mjs";
import { createGroupManagementRoutes } from "./server/http/group-management-routes.mjs";
import { createGroupRoleRoutes } from "./server/http/group-role-routes.mjs";
import { createGroupRoomRoutes } from "./server/http/group-room-routes.mjs";
import { createGroupAuditRoutes } from "./server/http/group-audit-routes.mjs";
import { createGroupModerationRoutes } from "./server/http/group-moderation-routes.mjs";
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
const databaseConfig = createDatabaseConfig();
const databaseDriver = databaseConfig.driver;
if (databaseDriver !== "sqlite") {
  throw new Error("PostgreSQL ainda não está ligado ao runtime HTTP do Telai. Mantenha TELAI_DATABASE_DRIVER=sqlite até concluir o cutover validado.");
}
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
let eventGateway = null;
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
const routineClientDiagnosticKinds = new Set(["voice_activity_sample", "voice_activity_state", "voice_activity_analyzer_ready", "voice_rtc_quality"]);
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
const {
  allowClientErrorRequest,
  allowLargeArtifactRequest,
  consumeFixedWindow,
  enforceApiRateLimit,
  evictRateLimitEntries,
  pruneClientErrorRate,
  pruneDownloadRate,
  pruneRateMap,
} = createHttpRateLimit({
  clientIp,
  json,
  warnLog,
  downloadRate,
  downloadRateLimitPerMinute,
  downloadRateWindowMs,
  clientErrorRate,
  clientErrorRateLimitPerMinute,
  maxRateLimitEntries,
  apiRate,
  apiRateLimitPerMinute,
  apiRateWindowMs,
  apiWriteRate,
  apiWriteRateLimitPerMinute,
  apiGlobalRate,
  apiGlobalRateLimitPerMinute,
  registerRate,
  apiRegisterRateLimit,
  apiRegisterRateWindowMs,
  oauthRate,
  apiOAuthRateLimit,
  apiOAuthRateWindowMs,
  groupOverviewRateLimitPerMinute,
});

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
  if (pathname === "/events") return "/events";
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

const database = openSqliteDatabase(databasePath, SQLITE_SCHEMA);
let maintenanceDatabasePool = null;

ensureCompatibilityColumns(database);
ensureCompatibilityIndexes(database);
const groupRoomPermissionRepository = createGroupRoomPermissionRepository(database);
const { isGroupMember, ensureGroupPermissionRow, groupPermissions, canGroupAction, canGroupRoomAction } = createGroupAccessRepository(database, { roomPermissionRepository: groupRoomPermissionRepository });
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
const streamRepository = createStreamRepository(database, { createId: randomUUID });
const {
  canAccessStream,
  decorateRuntimeStream,
  endStreamByRoom,
  isPresent,
  loadStreamChat,
  authorizeRoomJoin,
  runtimeStreamIsLive,
  streamForRoom,
  streamPublicPath,
  touchGroupPresence,
} = createStreamRuntime({
  rooms,
  groupPresence,
  streamRepository,
  runtimeStartedAt,
  streamOrphanGraceMs,
  hostReconnectGraceMs,
  isGroupMember,
  slugFor,
  requireLogin,
});
const notificationSyncService = createNotificationSyncService(database, {
  getNotificationScope: (userId) => userPreferenceRepository.getPreferences(userId).liveNotificationScope,
  isStreamLive: runtimeStreamIsLive,
  createLiveContext: liveNotificationContext,
  createNotification,
});
const { liveNotificationPresentation, syncNotificationsForUser } = createNotificationRuntime({
  notificationSyncService,
  canAccessStream,
});
const accountRepository = createAccountRepository(database, { legalPolicyVersion, createId: randomUUID });
const socialRepository = createSocialRepository(database, { compactAvatarData, createId: randomUUID });
const handleSocialRoutes = createSocialRoutes({ json, requireUser, socialRepository, createNotification });
const groupSetupRepository = createGroupSetupRepository(database, { createId: randomUUID });
const groupMessageRepository = createGroupMessageRepository(database, { createId: randomUUID });
const groupAttachmentRepository = createGroupAttachmentRepository(database, { createId: randomUUID });
const groupRoomReadRepository = createGroupRoomReadRepository(database);
const attachmentStorage = createLocalAttachmentStorage(process.env.TELAI_ATTACHMENT_DIR || path.join(dataDir, "attachments"));
const attachmentUrlFor = (groupId, attachmentId) => `/api/groups/${encodeURIComponent(groupId)}/attachments/${encodeURIComponent(attachmentId)}`;
const groupRepository = createGroupRepository(database, { createId: randomUUID, groupSetupRepository });
const groupModerationRepository = createGroupModerationRepository(database, { createId: randomUUID });
const groupInviteRepository = createGroupInviteRepository(database, {
  createId: randomUUID,
  hashToken: hashSessionToken,
  groupSetupRepository,
  ensureGroupPermissionRow,
  groupModerationRepository,
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
const groupAuditRepository = createGroupAuditRepository(database, { createId: randomUUID });
const {
  authorizeVoiceRoomJoin,
  broadcastVoice,
  leaveVoiceRoom,
  removeDuplicateVoiceSessions,
  replaceOtherVoiceSessions,
  voiceParticipantFor,
  voiceRoomFor,
} = createVoiceRuntime({
  voiceRooms,
  send,
  compactAvatarData,
  debugLog,
  groupRoomRepository,
  isGroupMember,
  canGroupAction,
  canGroupRoomAction,
});

function disconnectGroupUser(groupId, userId, reason) {
  for (const voiceRoom of voiceRooms.values()) {
    if (voiceRoom.groupId !== groupId) continue;
    for (const participant of [...voiceRoom.participants.values()]) {
      if (participant.user?.id !== userId) continue;
      send(participant, { type: "voice-disconnected", reason, message: reason === "ban" ? "Você foi banido deste grupo." : "Você foi expulso deste grupo." });
      leaveVoiceRoom(participant);
    }
  }
  groupPresence.delete(`${groupId}:${userId}`);
  eventGateway?.disconnectUserFromGroup(groupId, userId, reason);
  eventGateway?.publishGroupPresence(groupId);
}
const groupPermissionRepository = createGroupPermissionRepository(database);
const groupMemberRepository = createGroupMemberRepository(database, { compactAvatarData });
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
  groupAuditRepository,
  groupModerationRepository,
  groupInviteRepository,
  isGroupMember,
  createNotification,
  slugFor,
});
const handleGroupRoleRoutes = createGroupRoleRoutes({ json, readJson, requireUser, groupRoleRepository, groupPermissionRepository, groupAuditRepository });
const handleGroupRoomRoutes = createGroupRoomRoutes({
  json,
  readJson,
  requireUser,
  isGroupMember,
  canGroupAction,
  groupRoleRepository,
  groupRoomPermissionRepository,
  groupPermissionRepository,
  groupRoomRepository,
  groupAuditRepository,
  roomSlugFor,
  parseVoiceRoomParticipantLimit,
});
const handleGroupAuditRoutes = createGroupAuditRoutes({ json, requireUser, groupPermissionRepository, groupAuditRepository });
const handleGroupModerationRoutes = createGroupModerationRoutes({
  json,
  readJson,
  requireUser,
  groupPermissions,
  groupMemberRepository,
  groupModerationRepository,
  groupAuditRepository,
  disconnectGroupUser,
  publishGroupEvent: (...args) => eventGateway?.publishGroupEvent(...args),
});
const handleGroupContentRoutes = createGroupContentRoutes({
  json,
  readJson,
  requireUser,
  isGroupMember,
  canGroupAction,
  groupMessageRepository,
  groupAttachmentRepository,
  attachmentStorage,
  attachmentUrlFor,
  canGroupRoomAction,
  groupPermissionRepository,
  groupModerationRepository,
  publishGroupEvent: (...args) => eventGateway?.publishGroupEvent(...args),
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
const {
  clearHostReconnectTimer,
  closeBroadcastRoom,
  leave,
  notifyRelayStarted,
  notifyViewerCount,
  notifyViewers,
  resyncRelayViewer,
  roomFor,
  sendRelayChunk,
} = createBroadcastRuntime({
  rooms,
  send,
  loadStreamChat,
  endStreamByRoom,
  hostReconnectGraceMs,
  infoLog,
  debugLog,
});
const {
  allowLoginAttempt,
  clearLoginFailure,
  createSession,
  currentUser,
  deleteUserAccount,
  expiredSessionCookie,
  fetchOAuthIdentity,
  loginIsBlocked,
  oauthErrorRedirect,
  oauthProvider,
  oauthRedirectUri,
  oauthStateCookie,
  parseCookies,
  passwordMatches,
  pkceChallenge,
  recordLoginFailure,
  sessionCookie,
  userDataExport,
} = createAuthRuntime({
  sessionRepository,
  accountRepository,
  groupPresence,
  loginRate,
  loginRateLimitPerMinute,
  loginRateWindowMs,
  loginFailures,
  loginFailureIpLimit,
  loginFailureLimit,
  loginFailureWindowMs,
  clientIp,
  evictRateLimitEntries,
  trustedForwardedHeaders,
  publicOriginForRequest,
  hashSessionToken,
  randomBytes,
  send,
  errorLog,
  getWebsocketServer: () => websocketServer,
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
  groupRoomReadRepository,
  groupMemberRepository,
  groupMessageRepository,
  groupAttachmentRepository,
  attachmentStorage,
  attachmentUrlFor,
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
  canGroupRoomAction,
});
const iceConfiguration = createIceConfiguration({ randomUUID, createHmac });
const handleMediaRoutes = createMediaRoutes({ iceConfiguration, mediaMode, requireLogin, publicOriginForRequest });
const {
  allowRtcSignal,
  allowVoiceSpeakingUpdate,
  allowWebsocketControlMessage,
  normalizeRtcSignalPayload,
  reportVoiceSpeakingRateLimited,
} = createGatewayPolicy({
  rtcSignalPayloadMaxBytes,
  rtcSignalRateWindowMs,
  rtcSignalRateLimit,
  voiceSpeakingRateWindowMs,
  voiceSpeakingRateLimit,
  warnLog,
});
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
const maintenanceRepository = databaseConfig.maintenanceDriver === "postgres"
  ? (() => {
    maintenanceDatabasePool = createPostgresPool(databaseConfig);
    return createPostgresMaintenanceRepository(maintenanceDatabasePool);
  })()
  : createMaintenanceRepository(database);
const {
  activeMaintenanceNotice,
  requireMaintenanceOperator,
  requireSiteAdmin,
  siteAdminAccountsPage,
  siteAdminGroupsPage,
  siteAdminGroupMembersPage,
  siteAdminOverview,
  siteAdminStreamsPage,
  siteAdminSummary,
} = createAdminRuntime({
  json,
  currentUser,
  normalizeUsername,
  siteAdminUserIds,
  siteAdminUsernames,
  maintenanceToken,
  maintenanceRepository,
  streamRepository,
  runtimeStreamIsLive,
  rooms,
  voiceRooms,
  siteAdminRepository,
  timingSafeEqual,
});
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

const mergeUsers = (targetId, sourceId) => accountRepository.mergeUsers(targetId, sourceId);

function requireUser(request, response) {
  const user = currentUser(request);
  if (!user) json(response, 401, { error: "Entre com sua conta para continuar." });
  return user;
}

groupSetupRepository.initializeExistingGroups();

function send(socket, message) {
  if (socket?.readyState !== 1) return false;
  try {
    const sequence = (socket.gatewaySequence || 0) + 1;
    socket.gatewaySequence = sequence;
    socket.send(JSON.stringify(
      message && typeof message === "object" && !Buffer.isBuffer(message)
        ? { ...message, sequence }
        : message,
    ));
    return true;
  } catch (error) {
    errorLog("ws_send_error", { clientId: socket.clientId, type: message?.type, error: error.message });
    return false;
  }
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

const handleHttpRoutes = createHttpRouter({
  fs,
  path,
  publicDir,
  requireSiteAdmin,
  handleAdminRoutes,
  handleObservabilityRoutes,
  handleOAuthRoutes,
  handleAuthRoutes,
  handleUserSettingsRoutes,
  handleSocialRoutes,
  handleGroupDiscoveryRoutes,
  handleGroupRuntimeRoutes,
  handleGroupManagementRoutes,
  handleGroupRoleRoutes,
  handleGroupRoomRoutes,
  handleGroupAuditRoutes,
  handleGroupModerationRoutes,
  handleGroupContentRoutes,
  handleGroupInviteRoutes,
  handleDirectRoutes,
  handleNotificationRoutes,
  handleMemberInviteRoutes,
  handleStreamRoutes,
  handleMediaRoutes,
  handleStaticRoutes,
});
const handleHttpRequest = createHttpRequestHandler({
  randomUUID,
  metricRoute,
  addResponseBytes,
  observability,
  addMapCount,
  debugLog,
  warnLog,
  errorLog,
  enforceApiRateLimit,
  handleHttpRoutes,
});

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

const handleBroadcastMessage = createBroadcastMessageHandler({
  send,
  rooms,
  mediaMode,
  authorizeRoomJoin,
  leave,
  roomFor,
  clearHostReconnectTimer,
  notifyViewerCount,
  notifyRelayStarted,
  resyncRelayViewer,
  notifyViewers,
  normalizeRtcSignalPayload,
  streamForRoom,
  streamRepository,
  randomUUID,
  closeBroadcastRoom,
  infoLog,
});

const handleVoiceMessage = createVoiceMessageHandler({
  send,
  voiceRooms,
  authorizeVoiceRoomJoin,
  voiceRoomFor,
  parseVoiceRoomParticipantLimit,
  replaceOtherVoiceSessions,
  leaveVoiceRoom,
  removeDuplicateVoiceSessions,
  randomUUID,
  voiceParticipantFor,
  infoLog,
  canGroupAction,
  groupRoomRepository,
  broadcastVoice,
  allowVoiceSpeakingUpdate,
  reportVoiceSpeakingRateLimited,
  normalizeRtcSignalPayload,
});
const handleMessage = createGatewayMessageDispatcher({
  debugLog,
  allowRtcSignal,
  warnLog,
  send,
  handleVoiceMessage,
  handleBroadcastMessage,
});

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

eventGateway = createEventGateway({
  server,
  currentUser,
  clientIp,
  publicOriginForRequest,
  allowWebsocketConnection,
  websocketActiveCount,
  websocketActiveConnectionLimit,
  addWebsocketActive,
  removeWebsocketActive,
  websocketTextMessageMaxBytes,
  allowWebsocketControlMessage,
  isGroupMember,
  groupMemberRepository,
  isPresent,
  canGroupRoomAction,
  touchGroupPresence,
  randomUUID,
  infoLog,
  warnLog,
  errorLog,
});

export function getRoomCountForTests() {
  return rooms.size;
}

export function getVoiceRoomCountForTests() {
  return voiceRooms.size;
}

export function getWebsocketServerForTests() {
  return websocketServer;
}

export function getEventGatewayForTests() {
  return eventGateway;
}

export function closeDatabaseForTests() {
  if (database?.open) database.close();
  if (maintenanceDatabasePool) return maintenanceDatabasePool.end();
  return undefined;
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
