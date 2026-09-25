export function createGroupInviteRoutes({
  json,
  readJson,
  requireUser,
  groupInviteRepository,
  groupPermissionRepository,
  groupSettingsRepository,
  isGroupMember,
  canGroupAction,
  createNotification,
  sendGroupInviteEmail,
  publicOriginForRequest,
  warnLog,
  compactUserSummary,
  randomBytes,
}) {
  return async function handleGroupInviteRoutes(request, response, requestUrl) {
    const memberInviteCreateMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/member-invites$/);
    if (memberInviteCreateMatch && request.method === "POST") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const groupId = memberInviteCreateMatch[1];
      if (!await isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      if (!await canGroupAction(user.id, groupId, "canInvite")) {
        json(response, 403, { error: "Você não tem permissão para convidar pessoas neste grupo." });
        return true;
      }
      try {
        const body = await readJson(request);
        const group = await groupInviteRepository.findGroup(groupId);
        const invitedUserId = String(body.userId || "").trim();
        const target = await groupInviteRepository.findMemberInviteTarget(invitedUserId);
        if (!target || target.id === user.id) return json(response, 404, { error: "Usuário não encontrado." });
        if (await isGroupMember(target.id, groupId)) return json(response, 409, { error: "Essa pessoa já está no grupo." });
        const now = new Date().toISOString();
        if (await groupInviteRepository.hasPendingMemberInvite(groupId, target.id, now)) return json(response, 409, { error: "Já existe um convite pendente para essa pessoa." });
        const invite = await groupInviteRepository.createMemberInvite({ groupId, invitedUserId: target.id, invitedBy: user.id, expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(), createdAt: now });
        await createNotification({ userId: target.id, type: "group_invite", entityId: invite.id, groupId, title: `Convite para ${group?.name || "um grupo"}`, body: `${user.displayName} convidou você para entrar neste grupo.`, createdAt: now });
        if (target.email) {
          void sendGroupInviteEmail({ to: target.email, displayName: target.displayName, groupName: group?.name, baseUrl: publicOriginForRequest(request) })
            .catch((error) => warnLog("email_send_failed", { kind: "group_invite", groupId, targetUserId: target.id, errorCode: error?.code || "smtp-send-failed", error: error?.message || String(error) }));
        }
        return json(response, 201, { invite: { id: invite.id, user: compactUserSummary(target), expiresAt: invite.expiresAt } });
      } catch {
        return json(response, 400, { error: "Não foi possível enviar o convite." });
      }
      return true;
    }

    const inviteMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/invites$/);
    if (inviteMatch && request.method === "POST") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const groupId = inviteMatch[1];
      const member = await groupPermissionRepository.member(groupId, user.id);
      if (!member) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      if (!await canGroupAction(user.id, groupId, "canInvite")) {
        json(response, 403, { error: "Você não tem permissão para criar convites neste grupo." });
        return true;
      }
      try {
        const body = await readJson(request);
        const rawToken = randomBytes(24).toString("base64url");
        const hours = Math.max(1, Math.min(Number(body.hours) || 72, 168));
        const maxUses = Math.max(1, Math.min(Number(body.maxUses) || 5, 50));
        await groupInviteRepository.createGroupInvite({ token: rawToken, groupId, createdBy: user.id, expiresAt: new Date(Date.now() + hours * 3600000).toISOString(), maxUses });
        return json(response, 201, { token: rawToken, expiresInHours: hours, maxUses });
      } catch {
        return json(response, 400, { error: "Não foi possível criar o convite." });
      }
      return true;
    }

    const inviteDeleteMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/invites\/([a-f0-9]{32,128})$/i);
    if (inviteDeleteMatch && request.method === "DELETE") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const [, groupId, tokenHash] = inviteDeleteMatch;
      const group = await groupSettingsRepository.findGroup(groupId);
      if (!group) {
        json(response, 404, { error: "Grupo não encontrado." });
        return true;
      }
      if (group.ownerId !== user.id) {
        json(response, 403, { error: "Somente o dono pode revogar convites." });
        return true;
      }
      if (!await groupInviteRepository.deleteGroupInvite(groupId, tokenHash)) {
        json(response, 404, { error: "Convite não encontrado." });
        return true;
      }
      json(response, 200, { ok: true });
      return true;
    }

    return false;
  };
}
