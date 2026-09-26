import path from "node:path";
import { normalizeMediaMode } from "../../shared/media-contract.mjs";

const DEFAULT_LOG_LEVELS = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

export function createRuntimeConfig({ rootDir, packageVersion = "0.0.0", env = process.env } = {}) {
  if (!rootDir) throw new Error("rootDir is required");

  const defaultPort = Number(env.PORT || 8787);
  const defaultHost = env.HOST || "127.0.0.1";
  const mediaMode = normalizeMediaMode(env.MEDIA_MODE);
  const requireLogin = env.REQUIRE_LOGIN !== "false";
  const hostReconnectGraceMs = Math.max(15_000, Number(env.HOST_RECONNECT_GRACE_MS || 45_000));
  const streamOrphanGraceMs = Math.max(60_000, Number(env.MIRANTE_STREAM_ORPHAN_GRACE_MS || 120_000));
  const dataDir = path.join(rootDir, "data");
  const databasePath = env.MIRANTE_DB_PATH || path.join(dataDir, "mirante-tv.sqlite");
  const legalPolicyVersion = String(env.TELAI_LEGAL_POLICY_VERSION || "2026-09-08").trim();
  const desktopArtifactName = env.MIRANTE_DESKTOP_ARTIFACT_NAME || `Telai-Setup-${packageVersion}.exe`;
  const desktopArtifactPath = env.MIRANTE_DESKTOP_ARTIFACT_PATH || path.join(rootDir, "release", desktopArtifactName);
  const desktopReleaseDir = path.join(rootDir, "release");
  const attachmentStorageMode = String(env.TELAI_ATTACHMENT_STORAGE || "local").trim().toLowerCase();
  if (!["local", "s3"].includes(attachmentStorageMode)) throw new Error("attachment-storage-mode-invalid");
  const attachmentStorageRoot = env.TELAI_ATTACHMENT_DIR || path.join(dataDir, "attachments");
  const attachmentScanCommand = String(env.TELAI_ATTACHMENT_SCAN_COMMAND || "").trim();
  const attachmentScanTimeoutMs = Math.max(1_000, Number(env.TELAI_ATTACHMENT_SCAN_TIMEOUT_MS || 15_000));
  const attachmentOrphanGraceMs = Math.max(60_000, Number(env.TELAI_ATTACHMENT_ORPHAN_GRACE_MS || 24 * 60 * 60_000));
  const attachmentCleanupIntervalMs = Math.max(60_000, Number(env.TELAI_ATTACHMENT_CLEANUP_INTERVAL_MS || 15 * 60_000));
  const attachmentCleanupMaxDeletes = Math.max(1, Number(env.TELAI_ATTACHMENT_CLEANUP_MAX_DELETES || 100));
  const attachmentS3 = Object.freeze({
    endpoint: String(env.TELAI_S3_ENDPOINT || "").trim(),
    bucket: String(env.TELAI_S3_BUCKET || "").trim(),
    region: String(env.TELAI_S3_REGION || "us-east-1").trim(),
    accessKeyId: String(env.TELAI_S3_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(env.TELAI_S3_SECRET_ACCESS_KEY || ""),
    prefix: String(env.TELAI_S3_PREFIX || "telai/").trim(),
    forcePathStyle: String(env.TELAI_S3_FORCE_PATH_STYLE || "true").toLowerCase() !== "false",
    timeoutMs: Math.max(1_000, Number(env.TELAI_S3_TIMEOUT_MS || 10_000)),
  });
  const configuredLogLevel = String(env.MIRANTE_LOG_LEVEL || (env.MIRANTE_DEBUG === "1" ? "debug" : "info")).trim().toLowerCase();
  const logLevel = Object.hasOwn(DEFAULT_LOG_LEVELS, configuredLogLevel) ? configuredLogLevel : "info";
  const logPath = String(env.MIRANTE_LOG_PATH || "").trim();

  return Object.freeze({
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
    attachmentStorageMode,
    attachmentStorageRoot,
    attachmentScanCommand,
    attachmentScanTimeoutMs,
    attachmentOrphanGraceMs,
    attachmentCleanupIntervalMs,
    attachmentCleanupMaxDeletes,
    attachmentS3,
    logLevels: DEFAULT_LOG_LEVELS,
    logLevel,
    logPath,
  });
}
