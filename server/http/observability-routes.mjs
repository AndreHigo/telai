export function createObservabilityRoutes({
  json,
  readJson,
  isLocalObservabilityRequest,
  observabilitySnapshot,
  allowClientErrorRequest,
  currentUser,
  addMapCount,
  observability,
  routineClientDiagnosticKinds,
  infoLog,
  errorLog,
  warnLog,
}) {
  return async function handleObservabilityRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/metrics") {
      if (!isLocalObservabilityRequest(request)) {
        json(response, 404, { error: "Not found" });
        return true;
      }
      json(response, 200, observabilitySnapshot());
      return true;
    }

    if (requestUrl.pathname === "/api/client-errors" && request.method === "POST") {
      if (!allowClientErrorRequest(request)) {
        response.setHeader("Retry-After", "60");
        json(response, 429, { error: "Muitos diagnósticos. Tente novamente em um minuto." });
        return true;
      }
      try {
        const body = await readJson(request, 12 * 1024);
        const user = await currentUser(request);
        const kind = String(body.kind || "client_error").replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 64) || "client_error";
        addMapCount(observability.clientEventCounts, kind);
        const clientDiagnostic = {
          kind,
          message: String(body.message || "Erro sem mensagem").slice(0, 240),
          stack: String(body.stack || "").slice(0, 1200),
          route: String(body.route || request.headers.referer || "").split("?", 1)[0].slice(0, 240),
          appVersion: String(body.appVersion || "").slice(0, 32),
          context: body.context && typeof body.context === "object" ? body.context : {},
          authenticated: Boolean(user),
        };
        const isViewerTelemetry = kind.startsWith("viewer_")
          && !kind.includes("error")
          && !kind.includes("timeout")
          && !kind.endsWith("_stalled")
          && !kind.endsWith("_ended")
          && !kind.endsWith("_closed")
          && !kind.includes("recovery_started");
        const isRoutineClientTelemetry = routineClientDiagnosticKinds.has(kind);
        // Telemetria rotineira já é contabilizada em clientEventCounts, mas
        // não deve escrever uma linha de log por amostra. Em salas de voz,
        // voice_rtc_quality chega a cada 10s por cliente e por participante;
        // persistir cada payload gera I/O e ruído proporcionais ao tamanho
        // da sala. Falhas reais continuam no log de erro.
        if (!isViewerTelemetry && !isRoutineClientTelemetry) errorLog("client_error", clientDiagnostic);
        json(response, 202, { ok: true });
      } catch (error) {
        warnLog("client_error_rejected", { error: error.message });
        json(response, 400, { error: "Diagnóstico inválido." });
      }
      return true;
    }

    return false;
  };
}
