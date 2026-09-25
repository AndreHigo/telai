import { createHash } from "node:crypto";
import { passwordMatches } from "./crypto.mjs";

export function createAuthRuntime({
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
  getWebsocketServer,
}) {
  function parseCookies(request) {
    return Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [];
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try { return [name, decodeURIComponent(value)]; } catch { return []; }
    }).filter((entry) => entry.length));
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
    const websocketServer = getWebsocketServer();
    if (!websocketServer) return;
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

  return {
    allowLoginAttempt,
    clearLoginFailure,
    createSession,
    currentUser,
    deleteUserAccount,
    expiredSessionCookie,
    fetchOAuthIdentity,
    hashSessionToken,
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
  };
}
