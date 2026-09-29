import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID, timingSafeEqual, createHmac } from "node:crypto";
import { sendEmail, sendGroupInviteEmail, smtpStatus, verifySmtp } from "./mailer.mjs";
import { createRuntimeConfig } from "./server/config/runtime.mjs";
import { createDatabaseConfig } from "./server/config/database.mjs";
import { createRuntimeLimits } from "./server/config/limits.mjs";
import { createWebsocketGateway } from "./server/gateway/websocket.mjs";
import { createSocketSender } from "./server/gateway/socket-sender.mjs";
import { createEventGateway } from "./server/gateway/events.mjs";
import { createGatewayPolicy } from "./server/gateway/policy.mjs";
import { createGatewayMessageDispatcher } from "./server/gateway/message-dispatcher.mjs";
import { createBinaryMessageHandler } from "./server/gateway/binary-message.mjs";
import { createVoiceMessageHandler } from "./server/gateway/voice-message-handler.mjs";
import { createBroadcastMessageHandler } from "./server/gateway/broadcast-message-handler.mjs";
import { createBroadcastRuntime } from "./server/gateway/broadcast-runtime.mjs";
import { createIceConfiguration } from "./server/media/ice-configuration.mjs";
import { createAttachmentStorage } from "./server/media/attachment-storage.mjs";
import { createAttachmentScanner } from "./server/media/attachment-scanner.mjs";
import { createAuthRuntime } from "./server/auth/runtime.mjs";
import { createRequireUser } from "./server/auth/guards.mjs";
import { hashPassword, hashSessionToken } from "./server/auth/crypto.mjs";
import { createStreamRuntime } from "./server/domain/streams/runtime.mjs";
import { createVoiceRuntime } from "./server/domain/voice/runtime.mjs";
import { createNotificationSyncService } from "./server/services/notification-sync.mjs";
import { createPostgresNotificationSyncService } from "./server/services/postgres-notification-sync.mjs";
import { createNotificationRuntime, liveNotificationContext } from "./server/notifications/runtime.mjs";
import { createNotificationService } from "./server/notifications/service.mjs";
import { createRuntimeCleanup } from "./server/services/runtime-cleanup.mjs";
import { createAttachmentLifecycle } from "./server/services/attachment-lifecycle.mjs";
import { createRuntimeRepositories } from "./server/database/runtime-repositories.mjs";
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
import { createGroupRoutesRuntime } from "./server/http/group-routes-runtime.mjs";
import { createMediaRoutes } from "./server/http/media-routes.mjs";
import { createOAuthRoutes } from "./server/http/oauth-routes.mjs";
import { createStaticRoutes } from "./server/http/static-routes.mjs";
import { createStreamRoutes } from "./server/http/stream-routes.mjs";
import { createApplicationRoutes } from "./server/http/application-routes.mjs";
import { clientIp, publicOriginForRequest, trustedForwardedHeaders } from "./server/http/request-context.mjs";
import { createObservabilityRuntime } from "./server/observability/runtime.mjs";
import { createObservabilitySnapshot } from "./server/observability/snapshot.mjs";
import { parseVoiceRoomParticipantLimit, roomSlugFor, slugFor } from "./server/domain/groups/normalization.mjs";
import { normalizePreferenceDeviceId, normalizePreferenceVolume, normalizeUsername, parseChannelGames, safePreferenceColor } from "./server/shared/validation.mjs";
import { compactAvatarData, compactUserSummary } from "./server/shared/presentation.mjs";

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
  sfu,
  requireLogin,
  hostReconnectGraceMs,
  streamOrphanGraceMs,
  dataDir,
  databasePath,
  legalPolicyVersion,
  desktopArtifactName,
  desktopArtifactPath,
  desktopReleaseDir,
  attachmentStorageMode,
  attachmentStorageRoot,
  attachmentScanCommand,
  attachmentScanTimeoutMs,
  attachmentOrphanGraceMs,
  attachmentCleanupIntervalMs,
  attachmentCleanupMaxDeletes,
  attachmentS3,
  logLevels,
  logLevel,
  logPath,
} = createRuntimeConfig({ rootDir: __dirname, packageVersion: packageMetadata.version });
const databaseConfig = createDatabaseConfig();
const databaseDriver = databaseConfig.driver;
const siteAdminUserIds = new Set(String(process.env.TELAI_ADMIN_USER_IDS || "")
  .split(",").map((value) => value.trim()).filter(Boolean));
