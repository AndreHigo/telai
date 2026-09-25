import { isVersionedApiPath, normalizeApiRequestUrl } from "./api-versioning.mjs";
import { json } from "./body.mjs";
import { createApiV1Document } from "./api-contract.mjs";

export function createHttpRouter({
  fs,
  path,
  publicDir,
  requireSiteAdmin,
  handleAdminRoutes,
  handleObservabilityRoutes,
  handleOAuthRoutes,
  handleAuthRoutes,
  handleUserSettingsRoutes,
  handleSocialRoutes,
  handleGroupDiscoveryRoutes,
  handleGroupRuntimeRoutes,
  handleGroupManagementRoutes,
  handleGroupRoleRoutes,
  handleGroupRoomRoutes,
  handleGroupAuditRoutes,
  handleGroupModerationRoutes,
  handleGroupContentRoutes,
  handleGroupInviteRoutes,
  handleDirectRoutes,
  handleNotificationRoutes,
  handleMemberInviteRoutes,
  handleStreamRoutes,
  handleMediaRoutes,
  handleStaticRoutes,
}) {
  return async function handleHttpRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/v1/openapi.json") {
      if (!["GET", "HEAD"].includes(request.method)) {
        json(response, 405, { error: "Método não permitido." });
      } else {
        json(response, 200, createApiV1Document());
      }
      return true;
    }
    const routedUrl = normalizeApiRequestUrl(requestUrl);
    const versionedApiRoot = isVersionedApiPath(requestUrl.pathname) && routedUrl.pathname === "/api";
    if (versionedApiRoot) {
      if (!["GET", "HEAD"].includes(request.method)) {
        json(response, 405, { error: "Método não permitido." });
      } else {
        json(response, 200, { version: "v1", status: "available" });
      }
      return true;
    }

    if (await handleAdminRoutes(request, response, routedUrl)) return true;

    if ((routedUrl.pathname === "/admin" || routedUrl.pathname === "/admin/") && ["GET", "HEAD"].includes(request.method)) {
      if (!requireSiteAdmin(request, response)) return true;
      const adminPath = path.join(publicDir, "admin", "index.html");
      fs.readFile(adminPath, (error, content) => {
        if (error) {
          response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Cache-Control": "no-store" }).end("Not found");
          return;
        }
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
          "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        });
        if (request.method === "HEAD") response.end();
        else response.end(content);
      });
      return true;
    }

    if (await handleObservabilityRoutes(request, response, routedUrl)) return true;
    if (await handleOAuthRoutes(request, response, routedUrl)) return true;
    if (await handleAuthRoutes(request, response, routedUrl)) return true;
    if (await handleUserSettingsRoutes(request, response, routedUrl)) return true;
    if (await handleSocialRoutes(request, response, routedUrl)) return true;
    if (await handleGroupDiscoveryRoutes(request, response, routedUrl)) return true;
    if (await handleGroupRuntimeRoutes(request, response, routedUrl)) return true;
    if (await handleGroupManagementRoutes(request, response, routedUrl)) return true;
    if (await handleGroupRoleRoutes(request, response, routedUrl)) return true;
    if (await handleGroupRoomRoutes(request, response, routedUrl)) return true;
    if (await handleGroupAuditRoutes(request, response, routedUrl)) return true;
    if (await handleGroupModerationRoutes(request, response, routedUrl)) return true;
    if (await handleGroupContentRoutes(request, response, routedUrl)) return true;
    if (await handleGroupInviteRoutes(request, response, routedUrl)) return true;
    if (await handleDirectRoutes(request, response, routedUrl)) return true;
    if (await handleNotificationRoutes(request, response, routedUrl)) return true;
    if (await handleMemberInviteRoutes(request, response, routedUrl)) return true;
    if (await handleStreamRoutes(request, response, routedUrl)) return true;
    if (routedUrl.pathname === "/api" || routedUrl.pathname.startsWith("/api/")) {
      json(response, 404, { error: "Rota API não encontrada." });
      return true;
    }

    if (await handleMediaRoutes(request, response, routedUrl)) return true;
    if (await handleStaticRoutes(request, response, routedUrl)) return true;

    return false;
  };
}
