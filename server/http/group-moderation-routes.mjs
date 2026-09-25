const ACTIONS = new Set(["kick", "ban", "mute", "unmute", "unban"]);

export function createGroupModerationRoutes({
  json,
  readJson,
  requireUser,
  groupPermissionRepository,
  groupMemberRepository,
  groupModerationRepository,
  groupAuditRepository,
  disconnectGroupUser = () => {},
  publishGroupEvent = () => {},
}) {
  return async function handleGroupModerationRoutes(request, response, requestUrl) {
    const match = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/moderation$/);
    if (!match || request.method !== "POST") return false;
    const user = requireUser(request, response);
    if (!user) return true;
    const groupId = match[1];
    const owner = groupPermissionRepository.member(groupId, user.id);
    if (owner?.role !== "owner") {
      json(response, 403, { error: "Somente o dono pode moderar membros deste grupo." });
      return true;
    }
    try {
      const body = await readJson(request, 12 * 1024);
      const action = String(body.action || "").trim().toLowerCase();
      const memberId = String(body.memberId || "").trim();
      const reason = String(body.reason || "").trim().slice(0, 200);
      if (!ACTIONS.has(action) || !memberId) {
        json(response, 400, { error: "Informe uma ação e um membro válidos." });
        return true;
      }
      const target = groupMemberRepository.find(groupId, memberId);
      const canRemoveBan = action === "unban" && groupModerationRepository.isBanned(groupId, memberId);
      if (!target && !canRemoveBan) {
        json(response, 404, { error: "Membro não encontrado neste grupo." });
        return true;
      }
      if (target && (target.role === "owner" || memberId === user.id)) {
        json(response, 400, { error: "O dono não pode ser moderado." });
        return true;
      }
      const hasDuration = body.durationMinutes !== null && body.durationMinutes !== undefined && body.durationMinutes !== "";
      if (hasDuration && !Number.isFinite(Number(body.durationMinutes))) {
        json(response, 400, { error: "A duração informada é inválida." });
        return true;
      }
      const durationMinutes = hasDuration ? Math.max(1, Math.min(Math.round(Number(body.durationMinutes)), 43_200)) : null;
      const result = groupModerationRepository.apply({ groupId, actorUserId: user.id, userId: memberId, action, reason, durationMinutes, now: new Date().toISOString() });
      if (action === "kick" || action === "ban") disconnectGroupUser(groupId, memberId, action === "ban" ? "ban" : "kick");
      groupAuditRepository?.record({ groupId, actorUserId: user.id, action: `member_${action}`, targetType: "member", targetId: memberId, metadata: { reason, durationMinutes, expiresAt: result.expiresAt } });
      publishGroupEvent(groupId, { type: "group-member-moderated", userId: memberId, action, reason, expiresAt: result.expiresAt });
      json(response, 200, { ok: true, ...result });
    } catch {
      json(response, 400, { error: "Não foi possível concluir a moderação." });
    }
    return true;
  };
}
