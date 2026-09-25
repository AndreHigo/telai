export function createOAuthRoutes({
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
}) {
  return async function handleOAuthRoutes(request, response, requestUrl) {
    const oauthStartMatch = requestUrl.pathname.match(/^\/api\/auth\/(google|discord)$/);
    if (oauthStartMatch && request.method === "GET") {
      const providerName = oauthStartMatch[1];
      const provider = oauthProvider(providerName);
      if (!provider) {
        oauthErrorRedirect(response, "provider-not-configured");
        return true;
      }
      const linkMode = requestUrl.searchParams.get("mode") === "link";
      const linkingUser = linkMode ? await currentUser(request) : null;
      if (linkMode && !linkingUser) {
        response.writeHead(302, { Location: "/login?auth_error=login-required" }).end();
        return true;
      }
      const now = Date.now();
      for (const [key, entry] of oauthStates) {
        if (!entry || entry.expiresAt <= now) oauthStates.delete(key);
      }
      if (oauthStates.size >= maxOAuthStates) {
        warnLog("oauth_state_capacity_reached", { provider: providerName, states: oauthStates.size });
        oauthErrorRedirect(response, "oauth-temporarily-unavailable");
        return true;
      }
      const state = randomBytes(32).toString("base64url");
      const verifier = randomBytes(48).toString("base64url");
      oauthStates.set(hashSessionToken(state), { provider: providerName, verifier, mode: linkMode ? "link" : "login", userId: linkingUser?.id || null, expiresAt: Date.now() + 10 * 60 * 1000 });
      const authorizationUrl = new URL(provider.authorizationEndpoint);
      authorizationUrl.search = new URLSearchParams({
        client_id: provider.clientId,
        redirect_uri: oauthRedirectUri(providerName, request),
        response_type: "code",
        scope: provider.scope,
        state,
        code_challenge: pkceChallenge(verifier),
        code_challenge_method: "S256",
        ...(providerName === "google" ? { access_type: "online", prompt: "select_account" } : {}),
      });
      response.setHeader("Set-Cookie", oauthStateCookie(hashSessionToken(state), request));
      response.writeHead(302, { Location: authorizationUrl.toString() }).end();
      return true;
    }

    const oauthCallbackMatch = requestUrl.pathname.match(/^\/api\/auth\/(google|discord)\/callback$/);
    if (oauthCallbackMatch && request.method === "GET") {
      const providerName = oauthCallbackMatch[1];
      const state = String(requestUrl.searchParams.get("state") || "");
      const stateHash = hashSessionToken(state);
      const stateCookie = parseCookies(request).mirante_oauth_state;
      const stateData = oauthStates.get(stateHash);
      oauthStates.delete(stateHash);
      response.setHeader("Set-Cookie", oauthStateCookie("", request, 0));
      if (requestUrl.searchParams.get("error")) {
        oauthErrorRedirect(response, "provider-cancelled");
        return true;
      }
      if (!state || !stateData || stateData.provider !== providerName || stateData.expiresAt < Date.now() || stateCookie !== stateHash) {
        oauthErrorRedirect(response, "invalid-oauth-state");
        return true;
      }
      const code = String(requestUrl.searchParams.get("code") || "");
      if (!code) {
        oauthErrorRedirect(response, "missing-oauth-code");
        return true;
      }
      try {
        const identity = await fetchOAuthIdentity(providerName, code, stateData.verifier, request);
        if (stateData.mode === "link") {
          const linkingUser = await currentUser(request);
          if (!linkingUser || linkingUser.id !== stateData.userId) throw new Error("oauth-link-session-invalid");
          const linkResult = await linkOAuthAccount(providerName, identity, linkingUser.id);
          const linkQuery = new URLSearchParams({ account: "1", linked: providerName });
          if (linkResult.suggestedDisplayName && linkResult.suggestedDisplayName !== linkResult.currentDisplayName) linkQuery.set("name", linkResult.suggestedDisplayName);
          response.writeHead(302, { Location: `/?${linkQuery.toString()}` }).end();
          return true;
        }
        const user = await upsertOAuthUser(providerName, identity);
        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await sessionRepository.create({ userId: user.id, token, expiresAt, createdAt: new Date().toISOString() });
        response.setHeader("Set-Cookie", [sessionCookie(token, request), oauthStateCookie("", request, 0)]);
        response.writeHead(302, { Location: "/" }).end();
        return true;
      } catch (error) {
        console.error(`OAuth ${providerName} callback failed:`, error.message);
        const errorCode = ["oauth-account-linked", "oauth-email-linked-other-account", "oauth-link-session-invalid", "oauth-provider-conflict", "oauth-merge-user-missing"].includes(error.message) ? error.message : "oauth-login-failed";
        oauthErrorRedirect(response, errorCode, { provider: providerName });
        return true;
      }
    }

    return false;
  };
}
