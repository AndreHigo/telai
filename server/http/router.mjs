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
    if (await handleAdminRoutes(request, response, requestUrl)) return true;

    if ((requestUrl.pathname === "/admin" || requestUrl.pathname === "/admin/") && ["GET", "HEAD"].includes(request.method)) {
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

    if (await handleObservabilityRoutes(request, response, requestUrl)) return true;
    if (await handleOAuthRoutes(request, response, requestUrl)) return true;
    if (await handleAuthRoutes(request, response, requestUrl)) return true;
    if (await handleUserSettingsRoutes(request, response, requestUrl)) return true;
    if (await handleSocialRoutes(request, response, requestUrl)) return true;
    if (await handleGroupDiscoveryRoutes(request, response, requestUrl)) return true;
    if (await handleGroupRuntimeRoutes(request, response, requestUrl)) return true;
    if (await handleGroupManagementRoutes(request, response, requestUrl)) return true;
    if (await handleGroupRoleRoutes(request, response, requestUrl)) return true;
    if (await handleGroupRoomRoutes(request, response, requestUrl)) return true;
    if (await handleGroupContentRoutes(request, response, requestUrl)) return true;
    if (await handleGroupInviteRoutes(request, response, requestUrl)) return true;
    if (await handleDirectRoutes(request, response, requestUrl)) return true;
    if (await handleNotificationRoutes(request, response, requestUrl)) return true;
    if (await handleMemberInviteRoutes(request, response, requestUrl)) return true;
    if (await handleStreamRoutes(request, response, requestUrl)) return true;
    if (await handleMediaRoutes(request, response, requestUrl)) return true;
    if (await handleStaticRoutes(request, response, requestUrl)) return true;

    return false;
  };
}
