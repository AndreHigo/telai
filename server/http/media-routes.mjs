import { publicSfuConfig } from "../media/sfu-config.mjs";

export function createMediaRoutes({ iceConfiguration, mediaMode, sfu, databaseDriver, requireLogin, publicOriginForRequest }) {
  return async function handleMediaRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/ice-config") {
      iceConfiguration().then((config) => {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(config));
      }).catch(() => response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ iceServers: [] })));
      return true;
    }

    if (requestUrl.pathname === "/healthz") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ ok: true, mediaMode, sfu: publicSfuConfig(sfu), databaseDriver, requireLogin }));
      return true;
    }

    if (requestUrl.pathname === "/runtime-config") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({
        publicBaseUrl: publicOriginForRequest(request),
        mediaMode,
        sfu: publicSfuConfig(sfu),
        requireLogin,
        internalAuth: true,
      }));
      return true;
    }

    return false;
  };
}
