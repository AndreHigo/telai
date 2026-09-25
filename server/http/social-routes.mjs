export function createSocialRoutes({ json, requireUser, socialRepository, createNotification }) {
  return async function handleSocialRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/users/search" && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const query = String(requestUrl.searchParams.get("q") || "").trim().replace(/^@/, "").slice(0, 48);
      if (query.length < 2) {
        json(response, 200, { users: [] });
        return true;
      }
      json(response, 200, { users: socialRepository.searchUsers(user.id, query) });
      return true;
    }

    if (requestUrl.pathname === "/api/social" && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      json(response, 200, socialRepository.listSocial(user.id));
      return true;
    }

    const friendRequestActionMatch = requestUrl.pathname.match(/^\/api\/friends\/requests\/([\w-]{16,64})\/(accept|decline)$/);
    if (friendRequestActionMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const requestId = friendRequestActionMatch[1];
      const action = friendRequestActionMatch[2];
      const friendRequest = socialRepository.pendingFriendRequest(requestId, user.id);
      if (!friendRequest) {
        json(response, 404, { error: "Solicitação de amizade não encontrada." });
        return true;
      }
      const now = new Date().toISOString();
      try {
        socialRepository.decideFriendRequest(requestId, user.id, action, now);
      } catch {
        json(response, 400, { error: "Não foi possível atualizar a solicitação de amizade." });
        return true;
      }
      if (action === "accept") {
        createNotification({
          userId: friendRequest.senderId,
          type: "friend_accepted",
          entityId: requestId,
          title: `${user.displayName} aceitou sua amizade`,
          body: "Agora vocês podem conversar pelo Telai.",
          createdAt: now,
        });
      }
      json(response, 200, { ok: true, status: action === "accept" ? "accepted" : "declined" });
      return true;
    }

    const friendRequestCancelMatch = requestUrl.pathname.match(/^\/api\/friends\/requests\/([\w-]{16,64})$/);
    if (friendRequestCancelMatch && request.method === "DELETE") {
      const user = requireUser(request, response);
      if (!user) return true;
      if (!socialRepository.cancelFriendRequest(friendRequestCancelMatch[1], user.id)) {
        json(response, 404, { error: "Solicitação de amizade não encontrada." });
        return true;
      }
      json(response, 200, { ok: true });
      return true;
    }

    const friendTargetMatch = requestUrl.pathname.match(/^\/api\/friends\/([\w-]{16,64})$/);
    if (friendTargetMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const targetUserId = friendTargetMatch[1];
      if (targetUserId === user.id) {
        json(response, 400, { error: "Você não pode adicionar a si mesmo." });
        return true;
      }
      if (socialRepository.isBlocked(user.id, targetUserId)) {
        json(response, 403, { error: "Não é possível interagir com este usuário." });
        return true;
      }
      const target = socialRepository.targetUser(targetUserId);
      if (!target) {
        json(response, 404, { error: "Usuário não encontrado." });
        return true;
      }
      if (socialRepository.friendshipExists(user.id, targetUserId)) {
        json(response, 409, { error: "Vocês já são amigos." });
        return true;
      }
      const pendingIncoming = socialRepository.pendingRequest(targetUserId, user.id);
      if (pendingIncoming) {
        json(response, 409, { error: "Essa pessoa já enviou uma solicitação. Aceite-a na área de amigos." });
        return true;
      }
      const pendingOutgoing = socialRepository.pendingRequest(user.id, targetUserId);
      if (pendingOutgoing) {
        json(response, 200, { ok: true, requestId: pendingOutgoing.id, status: "pending" });
        return true;
      }
      const now = new Date().toISOString();
      const { requestId } = socialRepository.createFriendRequest(user.id, targetUserId, now);
      createNotification({ userId: targetUserId, type: "friend_request", entityId: requestId, title: `${user.displayName} quer ser seu amigo`, body: "Abra Amigos para aceitar ou recusar a solicitação.", createdAt: now });
      json(response, 201, { ok: true, requestId, status: "pending" });
      return true;
    }
    if (friendTargetMatch && request.method === "DELETE") {
      const user = requireUser(request, response);
      if (!user) return true;
      if (!socialRepository.removeFriendship(user.id, friendTargetMatch[1])) {
        json(response, 404, { error: "Amizade não encontrada." });
        return true;
      }
      json(response, 200, { ok: true });
      return true;
    }

    const blockTargetMatch = requestUrl.pathname.match(/^\/api\/users\/([\w-]{16,64})\/block$/);
    if (blockTargetMatch && ["POST", "DELETE"].includes(request.method)) {
      const user = requireUser(request, response);
      if (!user) return true;
      const targetUserId = blockTargetMatch[1];
      if (targetUserId === user.id) {
        json(response, 400, { error: "Você não pode bloquear a si mesmo." });
        return true;
      }
      if (!socialRepository.userExists(targetUserId)) {
        json(response, 404, { error: "Usuário não encontrado." });
        return true;
      }
      const blocked = request.method === "POST";
      socialRepository.setBlocked(user.id, targetUserId, blocked);
      json(response, 200, { ok: true, blocked });
      return true;
    }

    const userFollowMatch = requestUrl.pathname.match(/^\/api\/users\/([\w-]{16,64})\/follow$/);
    if (userFollowMatch && ["POST", "DELETE"].includes(request.method)) {
      const user = requireUser(request, response);
      if (!user) return true;
      const targetUserId = userFollowMatch[1];
      if (targetUserId === user.id) {
        json(response, 400, { error: "Você não pode seguir o próprio canal." });
        return true;
      }
      if (socialRepository.isBlocked(user.id, targetUserId)) {
        json(response, 403, { error: "Não é possível interagir com este usuário." });
        return true;
      }
      if (!socialRepository.userExists(targetUserId)) {
        json(response, 404, { error: "Canal não encontrado." });
        return true;
      }
      const following = request.method === "POST";
      socialRepository.setFollowing(user.id, targetUserId, following);
      json(response, 200, { ok: true, following });
      return true;
    }

    return false;
  };
}
