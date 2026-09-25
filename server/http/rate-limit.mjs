export function createHttpRateLimit({
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
  groupOverviewRateLimitPerMinute,
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
}) {
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

  function apiRateLimitScope(pathname) {
    // IDs do Telai são UUIDs e hashes longos. Normalizá-los impede que alguém
    // contorne o limite criando uma chave diferente para cada grupo ou convite.
    return String(pathname || "/")
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,40}(?=\/|$)/gi, "/:id")
      .replace(/\/[a-z0-9_-]{20,128}(?=\/|$)/gi, "/:id");
  }

  function apiRateLimitPolicy(request, pathname) {
    if (pathname === "/healthz" || pathname === "/metrics") return null;
    const isApi = pathname === "/api" || pathname.startsWith("/api/") || ["/ice-config", "/runtime-config"].includes(pathname);
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

  return {
    allowClientErrorRequest,
    allowLargeArtifactRequest,
    consumeFixedWindow,
    enforceApiRateLimit,
    evictRateLimitEntries,
    pruneClientErrorRate,
    pruneDownloadRate,
    pruneRateMap,
  };
}
