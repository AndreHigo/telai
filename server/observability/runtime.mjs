import { isLoopback } from "../http/request-context.mjs";

export function createObservabilityRuntime({ fs, path, logPath, logLevels, logLevel }) {
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
    if (chunk == null) return 0;
    if (typeof chunk === "string") return Buffer.byteLength(chunk);
    if (Buffer.isBuffer(chunk)) return chunk.length;
    if (ArrayBuffer.isView(chunk)) return chunk.byteLength;
    return 0;
  }

  function isLocalObservabilityRequest(request) {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    return !forwarded && isLoopback(request.socket.remoteAddress);
  }

  return {
    observability,
    hasLogFile: () => Boolean(logFileStream),
    debugLog: (event, fields) => logEvent("debug", event, fields),
    infoLog: (event, fields) => logEvent("info", event, fields),
    warnLog: (event, fields) => logEvent("warn", event, fields),
    errorLog: (event, fields) => logEvent("error", event, fields),
    metricRoute,
    addMapCount,
    addResponseBytes,
    isLocalObservabilityRequest,
  };
}
