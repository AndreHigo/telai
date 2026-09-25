export function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function trustedForwardedHeaders(request) {
  // O app fica atrás do Caddy/Nginx local. Um cliente externo que alcance o
  // Node diretamente não pode escolher o IP, host ou protocolo encaminhado.
  return isLoopback(request?.socket?.remoteAddress);
}

export function clientIp(request) {
  const forwarded = trustedForwardedHeaders(request)
    ? String(request.headers["x-forwarded-for"] || "").split(",")[0].trim()
    : "";
  return forwarded || request.socket.remoteAddress || "unknown";
}

export function publicOriginForRequest(request) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const forwarded = trustedForwardedHeaders(request);
  const forwardedProto = forwarded
    ? String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim()
    : "";
  const forwardedHost = forwarded
    ? String(request.headers["x-forwarded-host"] || "").split(",")[0].trim()
    : "";
  const protocol = forwardedProto || (request.socket.encrypted ? "https" : "http");
  const host = forwardedHost || request.headers.host;
  return host ? `${protocol}://${host}` : "";
}
