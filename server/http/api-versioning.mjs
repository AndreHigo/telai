export function isVersionedApiPath(pathname) {
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}

export function normalizeApiPathname(pathname) {
  if (pathname === "/api/v1") return "/api";
  if (pathname.startsWith("/api/v1/")) return `/api${pathname.slice("/api/v1".length)}`;
  return pathname;
}

export function normalizeApiRequestUrl(requestUrl) {
  if (!isVersionedApiPath(requestUrl.pathname)) return requestUrl;
  const normalized = new URL(requestUrl.toString());
  normalized.pathname = normalizeApiPathname(requestUrl.pathname);
  return normalized;
}
