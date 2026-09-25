export function createGroupManagementRoutes({
  json,
  readJson,
  requireUser,
  groupJoinRequestRepository,
  groupSettingsRepository,
  groupPermissionRepository,
  groupSetupRepository,
  groupRoleRepository,
  groupInviteRepository,
  isGroupMember,
  createNotification,
  slugFor,
  groupAuditRepository,
}) {
  return async function handleGroupManagementRoutes(request, response, requestUrl) {
    const groupJoinRequestMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/join-requests$/);
    if (groupJoinRequestMatch && ["POST", "GET"].includes(request.method)) {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupJoinRequestMatch[1];
      const group = groupJoinRequestRepository.findGroup(groupId);
      if (!group) {
        json(response, 404, { error: "Grupo não encontrado." });
        return true;
      }
      if (request.method === "GET") {
        if (group.ownerId !== user.id) {
          json(response, 403, { error: "Somente o administrador pode ver as solicitações." });
          return true;
        }
        json(response, 200, { requests: groupJoinRequestRepository.listPending(groupId) });
        return true;
      }
      if (isGroupMember(user.id, groupId)) {
        json(response, 409, { error: "Você já participa deste grupo." });
        return true;
      }
      const now = new Date().toISOString();
      const existing = groupJoinRequestRepository.findForUser(groupId, user.id);
      if (existing?.status === "pending") {
        json(response, 409, { error: "Sua solicitação já está pendente." });
        return true;
      }
      if (existing) {
        groupJoinRequestRepository.reopen(existing.id, groupId, now);
        createNotification({ userId: group.ownerId, type: "group_join_request", entityId: existing.id, groupId, title: `Solicitação para ${group.name}`, body: `${user.displayName} pediu para entrar no grupo.`, createdAt: now });
        json(response, 200, { request: { id: existing.id, groupId, status: "pending", createdAt: now, updatedAt: now } });
        return true;
      }
      const joinRequest = groupJoinRequestRepository.create({ groupId, userId: user.id, createdAt: now });
      createNotification({ userId: group.ownerId, type: "group_join_request", entityId: joinRequest.id, groupId, title: `Solicitação para ${group.name}`, body: `${user.displayName} pediu para entrar no grupo.`, createdAt: now });
      json(response, 201, { request: joinRequest });
      return true;
    }

    const groupJoinRequestActionMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/join-requests\/([\w-]{16,64})$/);
    if (groupJoinRequestActionMatch && request.method === "PATCH") {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, groupId, requestId] = groupJoinRequestActionMatch;
      const group = groupJoinRequestRepository.findGroup(groupId);
      if (!group) {
        json(response, 404, { error: "Grupo não encontrado." });
        return true;
      }
      if (group.ownerId !== user.id) {
        json(response, 403, { error: "Somente o administrador pode responder solicitações." });
        return true;
      }
      readJson(request).then((body) => {
        const status = body.status === "approved" ? "approved" : body.status === "rejected" ? "rejected" : "";
        if (!status) return json(response, 400, { error: "Escolha aprovar ou recusar a solicitação." });
        const joinRequest = groupJoinRequestRepository.find(requestId, groupId);
        if (!joinRequest) return json(response, 404, { error: "Solicitação não encontrada." });
        if (joinRequest.status !== "pending") return json(response, 409, { error: "Essa solicitação já foi respondida." });
        const now = new Date().toISOString();
        try {
          const result = groupJoinRequestRepository.decide({ groupId, requestId, decidedBy: user.id, status, groupOwnerId: group.ownerId, now, createNotification });
          if (result.kind === "already-answered") return json(response, 409, { error: "Essa solicitação já foi respondida." });
          return json(response, 200, { request: result.request });
        } catch {
          return json(response, 400, { error: status === "approved" ? "Não foi possível aprovar a entrada." : "Não foi possível recusar a solicitação." });
        }
      }).catch(() => json(response, 400, { error: "Não foi possível responder a solicitação." }));
      return true;
    }

    const groupSettingsMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})$/);
    if (groupSettingsMatch && request.method === "PATCH") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupSettingsMatch[1];
      const owner = groupPermissionRepository.member(groupId, user.id);
      if (owner?.role !== "owner") {
        json(response, 403, { error: "Somente o dono pode alterar as configurações do grupo." });
        return true;
      }
      readJson(request).then((body) => {
        const name = String(body.name || "").trim().slice(0, 64);
        const slug = slugFor(body.slug || name);
        if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para o grupo." });
        const duplicate = groupSettingsRepository.findDuplicateSlug(slug, groupId);
        if (duplicate) return json(response, 409, { error: "Já existe um grupo com esse nome." });
        const group = groupSettingsRepository.updateGroup(groupId, name, slug);
        groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "group_update", targetType: "group", targetId: groupId, metadata: { name, slug } });
        return json(response, 200, { group });
      }).catch(() => json(response, 400, { error: "Não foi possível salvar as configurações do grupo." }));
      return true;
    }

    const groupAdminMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/admin$/);
    if (groupAdminMatch && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupAdminMatch[1];
      if (!isGroupMember(user.id, groupId)) {
        json(response, 403, { error: "Você não participa deste grupo." });
        return true;
      }
      const group = groupSettingsRepository.findGroup(groupId);
      if (!group) {
        json(response, 404, { error: "Grupo não encontrado." });
        return true;
      }
      groupSetupRepository.ensureDefaultGroupRoles(groupId, group.ownerId);
      const roles = groupRoleRepository.listRoles(groupId);
      const invites = groupInviteRepository.listGroupInvites(groupId);
      const joinRequests = group.ownerId === user.id ? groupJoinRequestRepository.listPending(groupId) : [];
      const auditLog = group.ownerId === user.id ? groupAuditRepository?.list(groupId, { limit: 30 }) : { entries: [], nextBefore: null };
      json(response, 200, { group, roles, invites, joinRequests, auditLog });
      return true;
    }

    return false;
  };
}
