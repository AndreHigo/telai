export function createGroupAuditRoutes({ json, requireUser, groupPermissionRepository, groupAuditRepository }) {
  return async function handleGroupAuditRoutes(request, response, requestUrl) {
    const match = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/audit-log$/);
    if (!match || request.method !== "GET") return false;
    const user = requireUser(request, response);
    if (!user) return true;
    const groupId = match[1];
    const member = groupPermissionRepository.member(groupId, user.id);
    if (member?.role !== "owner") {
      json(response, 403, { error: "Somente o dono pode consultar a auditoria do grupo." });
      return true;
    }
    const limit = Math.max(1, Math.min(Number(requestUrl.searchParams.get("limit")) || 50, 100));
    const before = requestUrl.searchParams.get("before") || null;
    json(response, 200, groupAuditRepository.list(groupId, { limit, before }));
    return true;
  };
}
