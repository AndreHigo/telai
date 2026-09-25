export function createMemberInviteRoutes({ json, requireUser, groupInviteRepository }) {
  return async function handleMemberInviteRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/member-invites/pending" && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const now = new Date().toISOString();
      groupInviteRepository.expireMemberInvites(user.id, now);
      const invites = groupInviteRepository.listPendingMemberInvites(user.id);
      json(response, 200, { invites });
      return true;
    }

    const memberInviteActionMatch = requestUrl.pathname.match(/^\/api\/member-invites\/([\w-]{16,})\/(accept|decline)$/);
    if (memberInviteActionMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, inviteId, action] = memberInviteActionMatch;
      const invite = groupInviteRepository.findMemberInvite(inviteId, user.id);
      if (!invite) {
        json(response, 404, { error: "Convite não encontrado." });
        return true;
      }
      if (invite.status !== "pending") {
        json(response, 400, { error: "Esse convite já foi respondido." });
        return true;
      }
      if (invite.expiresAt <= new Date().toISOString()) {
        groupInviteRepository.updateMemberInviteStatus(inviteId, "expired");
        json(response, 400, { error: "Esse convite expirou." });
        return true;
      }
      if (action === "decline") {
        groupInviteRepository.updateMemberInviteStatus(inviteId, "declined");
        json(response, 200, { ok: true, status: "declined" });
        return true;
      }
      try {
        const result = groupInviteRepository.acceptMemberInvite(inviteId, user.id);
        json(response, 200, { ok: true, status: result.kind, groupId: result.groupId });
      } catch {
        json(response, 400, { error: "Não foi possível aceitar o convite." });
      }
      return true;
    }

    const redeemMatch = requestUrl.pathname.match(/^\/api\/invites\/([\w-]{16,})\/redeem$/);
    if (redeemMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const result = groupInviteRepository.redeemGroupInvite(redeemMatch[1], user.id);
      if (result.kind === "unavailable") {
        json(response, 400, { error: "Este convite expirou ou não está mais disponível." });
        return true;
      }
      json(response, 200, { ok: true, groupId: result.groupId });
      return true;
    }

    return false;
  };
}
