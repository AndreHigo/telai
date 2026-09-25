export function createApiClient({ reportError, fetchImpl = globalThis.fetch, timeoutMs = 12_000 } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is required");

  return async function api(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(path, {
        ...options,
        signal: options.signal || controller.signal,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.error || "Não foi possível concluir a ação.");
        error.status = response.status;
        error.retryAfter = Number(body.retryAfter || response.headers.get("retry-after") || 0);
        throw error;
      }
      return body;
    } catch (error) {
      // 429 é uma resposta esperada de proteção contra abuso. Não envie um
      // novo diagnóstico para a API a cada bloqueio, evitando alimentar o
      // próprio volume de requisições quando o usuário tenta novamente.
      if (error?.status !== 429) {
        reportError?.("api_error", error, { method: options.method || "GET", route: String(path).split("?", 1)[0] });
      }
      if (error?.name === "AbortError") throw new Error("O servidor demorou para responder. Tente novamente.");
      if (error?.name === "TypeError" && /failed to fetch|load failed|networkerror/i.test(String(error.message || ""))) {
        throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
