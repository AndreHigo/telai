const ERROR_CODES = Object.freeze({
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  413: "payload_too_large",
  422: "unprocessable_entity",
  429: "too_many_requests",
  500: "internal_error",
  502: "bad_gateway",
  503: "service_unavailable",
});

export function errorCodeForStatus(status) {
  return ERROR_CODES[status] || "http_error";
}

function normalizeResponseBody(status, body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.error !== "string" || body.code) return body;
  return { ...body, code: errorCodeForStatus(status) };
}

export function json(response, status, body) {
  response
    .writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    })
    .end(JSON.stringify(normalizeResponseBody(status, body)));
  // Permite que rotas assíncronas usem `return json(...)` sem deixar o
  // dispatcher continuar até a resposta 404 da API.
  return true;
}

export async function readJson(request, maxLength = 16 * 1024) {
  let raw = "";
  for await (const part of request) {
    raw += part;
    if (Buffer.byteLength(raw, "utf8") > maxLength) throw new Error("body-too-large");
  }
  return JSON.parse(raw || "{}");
}
