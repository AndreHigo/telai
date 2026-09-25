export function createAuthRoutes({
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
}) {
  return async function handleAuthRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/auth/providers" && request.method === "GET") {
      json(response, 200, { google: Boolean(oauthProvider("google")), discord: Boolean(oauthProvider("discord")) });
      return true;
    }

    if (requestUrl.pathname === "/api/auth/session" && request.method === "GET") {
      json(response, 200, { user: await userWithLinkedAccounts(await currentUser(request)) });
      return true;
    }

    if (requestUrl.pathname === "/api/auth/consent" && request.method === "POST") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const origin = String(request.headers.origin || "").trim();
      if (origin) {
        let sameOrigin = false;
        try { sameOrigin = new URL(origin).origin === publicOriginForRequest(request); } catch {}
        if (!sameOrigin) {
          json(response, 403, { error: "Origem não permitida." });
          return true;
        }
      }
      try {
        const body = await readJson(request);
        if (body.termsAccepted !== true || body.privacyAccepted !== true) return json(response, 400, { error: "É necessário aceitar os dois documentos." });
        await recordLegalConsents(user.id);
        return json(response, 200, { legal: await legalConsentStatus(user.id) });
      } catch {
        json(response, 400, { error: "Não foi possível registrar seu aceite." });
      }
      return true;
    }

    if (requestUrl.pathname === "/api/account/export" && request.method === "GET") {
      const user = await requireUser(request, response);
      if (!user) return true;
      try {
        const exportData = await userDataExport(user.id);
        if (!exportData) {
          json(response, 404, { error: "Conta não encontrada." });
          return true;
        }
        const body = JSON.stringify(exportData, null, 2);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="telai-dados-${new Date().toISOString().slice(0, 10)}.json"`,
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
          "X-Content-Type-Options": "nosniff",
        }).end(body);
      } catch (error) {
        errorLog("account_export_error", { error: error.message });
        json(response, 500, { error: "Não foi possível gerar sua exportação." });
      }
      return true;
    }

    if (requestUrl.pathname === "/api/account/delete" && request.method === "POST") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const origin = String(request.headers.origin || "").trim();
      if (origin) {
        let sameOrigin = false;
        try { sameOrigin = new URL(origin).origin === publicOriginForRequest(request); } catch {}
        if (!sameOrigin) {
          json(response, 403, { error: "Origem não permitida." });
          return true;
        }
      }
      try {
        const body = await readJson(request);
        const confirmation = String(body.confirmation || "").trim();
        const expected = `EXCLUIR ${user.username.toUpperCase()}`;
        if (confirmation !== expected) return json(response, 400, { error: `Digite exatamente: ${expected}` });
        await deleteUserAccount(user.id);
        response.setHeader("Set-Cookie", expiredSessionCookie(request));
        return json(response, 200, { ok: true });
      } catch (error) {
        if (error.message === "account-not-found") return json(response, 404, { error: "Conta não encontrada." });
        errorLog("account_delete_error", { error: error.message });
        json(response, 500, { error: "Não foi possível excluir sua conta." });
      }
      return true;
    }

    if (requestUrl.pathname === "/api/auth/register" && request.method === "POST") {
      try {
        const body = await readJson(request);
        const username = normalizeUsername(body.username);
        const displayName = String(body.displayName || username).trim().slice(0, 48);
        const password = String(body.password || "");
        if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) return json(response, 400, { error: "Use um usuário de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado." });
        if (displayName.length < 2) return json(response, 400, { error: "Informe um nome para exibição." });
        if (password.length < 8 || password.length > 128) return json(response, 400, { error: "A senha deve ter entre 8 e 128 caracteres." });
        if (body.termsAccepted !== true || body.privacyAccepted !== true) return json(response, 400, { error: "Leia e aceite os Termos de Uso e a Política de Privacidade para criar sua conta." });
        const user = { id: randomUUID(), username, displayName };
        try {
          const now = new Date().toISOString();
          await createUserWithConsents({ id: user.id, username: user.username, displayName: user.displayName, passwordHash: hashPassword(password), createdAt: now, createUser: userProfileRepository.createUser });
        } catch (error) {
          if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Esse nome de usuário já está em uso." });
          throw error;
        }
        await createSession(user.id, request, response);
        return json(response, 201, { user: { ...user, avatarData: null, linkedAccounts: [], legal: await legalConsentStatus(user.id) } });
      } catch (error) {
        json(response, 400, { error: error.message === "body-too-large" ? "Dados inválidos." : "Não foi possível criar a conta." });
      }
      return true;
    }

    if (requestUrl.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        const body = await readJson(request);
        const username = normalizeUsername(body.username);
        const password = String(body.password || "");
        const failureRetryAfter = loginIsBlocked(request, username);
        if (failureRetryAfter) {
          response.setHeader("Retry-After", String(failureRetryAfter));
          return json(response, 429, { error: "Muitas tentativas de login. Aguarde antes de tentar novamente.", retryAfter: failureRetryAfter });
        }
        if (!allowLoginAttempt(request, username)) {
          const retryAfter = Math.max(1, Math.ceil((loginRate.get(clientIp(request))?.startedAt + loginRateWindowMs - Date.now()) / 1000));
          response.setHeader("Retry-After", String(retryAfter));
          return json(response, 429, { error: "Muitas tentativas de login. Aguarde um minuto e tente novamente.", retryAfter });
        }
        const row = await userProfileRepository.findCredentialsByUsername(username);
        if (!row || !passwordMatches(password, row.passwordHash)) {
          recordLoginFailure(request, username);
          return json(response, 401, { error: "Usuário ou senha incorretos." });
        }
        clearLoginFailure(request, username);
        await createSession(row.id, request, response);
        return json(response, 200, { user: await userWithLinkedAccounts({ id: row.id, username: row.username, displayName: row.displayName, avatarData: row.avatarData }) });
      } catch {
        json(response, 400, { error: "Não foi possível entrar." });
      }
      return true;
    }

    if (requestUrl.pathname === "/api/auth/logout" && request.method === "POST") {
      const token = parseCookies(request).mirante_session;
      await sessionRepository.deleteByToken(token);
      response.setHeader("Set-Cookie", expiredSessionCookie(request));
      json(response, 200, { ok: true });
      return true;
    }

    return false;
  };
}
