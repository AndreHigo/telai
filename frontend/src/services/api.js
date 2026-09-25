const VERSIONED_API_PREFIX = "/api/v1";

/** @typedef {import("./api-types").ApiClientOptions} ApiClientOptions */
/** @typedef {import("./api-types").ApiClient} ApiClient */
/** @typedef {import("./api-types").ApiError} ApiError */
/** @typedef {import("./api-types").ApiRequestOptions} ApiRequestOptions */

/** @param {string} path @returns {string} */
function versionedApiPath(path) {
  const value = String(path || "");
  if (!value.startsWith("/api/")) return value;
  return `${VERSIONED_API_PREFIX}${value.slice("/api".length)}`;
}

/**
 * @param {ApiClientOptions} [options]
 * @returns {ApiClient}
 */
export function createApiClient({ reportError, fetchImpl = globalThis.fetch, timeoutMs = 12_000 } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is required");

  /**
   * @template T
   * @param {string} path
   * @param {ApiRequestOptions} [options]
   * @returns {Promise<T>}
   */
  return async function api(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(versionedApiPath(path), {
        ...options,
        signal: options.signal || controller.signal,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        /** @type {ApiError} */
        const error = /** @type {ApiError} */ (new Error(body.error || "Não foi possível concluir a ação."));
        error.status = response.status;
        error.code = body.code || "http_error";
        error.retryAfter = Number(body.retryAfter || response.headers.get("retry-after") || 0);
        throw error;
      }
      return body;
    } catch (error) {
      const caught = error instanceof Error ? error : new Error(String(error));
      // 429 é uma resposta esperada de proteção contra abuso. Não envie um
      // novo diagnóstico para a API a cada bloqueio, evitando alimentar o
      // próprio volume de requisições quando o usuário tenta novamente.
      if (/** @type {ApiError} */ (caught).status !== 429) {
        reportError?.("api_error", caught, { method: options.method || "GET", route: String(path).split("?", 1)[0] });
      }
      if (caught.name === "AbortError") throw new Error("O servidor demorou para responder. Tente novamente.");
      if (caught.name === "TypeError" && /failed to fetch|load failed|networkerror/i.test(String(caught.message || ""))) {
        throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
      }
      throw caught;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
