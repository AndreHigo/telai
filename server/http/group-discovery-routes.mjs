export function createGroupDiscoveryRoutes({
  json,
  readJson,
  requireUser,
  groupRepository,
  groupSettingsRepository,
  groupMemberRepository,
  slugFor,
}) {
  return async function handleGroupDiscoveryRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/groups" && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      json(response, 200, { groups: groupRepository.listGroups(user.id) });
      return true;
    }

    if (requestUrl.pathname === "/api/groups/search" && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      const query = String(requestUrl.searchParams.get("q") || "").trim().slice(0, 64);
      if (query.length < 2) {
        json(response, 200, { groups: [] });
        return true;
      }
      json(response, 200, { groups: groupRepository.searchGroups(user.id, query) });
      return true;
    }

    if (requestUrl.pathname === "/api/groups" && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      readJson(request).then((body) => {
        const name = String(body.name || "").trim().slice(0, 64);
        const slug = slugFor(body.slug || name);
        if (name.length < 2 || slug.length < 2) return json(response, 400, { error: "Informe um nome válido para o grupo." });
        try {
          const group = groupRepository.createGroup({ name, slug, ownerId: user.id });
          return json(response, 201, { group });
        } catch (error) {
          if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Já existe um grupo com esse nome." });
          throw error;
        }
      }).catch(() => json(response, 400, { error: "Não foi possível criar o grupo." }));
      return true;
    }

    const groupMembershipMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/membership$/);
    if (groupMembershipMatch && request.method === "DELETE") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupMembershipMatch[1];
      const group = groupSettingsRepository.findGroup(groupId);
      if (!group) {
        json(response, 404, { error: "Grupo não encontrado." });
        return true;
      }
      const membership = groupMemberRepository.find(groupId, user.id);
      if (!membership) {
        json(response, 404, { error: "Você não participa deste grupo." });
        return true;
      }
      if (membership.role === "owner" || group.ownerId === user.id) {
        json(response, 400, { error: "O dono não pode sair do próprio grupo. Transfira a propriedade ou exclua o grupo." });
        return true;
      }
      try {
        groupMemberRepository.leaveGroup(groupId, user.id);
        json(response, 200, { ok: true, group: { id: group.id, name: group.name } });
      } catch {
        json(response, 400, { error: "Não foi possível sair deste grupo agora." });
      }
      return true;
    }

    return false;
  };
}
