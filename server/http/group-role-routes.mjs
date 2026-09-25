export function createGroupRoleRoutes({ json, readJson, requireUser, groupRoleRepository, groupPermissionRepository, groupAuditRepository }) {
  return async function handleGroupRoleRoutes(request, response, requestUrl) {
    const groupRoleCreateMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/roles$/);
    if (groupRoleCreateMatch && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupRoleCreateMatch[1];
      const owner = groupPermissionRepository.member(groupId, user.id);
      if (owner?.role !== "owner") {
        json(response, 403, { error: "Somente o dono pode criar cargos." });
        return true;
      }
      readJson(request).then((body) => {
        const name = String(body.name || "").trim().slice(0, 32);
        const color = /^#[0-9a-f]{6}$/i.test(String(body.color || "")) ? String(body.color).toLowerCase() : "#5865f2";
        if (name.length < 2) return json(response, 400, { error: "Informe um nome válido para o cargo." });
        const canChat = body.canChat !== false;
        const canStream = body.canStream !== false;
        const canInvite = body.canInvite !== false;
        const canViewVoiceMembers = body.canViewVoiceMembers !== false;
        const canMoveMembers = body.canMoveMembers === true;
        let role;
        try {
          role = groupRoleRepository.createRole({ groupId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers, createdBy: user.id });
          groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "role_create", targetType: "role", targetId: role.id, metadata: { name: role.name } });
        } catch (error) {
          if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Já existe um cargo com esse nome." });
          throw error;
        }
        return json(response, 201, { role });
      }).catch(() => json(response, 400, { error: "Não foi possível criar o cargo." }));
      return true;
    }

    const groupRoleOrderMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/roles\/order$/);
    if (groupRoleOrderMatch && request.method === "PATCH") {
      const user = requireUser(request, response);
      if (!user) return true;
      const groupId = groupRoleOrderMatch[1];
      const owner = groupPermissionRepository.member(groupId, user.id);
      if (owner?.role !== "owner") {
        json(response, 403, { error: "Somente o dono pode ordenar cargos." });
        return true;
      }
      readJson(request).then((body) => {
        const roleIds = Array.isArray(body.roleIds) ? body.roleIds.map((roleId) => String(roleId || "").trim()) : null;
        const knownRoleIds = new Set(groupRoleRepository.listRoleIds(groupId));
        if (!roleIds || roleIds.length !== knownRoleIds.size || roleIds.some((roleId) => !roleId || !knownRoleIds.has(roleId)) || new Set(roleIds).size !== roleIds.length) {
          return json(response, 400, { error: "A ordem precisa conter todos os cargos do grupo uma única vez." });
        }
        const orderedRoles = groupRoleRepository.reorderRoles(groupId, roleIds);
        groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "role_reorder", targetType: "role", metadata: { roleIds } });
        return json(response, 200, { roles: orderedRoles });
      }).catch(() => json(response, 400, { error: "Não foi possível salvar a ordem dos cargos." }));
      return true;
    }

    const groupRoleMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/roles\/([\w-]{1,64})$/);
    if (groupRoleMatch && ["PATCH", "DELETE"].includes(request.method)) {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, groupId, roleId] = groupRoleMatch;
      const owner = groupPermissionRepository.member(groupId, user.id);
      if (owner?.role !== "owner") {
        json(response, 403, { error: "Somente o dono pode administrar cargos." });
        return true;
      }
      const role = groupRoleRepository.findRole(groupId, roleId);
      if (!role) {
        json(response, 404, { error: "Cargo não encontrado neste grupo." });
        return true;
      }
      if (request.method === "DELETE") {
        if (role.isDefault) {
          json(response, 400, { error: "O cargo padrão não pode ser removido." });
          return true;
        }
        const defaultRole = groupRoleRepository.defaultRole(groupId);
        if (!defaultRole) {
          json(response, 500, { error: "O grupo não possui um cargo padrão disponível." });
          return true;
        }
        groupRoleRepository.deleteRole(groupId, roleId, defaultRole.id);
        groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "role_delete", targetType: "role", targetId: roleId, metadata: { name: role.name, fallbackRoleId: defaultRole.id } });
        json(response, 200, { ok: true, fallbackRoleId: defaultRole.id });
        return true;
      }
      readJson(request).then((body) => {
        const name = String(body.name || role.name).trim().slice(0, 32);
        const color = /^#[0-9a-f]{6}$/i.test(String(body.color || role.color)) ? String(body.color || role.color).toLowerCase() : role.color;
        const canChat = body.canChat === undefined ? Boolean(role.canChat) : body.canChat === true;
        const canStream = body.canStream === undefined ? Boolean(role.canStream) : body.canStream === true;
        const canInvite = body.canInvite === undefined ? Boolean(role.canInvite) : body.canInvite === true;
        const canViewVoiceMembers = body.canViewVoiceMembers === undefined ? Boolean(role.canViewVoiceMembers) : body.canViewVoiceMembers === true;
        const canMoveMembers = body.canMoveMembers === undefined ? Boolean(role.canMoveMembers) : body.canMoveMembers === true;
        if (name.length < 2) return json(response, 400, { error: "Informe um nome válido para o cargo." });
        try {
          const updatedRole = groupRoleRepository.updateRole({ groupId, roleId, name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers });
          groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "role_update", targetType: "role", targetId: roleId, metadata: { name, color, canChat, canStream, canInvite, canViewVoiceMembers, canMoveMembers } });
          return json(response, 200, { role: updatedRole });
        } catch (error) {
          if (String(error.message).includes("UNIQUE")) return json(response, 409, { error: "Já existe um cargo com esse nome." });
          throw error;
        }
      }).catch(() => json(response, 400, { error: "Não foi possível atualizar o cargo." }));
      return true;
    }

    const groupMemberRoleMatch = requestUrl.pathname.match(/^\/api\/groups\/([\w-]{1,64})\/members\/([\w-]{1,64})\/role$/);
    if (groupMemberRoleMatch && request.method === "PATCH") {
      const user = requireUser(request, response);
      if (!user) return true;
      const [, groupId, memberId] = groupMemberRoleMatch;
      const owner = groupPermissionRepository.member(groupId, user.id);
      if (owner?.role !== "owner") {
        json(response, 403, { error: "Somente o dono pode atribuir cargos." });
        return true;
      }
      const member = groupRoleRepository.member(groupId, memberId);
      if (!member) {
        json(response, 404, { error: "Membro não encontrado neste grupo." });
        return true;
      }
      if (member.role === "owner") {
        json(response, 400, { error: "O dono mantém o cargo de dono." });
        return true;
      }
      readJson(request).then((body) => {
        const roleId = String(body.roleId || "").trim();
        if (roleId && !groupRoleRepository.roleBelongs(groupId, roleId)) return json(response, 400, { error: "Esse cargo não pertence ao grupo." });
        groupRoleRepository.assignMemberRole(groupId, memberId, roleId);
        groupAuditRepository?.record({ groupId, actorUserId: user.id, action: "member_role_assign", targetType: "member", targetId: memberId, metadata: { roleId: roleId || null } });
        return json(response, 200, { roleId: roleId || null });
      }).catch(() => json(response, 400, { error: "Não foi possível atribuir o cargo." }));
      return true;
    }

    return false;
  };
}
