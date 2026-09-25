import { normalizeApiPathname } from "./api-versioning.mjs";

export function createHttpRequestHandler({
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
}) {
  return async function handleHttpRequest(request, response) {
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
    if (!enforceApiRateLimit(request, response, normalizeApiPathname(requestUrl.pathname))) return;
    if (await handleHttpRoutes(request, response, requestUrl)) return;
  };
}
