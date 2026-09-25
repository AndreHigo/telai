function topRoutes(map) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 50)
    .map(([route, value]) => ({ route, value }));
}

export function createObservabilitySnapshot({
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
  uptime = () => process.uptime(),
} = {}) {
  return function observabilitySnapshot() {
    return {
      ok: true,
      startedAt: observability.startedAt,
      uptimeSeconds: Math.round(uptime()),
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
      logging: { level: logLevel, file: hasLogFile(), recentEvents: observability.recentEvents.slice(-50) },
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
  };
}
