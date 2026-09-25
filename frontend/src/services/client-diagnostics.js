export function createClientDiagnostics({
  routineKinds = [],
  getRoute,
  getAppVersion,
  getView,
  isDesktop,
  cooldownMs = 5_000,
  maxEntries = 128,
}) {
  const routineDiagnosticKinds = new Set(routineKinds);
  const lastSentAt = new Map();

  function shouldSend(kind) {
    const key = `${kind}:${getRoute()}`;
    const now = Date.now();
    const previous = lastSentAt.get(key) || 0;
    if (now - previous < cooldownMs) return false;
    lastSentAt.set(key, now);
    if (lastSentAt.size > maxEntries) {
      const oldestKey = lastSentAt.keys().next().value;
      if (oldestKey) lastSentAt.delete(oldestKey);
    }
    return true;
  }

  return function reportClientError(kind, error, context = {}) {
    const diagnosticKind = String(kind || "client_error").slice(0, 64);
    // Essas amostras são úteis durante diagnóstico local, mas não são falhas.
    // Enviá-las durante o uso normal transforma a fala em tráfego e logs.
    if (routineDiagnosticKinds.has(diagnosticKind)) return;
    if (!shouldSend(diagnosticKind)) return;
    const source = error instanceof Error ? error : new Error(String(error || "Erro sem mensagem"));
    const payload = {
      kind: diagnosticKind,
      message: String(source.message || "Erro sem mensagem").slice(0, 240),
      stack: String(source.stack || "").slice(0, 1200),
      route: getRoute(),
      appVersion: getAppVersion(),
      context: { ...context, view: getView(), isDesktop: isDesktop() },
    };
    try {
      void fetch("/api/client-errors", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
    } catch {}
  };
}
