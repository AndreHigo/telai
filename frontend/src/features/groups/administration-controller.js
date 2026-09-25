export function createGroupAdministrationController({
  api,
  getState,
  setState,
}) {
  async function loadGroupRoomPermissions(roomId) {
    const state = getState();
    setState({ selectedRoomPermissionId: roomId, groupRoomPermissions: [] });
    if (!state.selectedGroupId || !roomId || state.selectedGroup?.role !== "owner") return;
    try {
      const result = await api(`/api/groups/${encodeURIComponent(state.selectedGroupId)}/rooms/${encodeURIComponent(roomId)}/permissions`);
      setState({ groupRoomPermissions: result.permissions || [] });
    } catch (error) {
      setState({ groupAdminError: error.message });
    }
  }

  async function loadGroupAdministration() {
    const state = getState();
    if (!state.selectedGroupId) return;
    setState({ groupAdminError: "" });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(state.selectedGroupId)}/admin`);
      const firstRoom = (getState().groupOverview?.rooms || []).find((room) => room.kind === "text" || room.kind === "voice");
      setState({
        groupRoles: result.roles || [],
        groupInvites: result.invites || [],
        groupJoinRequests: result.joinRequests || [],
        groupAuditEntries: result.auditLog?.entries || [],
        selectedRoomPermissionId: firstRoom?.id || "",
      });
      if (firstRoom?.id && getState().selectedGroup?.role === "owner") await loadGroupRoomPermissions(firstRoom.id);
    } catch (error) {
      setState({ groupAdminError: error.message });
    }
  }

  async function refreshGroupAfterModeration({ action, memberId }) {
    const state = getState();
    if (["kick", "ban"].includes(action) && state.groupOverview) {
      setState({
        groupOverview: {
          ...state.groupOverview,
          members: state.groupOverview.members.filter((member) => member.id !== memberId),
        },
      });
    }
    await loadGroupAdministration();
  }

  async function updateGroupRoomPermission(role, key, event) {
    const state = getState();
    if (!state.selectedGroupId || !state.selectedRoomPermissionId || state.selectedGroup?.role !== "owner") return;
    const roomPermissionBusyKey = `${role.id}:${key}`;
    setState({ roomPermissionBusyKey, groupAdminError: "" });
    const current = state.groupRoomPermissions.find((permission) => permission.roleId === role.id);
    const next = {
      roleId: role.id,
      canView: current?.canView ?? true,
      canChat: current?.canChat ?? true,
      canConnect: current?.canConnect ?? true,
    };
    next[key] = event.currentTarget.checked;
    try {
      const result = await api(`/api/groups/${encodeURIComponent(state.selectedGroupId)}/rooms/${encodeURIComponent(state.selectedRoomPermissionId)}/permissions`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setState({
        groupRoomPermissions: [...getState().groupRoomPermissions.filter((permission) => permission.roleId !== role.id), result.permission],
        notice: `Permissões de ${role.name} atualizadas neste canal.`,
      });
    } catch (error) {
      setState({ groupAdminError: error.message });
    } finally {
      setState({ roomPermissionBusyKey: "" });
    }
  }

  async function resetGroupRoomPermission(role) {
    const state = getState();
    if (!state.selectedGroupId || !state.selectedRoomPermissionId || state.selectedGroup?.role !== "owner") return;
    setState({ roomPermissionBusyKey: `${role.id}:reset` });
    try {
      await api(`/api/groups/${encodeURIComponent(state.selectedGroupId)}/rooms/${encodeURIComponent(state.selectedRoomPermissionId)}/permissions?roleId=${encodeURIComponent(role.id)}`, { method: "DELETE" });
      setState({
        groupRoomPermissions: getState().groupRoomPermissions.filter((permission) => permission.roleId !== role.id),
        notice: `O cargo ${role.name} voltou a herdar o canal.`,
      });
    } catch (error) {
      setState({ groupAdminError: error.message });
    } finally {
      setState({ roomPermissionBusyKey: "" });
    }
  }

  function roleListAfterMove(roleId, targetIndex) {
    const state = getState();
    const currentIndex = state.groupRoles.findIndex((role) => role.id === roleId);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= state.groupRoles.length || currentIndex === targetIndex) return state.groupRoles;
    const nextRoles = [...state.groupRoles];
    const [movedRole] = nextRoles.splice(currentIndex, 1);
    nextRoles.splice(targetIndex, 0, movedRole);
    return nextRoles;
  }

  async function saveGroupRoleOrder(nextRoles, previousRoles = getState().groupRoles) {
    const state = getState();
    if (!state.selectedGroupId || state.selectedGroup?.role !== "owner" || state.roleOrderSaving || nextRoles === previousRoles) return;
    setState({ roleOrderSaving: true, groupAdminError: "", groupRoles: nextRoles });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(state.selectedGroupId)}/roles/order`, {
        method: "PATCH",
        body: JSON.stringify({ roleIds: nextRoles.map((role) => role.id) }),
      });
      const orderedRoles = result.roles || nextRoles;
      const sortOrders = new Map(orderedRoles.map((role, index) => [role.id, role.sortOrder ?? index]));
      const current = getState();
      setState({
        groupRoles: orderedRoles,
        groupOverview: current.groupOverview ? {
          ...current.groupOverview,
          members: current.groupOverview.members.map((member) => ({
            ...member,
            roleSortOrder: member.roleId ? sortOrders.get(member.roleId) ?? member.roleSortOrder : member.roleSortOrder,
          })),
        } : current.groupOverview,
        notice: "Ordem dos cargos atualizada.",
      });
    } catch (error) {
      setState({ groupRoles: previousRoles, groupAdminError: error.message });
    } finally {
      setState({ roleOrderSaving: false });
    }
  }

  function startRoleDrag(event, roleId) {
    const state = getState();
    if (state.selectedGroup?.role !== "owner" || state.roleOrderSaving) return;
    setState({ draggedRoleId: roleId, dragOverRoleId: roleId });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", roleId);
  }

  function handleRoleDragOver(event, roleId) {
    const state = getState();
    if (!state.draggedRoleId || state.draggedRoleId === roleId || state.roleOrderSaving) return;
    event.dataTransfer.dropEffect = "move";
    setState({ dragOverRoleId: roleId });
  }

  async function dropRole(roleId) {
    const state = getState();
    const sourceRoleId = state.draggedRoleId;
    setState({ draggedRoleId: "", dragOverRoleId: "" });
    if (!sourceRoleId || sourceRoleId === roleId || state.roleOrderSaving) return;
    const targetIndex = state.groupRoles.findIndex((role) => role.id === roleId);
    await saveGroupRoleOrder(roleListAfterMove(sourceRoleId, targetIndex), state.groupRoles);
  }

  function endRoleDrag() {
    setState({ draggedRoleId: "", dragOverRoleId: "" });
  }

  async function moveRole(roleId, direction) {
    const state = getState();
    if (state.selectedGroup?.role !== "owner" || state.roleOrderSaving) return;
    const currentIndex = state.groupRoles.findIndex((role) => role.id === roleId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= state.groupRoles.length) return;
    await saveGroupRoleOrder(roleListAfterMove(roleId, targetIndex), state.groupRoles);
  }

  return {
    dropRole,
    endRoleDrag,
    handleRoleDragOver,
    loadGroupAdministration,
    loadGroupRoomPermissions,
    moveRole,
    refreshGroupAfterModeration,
    resetGroupRoomPermission,
    startRoleDrag,
    updateGroupRoomPermission,
  };
}
