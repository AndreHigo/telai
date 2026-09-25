import path from "node:path";

const DEFAULT_LOG_LEVELS = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

export function createRuntimeConfig({ rootDir, packageVersion = "0.0.0", env = process.env } = {}) {
  if (!rootDir) throw new Error("rootDir is required");

  const defaultPort = Number(env.PORT || 8787);
  const defaultHost = env.HOST || "127.0.0.1";
  const mediaMode = env.MEDIA_MODE === "relay" ? "relay" : "p2p";
  const requireLogin = env.REQUIRE_LOGIN !== "false";
  const hostReconnectGraceMs = Math.max(15_000, Number(env.HOST_RECONNECT_GRACE_MS || 45_000));
  const streamOrphanGraceMs = Math.max(60_000, Number(env.MIRANTE_STREAM_ORPHAN_GRACE_MS || 120_000));
  const dataDir = path.join(rootDir, "data");
  const databasePath = env.MIRANTE_DB_PATH || path.join(dataDir, "mirante-tv.sqlite");
  const legalPolicyVersion = String(env.TELAI_LEGAL_POLICY_VERSION || "2026-09-08").trim();
  const desktopArtifactName = env.MIRANTE_DESKTOP_ARTIFACT_NAME || `Telai-Setup-${packageVersion}.exe`;
  const desktopArtifactPath = env.MIRANTE_DESKTOP_ARTIFACT_PATH || path.join(rootDir, "release", desktopArtifactName);
  const desktopReleaseDir = path.join(rootDir, "release");
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
    logLevels: DEFAULT_LOG_LEVELS,
    logLevel,
    logPath,
  });
}
