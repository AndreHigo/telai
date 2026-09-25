export function createMediaRoutes({ iceConfiguration, mediaMode, databaseDriver, requireLogin, publicOriginForRequest }) {
  return async function handleMediaRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/ice-config") {
      iceConfiguration().then((config) => {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(config));
      }).catch(() => response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ iceServers: [] })));
      return true;
    }

    if (requestUrl.pathname === "/healthz") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ ok: true, mediaMode, databaseDriver, requireLogin }));
      return true;
    }

    if (requestUrl.pathname === "/runtime-config") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({
        publicBaseUrl: publicOriginForRequest(request),
        mediaMode,
        requireLogin,
        internalAuth: true,
      }));
      return true;
    }

    return false;
  };
}