const siteAdminUsernames = new Set(String(process.env.TELAI_ADMIN_USERNAMES || "")
  .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
const maintenanceToken = String(process.env.TELAI_MAINTENANCE_TOKEN || process.env.MIRANTE_MAINTENANCE_TOKEN || "").trim();
// A versão identifica exatamente qual texto jurídico foi aceito pelo titular.
// Ela pode ser trocada no ambiente quando uma nova política entrar em vigor.
const rooms = new Map();
const voiceRooms = new Map();
const groupPresence = new Map();
let eventGateway = null;
const oauthStates = new Map();
const observabilityRuntime = createObservabilityRuntime({ fs, path, logPath, logLevels, logLevel });
const {
  observability,
  hasLogFile,
  debugLog,
  infoLog,
  warnLog,
  errorLog,
  metricRoute,
  addMapCount,
  addResponseBytes,
  isLocalObservabilityRequest,
} = observabilityRuntime;
const send = createSocketSender({ errorLog });
const {
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
  websocketTextMessageMaxBytes,
  relayChunkMaxBytes,
  relayRecentBytesMax,
  rtcSignalPayloadMaxBytes,
  rtcSignalRateWindowMs,
  rtcSignalRateLimit,
  voiceSpeakingRateWindowMs,
  voiceSpeakingRateLimit,
  voiceRoomMinParticipants,
  voiceRoomMaxParticipants,
  maxOAuthStates,
  maxAvatarUploadLength,
} = createRuntimeLimits();

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

const observabilitySnapshot = createObservabilitySnapshot({
  observability,
  mediaMode,
  requireLogin,
  rooms,
  voiceRooms,
  logLevel,
  hasLogFile,
  downloadRateLimitPerMinute,
  downloadRate,
  clientErrorRateLimitPerMinute,
  clientErrorRate,
  apiRateLimitPerMinute,
  apiWriteRateLimitPerMinute,
  apiGlobalRateLimitPerMinute,
  apiRate,
  apiWriteRate,
  apiGlobalRate,
  registerRate,
  oauthRate,
  loginRateLimitPerMinute,
  loginFailureLimit,
  loginFailureIpLimit,
  loginFailureWindowMs,
  loginFailures,
  websocketConnectionRateLimit,
  websocketActiveConnectionLimit,
  websocketConnectionRate,
});

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

const repositories = createRuntimeRepositories({
  databaseDriver,
  databaseConfig,
  databasePath,
  dataDir,
  legalPolicyVersion,
  randomUUID,
  hashSessionToken,
  compactAvatarData,
  compactUserSummary,
  parseChannelGames,
  normalizePreferenceVolume,
  slugFor,
  createPasswordHash: () => hashPassword(randomBytes(48).toString("base64url")),
});
const {
  database,
  maintenanceDatabasePool,
  maintenanceSqliteDatabase,
  groupRoomPermissionRepository,
  isGroupMember,
  ensureGroupPermissionRow,
  groupPermissions,
  canGroupAction,
  canGroupRoomAction,
  directConversationRepository,
  sessionRepository,
  userWithLinkedAccounts,
  legalConsentStatus,
  recordLegalConsents,
  createUserWithConsents,
  notificationRepository,
  socialRepository,
  channelProfileRepository,
  userPreferenceRepository,
  streamRepository,
  accountRepository,
  groupSetupRepository,
  groupMessageRepository,
  groupAttachmentRepository,
  groupWebhookRepository,
  applicationRepository,
  applicationInteractionRepository,
  groupRoomReadRepository,
  groupRepository,
  groupModerationRepository,
  groupInviteRepository,
  groupJoinRequestRepository,
  groupRoleRepository,
  groupRoomRepository,
  groupAuditRepository,
  groupPermissionRepository,
  groupMemberRepository,
  groupSettingsRepository,
  userProfileRepository,
  siteAdminRepository,
  maintenanceRepository,
  upsertOAuthUser,
  linkOAuthAccount,
} = repositories;
const { directConversationForUser, directConversationPayload } = directConversationRepository;
const { createNotification: persistNotification } = notificationRepository;
const { createNotification } = createNotificationService({
  persistNotification,
  publishUserEvent: (userId, event) => eventGateway?.publishUserEvent(userId, event),
});
let currentUserAsync;
const requireUser = createRequireUser({
  currentUser: (...args) => currentUserAsync(...args),
  json,
});
const handleDirectRoutes = createDirectRoutes({
  json,
  readJson,
  requireUser,
  directConversationRepository,
  directConversationForUser,
  directConversationPayload,
  isBlocked: socialRepository.isBlocked,
  createNotification,
  errorLog,
});
const { channelProfileForUser } = channelProfileRepository;
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
const notificationSyncServiceFactory = databaseDriver === "postgres" ? createPostgresNotificationSyncService : createNotificationSyncService;
const notificationSyncService = notificationSyncServiceFactory(database, {
  getNotificationScope: async (userId) => (await userPreferenceRepository.getPreferences(userId)).liveNotificationScope,
  isStreamLive: runtimeStreamIsLive,
  createLiveContext: liveNotificationContext,
  createNotification,
});
const { liveNotificationPresentation, syncNotificationsForUser } = createNotificationRuntime({
  notificationSyncService,
  canAccessStream,
});
const handleSocialRoutes = createSocialRoutes({ json, requireUser, socialRepository, createNotification });
const attachmentStorage = createAttachmentStorage({ mode: attachmentStorageMode, localRootDir: attachmentStorageRoot, s3: attachmentS3 });
const attachmentScanner = createAttachmentScanner({ command: attachmentScanCommand, timeoutMs: attachmentScanTimeoutMs, tempDir: dataDir });
const attachmentLifecycle = createAttachmentLifecycle({
  groupAttachmentRepository,
  attachmentStorage,
  errorLog,
  infoLog,
  orphanGraceMs: attachmentOrphanGraceMs,
  maxDeletesPerRun: attachmentCleanupMaxDeletes,
});
const attachmentUrlFor = (groupId, attachmentId) => `/api/groups/${encodeURIComponent(groupId)}/attachments/${encodeURIComponent(attachmentId)}`;
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

const {
  disconnectGroupUser,
  handleGroupDiscoveryRoutes,
  handleGroupManagementRoutes,
  handleGroupRoleRoutes,
  handleGroupRoomRoutes,
  handleGroupAuditRoutes,
  handleGroupModerationRoutes,
  handleGroupContentRoutes,
  handleGroupWebhookRoutes,
  handleGroupInviteRoutes,
  handleGroupRuntimeRoutes,
} = createGroupRoutesRuntime({
  json,
  readJson,
  requireUser,
  groupPresence,
  groupRepository,
  groupSettingsRepository,
  groupMemberRepository,
  groupJoinRequestRepository,
  groupPermissionRepository,
  groupSetupRepository,
  groupRoleRepository,
  groupAuditRepository,
  groupModerationRepository,
  groupInviteRepository,
  groupMessageRepository,
  groupAttachmentRepository,
  groupWebhookRepository,
  groupRoomPermissionRepository,
  groupRoomRepository,
  groupRoomReadRepository,
  groupPermissions,
  isGroupMember,
  canGroupAction,
  canGroupRoomAction,
  attachmentStorage,
  attachmentScanner,
  attachmentUrlFor,
  streamRepository,
  runtimeStreamIsLive,
  streamPublicPath,
  compactAvatarData,
  compactUserSummary,
  parseChannelGames,
  slugFor,
  roomSlugFor,
  parseVoiceRoomParticipantLimit,
  createNotification,
  sendGroupInviteEmail,
  publicOriginForRequest,
  warnLog,
  randomBytes,
  hashToken: hashSessionToken,
  createToken: () => randomBytes(32).toString("base64url"),
  voiceRooms,
  send,
  leaveVoiceRoom,
  voiceParticipantFor,
  touchGroupPresence,
  isPresent,
  disconnectUserFromGroup: (...args) => eventGateway?.disconnectUserFromGroup(...args),
  publishGroupPresence: (...args) => eventGateway?.publishGroupPresence(...args),
  publishGroupEvent: (...args) => eventGateway?.publishGroupEvent(...args),
});
const handleApplicationRoutes = createApplicationRoutes({
  json,
  readJson,
  requireUser,
  applicationRepository,
  applicationInteractionRepository,
  groupSettingsRepository,
  groupMessageRepository,
  isGroupMember,
  canGroupRoomAction,
  hashToken: hashSessionToken,
  createToken: () => randomBytes(32).toString("base64url"),
  createPasswordHash: () => hashPassword(randomBytes(48).toString("base64url")),
  publishGroupEvent: (...args) => eventGateway?.publishGroupEvent(...args),
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
  currentUserAsync: resolvedCurrentUserAsync,
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
currentUserAsync = resolvedCurrentUserAsync;
const handleStreamRoutes = createStreamRoutes({
  json,
  readJson,
  requireUser,
  currentUser: currentUserAsync,
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
const iceConfiguration = createIceConfiguration({ randomUUID, createHmac });
const handleMediaRoutes = createMediaRoutes({ iceConfiguration, mediaMode, sfu, databaseDriver, requireLogin, publicOriginForRequest });
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
const handleUserSettingsRoutes = createUserSettingsRoutes({
  json,
  readJson,
  requireUser,
  currentUser: currentUserAsync,
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
  currentUser: currentUserAsync,
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
  currentUser: currentUserAsync,
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
const runtimeCleanup = createRuntimeCleanup({
  oauthStates,
  groupPresence,
  sessionRepository,
  attachmentLifecycle,
  errorLog,
  attachmentIntervalMs: attachmentCleanupIntervalMs,
});
runtimeCleanup.start();

const handleAuthRoutes = createAuthRoutes({
  json,
  readJson,
  requireUser,
  currentUser: currentUserAsync,
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
  currentUser: currentUserAsync,
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
  currentUser: currentUserAsync,
});
const handleObservabilityRoutes = createObservabilityRoutes({
  json,
  readJson,
  isLocalObservabilityRequest,
  observabilitySnapshot,
  allowClientErrorRequest,
  currentUser: currentUserAsync,
  addMapCount,
  observability,
  routineClientDiagnosticKinds,
  infoLog,
  errorLog,
  warnLog,
});

await groupSetupRepository.initializeExistingGroups();

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
  handleApplicationRoutes,
  handleGroupContentRoutes,
  handleGroupWebhookRoutes,
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
  currentUser: currentUserAsync,
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
  currentUser: currentUserAsync,
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
  enqueueApplicationEvent: (...args) => applicationRepository?.enqueueGroupEvent(...args),
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

export async function closeDatabaseForTests() {
  const closers = [];
  if (databaseDriver === "postgres") closers.push(database.end());
  else if (database?.open) database.close();
  if (maintenanceSqliteDatabase?.open) maintenanceSqliteDatabase.close();
  if (maintenanceDatabasePool) closers.push(maintenanceDatabasePool.end());
  await Promise.all(closers);
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
