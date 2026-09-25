export function createAdminRoutes({
  json,
  readJson,
  requireMaintenanceOperator,
  requireSiteAdmin,
  activeMaintenanceNotice,
  maintenanceRepository,
  smtpStatus,
  verifySmtp,
  sendEmail,
  currentUser,
  infoLog,
  warnLog,
  errorLog,
  siteAdminSummary,
  siteAdminAccountsPage,
  siteAdminGroupsPage,
  siteAdminStreamsPage,
  siteAdminGroupMembersPage,
  siteAdminOverview,
}) {
  return async function handleAdminRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/maintenance" && request.method === "GET") {
      json(response, 200, { notice: await activeMaintenanceNotice() });
      return true;
    }

    if (requestUrl.pathname === "/api/admin/maintenance" && request.method === "POST") {
      const operator = await requireMaintenanceOperator(request, response);
      if (!operator) return true;
      try {
        const body = await readJson(request);
        const delaySeconds = Number(body.delaySeconds ?? 60);
        const durationSeconds = Number(body.durationSeconds ?? 600);
        if (!Number.isInteger(delaySeconds) || delaySeconds < 10 || delaySeconds > 3600) {
          return json(response, 400, { error: "O atraso precisa estar entre 10 e 3600 segundos." });
        }
        if (!Number.isInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 86_400) {
          return json(response, 400, { error: "A duração precisa estar entre 60 e 86400 segundos." });
        }
        const message = String(body.message || "O Telai será atualizado para aplicar melhorias. Salve seu trabalho e aguarde a reconexão.").trim().slice(0, 240);
        const now = Date.now();
        const startsAt = new Date(now + delaySeconds * 1000).toISOString();
        const expiresAt = new Date(now + (delaySeconds + durationSeconds) * 1000).toISOString();
        await maintenanceRepository.schedule({ message, startsAt, expiresAt, createdBy: operator.user?.id || null, createdAt: new Date(now).toISOString() }, new Date(now).toISOString());
        json(response, 201, { notice: await activeMaintenanceNotice() });
      } catch {
        json(response, 400, { error: "Não foi possível programar a manutenção." });
      }
      return true;
    }

    if (requestUrl.pathname === "/api/admin/maintenance" && request.method === "DELETE") {
      const operator = await requireMaintenanceOperator(request, response);
      if (!operator) return true;
      await maintenanceRepository.clear(new Date().toISOString());
      json(response, 200, { ok: true });
      return true;
    }

    if (requestUrl.pathname === "/api/admin/email/status" && request.method === "GET") {
      if (!await requireSiteAdmin(request, response)) return true;
      const smtp = requestUrl.searchParams.get("verify") === "1" ? await verifySmtp() : smtpStatus();
      json(response, 200, { smtp });
      return true;
    }

    if (requestUrl.pathname === "/api/admin/email/test" && request.method === "POST") {
      if (!await requireSiteAdmin(request, response)) return true;
      try {
        const body = await readJson(request, 4 * 1024);
        const recipient = String(body.to || "").trim();
        const result = await sendEmail({
          to: recipient,
          subject: "Teste de SMTP do Telai",
          text: "Este é um teste de envio SMTP do Telai. Se você recebeu esta mensagem, o relay está funcionando.",
          html: "<p>Este é um teste de envio SMTP do Telai.</p><p>Se você recebeu esta mensagem, o relay está funcionando.</p>",
        });
        infoLog("smtp_test_sent", { operatorId: (await currentUser(request))?.id || null, recipientDomain: recipient.split("@").pop() || "" });
        json(response, 200, { ok: true, smtp: smtpStatus(), messageId: result.messageId });
      } catch (error) {
        warnLog("smtp_test_failed", { errorCode: error?.code || "smtp-test-failed", error: error?.message || String(error) });
        json(response, 502, { error: "Não foi possível enviar o e-mail de teste.", code: error?.code || "smtp-test-failed" });
      }
      return true;
    }

    const adminPages = [
      ["/api/admin/summary", siteAdminSummary, "admin_summary_error", "Não foi possível carregar o resumo administrativo."],
      ["/api/admin/accounts", siteAdminAccountsPage, "admin_accounts_error", "Não foi possível carregar as contas administrativas."],
      ["/api/admin/groups", siteAdminGroupsPage, "admin_groups_error", "Não foi possível carregar os grupos administrativos."],
      ["/api/admin/streams", siteAdminStreamsPage, "admin_streams_error", "Não foi possível carregar as transmissões administrativas."],
      ["/api/admin/overview", siteAdminOverview, "admin_overview_error", "Não foi possível carregar o painel administrativo."],
    ];
    const adminPage = adminPages.find(([pathname]) => pathname === requestUrl.pathname);
    if (adminPage && request.method === "GET") {
      if (!await requireSiteAdmin(request, response)) return true;
      const [, handler, errorEvent, errorMessage] = adminPage;
      try {
        const payload = handler === siteAdminSummary || handler === siteAdminOverview ? await handler() : await handler(requestUrl);
        json(response, 200, payload);
      } catch (error) {
        errorLog(errorEvent, { error: error.message });
        json(response, 500, { error: errorMessage });
      }
      return true;
    }

    const adminMembersMatch = requestUrl.pathname.match(/^\/api\/admin\/groups\/([\w-]{1,128})\/members$/);
    if (adminMembersMatch && request.method === "GET") {
      if (!await requireSiteAdmin(request, response)) return true;
      try {
        const result = await siteAdminGroupMembersPage(requestUrl, adminMembersMatch[1]);
        if (!result) {
          json(response, 404, { error: "Grupo não encontrado." });
          return true;
        }
        json(response, 200, result);
      } catch (error) {
        errorLog("admin_group_members_error", { error: error.message });
        json(response, 500, { error: "Não foi possível carregar os membros do grupo." });
      }
      return true;
    }

    return false;
  };
}
