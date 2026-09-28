export function createGroupActionsController({
  getState,
  setState,
  api,
  copyText,
  loadGroup,
  loadGroupAdministration,
  selectRoom,
  setGroupsView,
  openInviteDialog,
  openSettings,
  openLeaveGroupDialog,
  leaveVoiceRoom,
  closeVoiceContextMenu,
  markGroupRoomRead,
  messageBelongsToRoom,
  tick,
  reportClientError,
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  const state = () => getState?.() || {};
  const patch = (next) => setState?.(next);

  async function saveGroupSettings() {
    const current = state();
    if (!current.selectedGroupId || current.groupSettingsName.trim().length < 2) return;
    patch({ settingsBusy: true, settingsError: "" });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}`, { method: "PATCH", body: JSON.stringify({ name: current.groupSettingsName.trim() }) });
      patch({
        groups: current.groups.map((group) => group.id === current.selectedGroupId ? { ...group, name: result.group.name, slug: result.group.slug } : group),
        groupOverview: current.groupOverview ? { ...current.groupOverview, group: { ...current.groupOverview.group, ...result.group } } : current.groupOverview,
        notice: "Configurações do grupo salvas.",
      });
    } catch (error) {
      patch({ settingsError: error.message });
    } finally {
      patch({ settingsBusy: false });
    }
  }

  async function createGroupRole() {
    const current = state();
    if (!current.selectedGroupId || current.newRoleName.trim().length < 2) return;
    patch({ groupAdminError: "" });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}/roles`, { method: "POST", body: JSON.stringify({ name: current.newRoleName.trim(), color: current.newRoleColor }) });
      patch({
        groupRoles: [...current.groupRoles, result.role].sort((left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "pt-BR")),
        newRoleName: "",
        notice: "Cargo criado.",
      });
    } catch (error) {
      patch({ groupAdminError: error.message });
    }
  }

  async function assignMemberRole(member, event) {
    const current = state();
    if (!current.selectedGroupId || member.role === "owner") return;
    const roleId = event.currentTarget.value;
    try {
      const result = await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}/members/${encodeURIComponent(member.id)}/role`, { method: "PATCH", body: JSON.stringify({ roleId }) });
      const assignedRole = current.groupRoles.find((role) => role.id === result.roleId);
      patch({
        groupOverview: {
          ...current.groupOverview,
          members: current.groupOverview.members.map((item) => item.id === member.id ? { ...item, roleId: result.roleId, roleName: assignedRole?.name || "Membro", roleColor: assignedRole?.color || "#5865f2", ...Object.fromEntries(current.rolePermissionOptions.map(({ key }) => [key, Boolean(assignedRole?.[key])] )) } : item),
        },
        notice: `Cargo de ${member.displayName} atualizado.`,
      });
    } catch (error) {
      patch({ groupAdminError: error.message });
    }
  }

  async function updateRolePermission(role, permission, event) {
    const current = state();
    if (!current.selectedGroupId || current.selectedGroup?.role !== "owner") return;
    const nextValue = event.currentTarget.checked;
    const nextPermissions = Object.fromEntries(current.rolePermissionOptions.map(({ key }) => [key, key === permission ? nextValue : Boolean(role[key])]));
    patch({ groupAdminError: "" });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}/roles/${encodeURIComponent(role.id)}`, { method: "PATCH", body: JSON.stringify({ name: role.name, color: role.color, ...nextPermissions }) });
      const updatedRole = result.role;
      patch({
        groupRoles: current.groupRoles.map((item) => item.id === role.id ? { ...item, ...updatedRole } : item),
        groupOverview: {
          ...current.groupOverview,
          members: current.groupOverview.members.map((member) => member.roleId === role.id ? { ...member, ...updatedRole } : member),
        },
        notice: `Permissão “${current.rolePermissionOptions.find((item) => item.key === permission)?.label || permission}” do cargo ${role.name} atualizada.`,
      });
    } catch (error) {
      event.currentTarget.checked = Boolean(role[permission]);
      patch({ groupAdminError: error.message });
    }
  }

  async function deleteGroupRole(role) {
    const current = state();
    if (!current.selectedGroupId || !role || role.isDefault || current.selectedGroup?.role !== "owner") return;
    if (!windowRef?.confirm?.(`Excluir o cargo “${role.name}”? Os membros serão movidos para o cargo padrão.`)) return;
    patch({ groupAdminError: "" });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}/roles/${encodeURIComponent(role.id)}`, { method: "DELETE" });
      const fallbackRole = current.groupRoles.find((item) => item.id === result.fallbackRoleId) || current.groupRoles.find((item) => item.isDefault);
      patch({
        groupRoles: current.groupRoles.filter((item) => item.id !== role.id),
        selectedRoleId: fallbackRole?.id || "",
        groupOverview: {
          ...current.groupOverview,
          members: current.groupOverview.members.map((member) => member.roleId === role.id ? { ...member, roleId: fallbackRole?.id || result.fallbackRoleId, roleName: fallbackRole?.name || "Membro", roleColor: fallbackRole?.color || "#5865f2", ...Object.fromEntries(current.rolePermissionOptions.map(({ key }) => [key, Boolean(fallbackRole?.[key])])) } : member),
        },
        notice: `Cargo ${role.name} excluído.`,
      });
    } catch (error) {
      patch({ groupAdminError: error.message });
    }
  }

  async function saveGroupRoleDetails() {
    const current = state();
    if (!current.selectedGroupId || !current.selectedRole || current.selectedGroup?.role !== "owner" || current.roleEditName.trim().length < 2 || current.roleEditBusy) return;
    patch({ roleEditBusy: true, groupAdminError: "" });
    try {
      const permissions = Object.fromEntries(current.rolePermissionOptions.map(({ key }) => [key, Boolean(current.selectedRole[key])]));
      const result = await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}/roles/${encodeURIComponent(current.selectedRole.id)}`, { method: "PATCH", body: JSON.stringify({ name: current.roleEditName.trim(), color: current.roleEditColor, ...permissions }) });
      const updatedRole = result.role;
      patch({
        groupRoles: current.groupRoles.map((role) => role.id === updatedRole.id ? { ...role, ...updatedRole } : role),
        groupOverview: {
          ...current.groupOverview,
          members: current.groupOverview.members.map((member) => member.roleId === updatedRole.id ? { ...member, roleName: updatedRole.name, roleColor: updatedRole.color, ...permissions } : member),
        },
        roleEditName: updatedRole.name,
        roleEditColor: updatedRole.color,
        notice: `Cargo ${updatedRole.name} atualizado.`,
      });
    } catch (error) {
      patch({ groupAdminError: error.message });
    } finally {
      patch({ roleEditBusy: false });
    }
  }

  async function setRoleMember(role, member, checked) {
    const current = state();
    if (!current.selectedGroupId || !role || !member || member.role === "owner" || current.selectedGroup?.role !== "owner") return;
    if (!checked && role.isDefault) return;
    const defaultRole = current.groupRoles.find((item) => item.isDefault);
    const roleId = checked ? role.id : defaultRole?.id || "";
    patch({ roleMemberActionId: member.id, groupAdminError: "" });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}/members/${encodeURIComponent(member.id)}/role`, { method: "PATCH", body: JSON.stringify({ roleId }) });
      const assignedRole = current.groupRoles.find((item) => item.id === result.roleId) || defaultRole;
      patch({
        groupOverview: {
          ...current.groupOverview,
          members: current.groupOverview.members.map((item) => item.id === member.id ? { ...item, roleId: result.roleId, roleName: assignedRole?.name || "Membro", roleColor: assignedRole?.color || "#5865f2", ...Object.fromEntries(current.rolePermissionOptions.map(({ key }) => [key, Boolean(assignedRole?.[key])] )) } : item),
        },
        notice: checked ? `${member.displayName} entrou no cargo ${role.name}.` : `${member.displayName} voltou para ${assignedRole?.name || "Membro"}.`,
      });
    } catch (error) {
      patch({ groupAdminError: error.message });
    } finally {
      patch({ roleMemberActionId: "" });
    }
  }

  async function createGroupInvite() {
    const current = state();
    if (!current.selectedGroupId || current.groupInviteCreating) return;
    patch({ groupInviteCreating: true, groupAdminError: "" });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}/invites`, { method: "POST", body: JSON.stringify({ hours: 72, maxUses: 5 }) });
      const groupInviteLink = `${windowRef.location.origin}/?invite=${encodeURIComponent(result.token)}`;
      const copied = await copyText(groupInviteLink, "Convite criado e copiado.", "Convite criado. Copie o link manualmente.");
      patch({ groupInviteLink });
      await loadGroupAdministration?.();
      if (!copied) patch({ notice: "Convite criado. Copie o link manualmente." });
    } catch (error) {
      patch({ groupAdminError: error.message });
    } finally {
      patch({ groupInviteCreating: false });
    }
  }

  async function copyGroupInvite() {
    const current = state();
    if (!current.groupInviteLink) return;
    await copyText(current.groupInviteLink, "Convite copiado.", "Não foi possível copiar o convite.");
  }

  async function deleteGroupInvite(invite) {
    const current = state();
    if (!current.selectedGroupId || !invite?.tokenHash || !windowRef?.confirm?.("Revogar este convite? O link deixará de funcionar.")) return;
    patch({ groupInviteBusyId: invite.tokenHash, groupAdminError: "" });
    try {
      await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}/invites/${encodeURIComponent(invite.tokenHash)}`, { method: "DELETE" });
      patch({ groupInvites: current.groupInvites.filter((item) => item.tokenHash !== invite.tokenHash), notice: "Convite revogado." });
    } catch (error) {
      patch({ groupAdminError: error.message });
    } finally {
      patch({ groupInviteBusyId: "" });
    }
  }

  function openGroupContextMenu(event, group) {
    event.preventDefault();
    event.stopPropagation();
    closeVoiceContextMenu?.();
    const width = 244;
    const height = 286;
    patch({ groupContextMenu: { x: Math.min(event.clientX, Math.max(8, windowRef.innerWidth - width - 8)), y: Math.min(event.clientY, Math.max(8, windowRef.innerHeight - height - 8)), group } });
    void tick?.().then(() => documentRef?.querySelector(".group-context-menu")?.focus());
  }

  function closeGroupContextMenu() {
    patch({ groupContextMenu: null });
  }

  function handleGroupContextMenuKeydown(event) {
    if (event.key === "Escape") closeGroupContextMenu();
  }

  function openRoomContextMenu(event, room) {
    const current = state();
    if (!room || !["text", "voice"].includes(room.kind)) return;
    event.preventDefault();
    event.stopPropagation();
    closeGroupContextMenu();
    closeVoiceContextMenu?.();
    const width = 244;
    const height = 238;
    patch({ roomContextMenu: { x: Math.min(event.clientX, Math.max(8, windowRef.innerWidth - width - 8)), y: Math.min(event.clientY, Math.max(8, windowRef.innerHeight - height - 8)), room } });
    void tick?.().then(() => documentRef?.querySelector(".room-context-menu")?.focus());
  }

  function closeRoomContextMenu() {
    patch({ roomContextMenu: null });
  }

  function handleRoomContextMenuKeydown(event) {
    if (event.key === "Escape") closeRoomContextMenu();
  }

  async function copyRoomLink(room) {
    const current = state();
    const url = new URL(windowRef.location.origin);
    url.searchParams.set("group", current.selectedGroupId || "");
    url.searchParams.set("room", room.id);
    await copyText(url.href, "Link do canal copiado.", "Não foi possível copiar o link do canal.");
    closeRoomContextMenu();
  }

  function openRoomForEditing(room) {
    const current = state();
    if (!room || current.selectedGroup?.role !== "owner" || room.slug === "geral") return;
    patch({ roomDialogMode: "edit", editingRoomId: room.id, roomName: room.name, roomKind: room.kind, roomMaxParticipants: Number(room.maxParticipants) || 8, roomContextMenu: null, showRoomDialog: true });
  }

  function deleteGroupRoom(room) {
    const current = state();
    if (!room || current.selectedGroup?.role !== "owner" || room.slug === "geral") return;
    patch({ roomContextMenu: null, deleteRoomTarget: room, deleteRoomError: "", showDeleteRoomDialog: true });
  }

  async function confirmDeleteGroupRoom() {
    const current = state();
    const room = current.deleteRoomTarget;
    if (!room || current.deleteRoomBusy) return;
    patch({ deleteRoomBusy: true, deleteRoomError: "" });
    try {
      await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}/rooms/${encodeURIComponent(room.id)}`, { method: "DELETE" });
      await loadGroup(current.selectedGroupId);
      patch({ notice: `Canal #${room.name} excluído.`, showDeleteRoomDialog: false, deleteRoomTarget: null });
    } catch (error) {
      patch({ deleteRoomError: error.message || "Não foi possível excluir o canal." });
    } finally {
      patch({ deleteRoomBusy: false });
    }
  }

  function runRoomContextAction(action) {
    const current = state();
    const room = current.roomContextMenu?.room;
    if (!room) return;
    if (action === "open") {
      closeRoomContextMenu();
      void selectRoom?.(room.id);
    } else if (action === "read") {
      const knownGroupMessageIds = new Set([
        ...current.knownGroupMessageIds,
        ...(current.groupOverview?.messages || []).filter((message) => messageBelongsToRoom(message, room)).map((message) => message.id),
      ]);
      patch({ knownGroupMessageIds });
      if (room.kind === "text") void markGroupRoomRead?.(room);
      closeRoomContextMenu();
      patch({ notice: `#${room.name} marcado como lido.` });
    } else if (action === "copy") {
      void copyRoomLink(room);
    } else if (action === "edit") {
      openRoomForEditing(room);
    } else if (action === "delete") {
      void deleteGroupRoom(room);
    }
  }

  async function runGroupContextAction(action) {
    const current = state();
    const group = current.groupContextMenu?.group;
    closeGroupContextMenu();
    if (!group) return;
    if (current.selectedGroupId !== group.id) await loadGroup(group.id);
    setGroupsView?.();
    if (action === "open") return;
    if (action === "invite") return openInviteDialog?.();
    if (action === "invite-link") return createGroupInvite();
    if (action === "settings") return openSettings?.("group", "groups");
    if (action === "leave") return openLeaveGroupDialog?.();
    if (action === "delete") return openDeleteGroupDialog();
  }

  function openDeleteGroupDialog() {
    const current = state();
    if (!current.selectedGroupId || current.selectedGroup?.role !== "owner") return;
    patch({ deleteGroupError: "", showDeleteGroupDialog: true });
  }

  async function deleteSelectedGroup() {
    const current = state();
    if (!current.selectedGroupId || current.selectedGroup?.role !== "owner" || current.deleteGroupBusy) return;
    patch({ deleteGroupBusy: true, deleteGroupError: "" });
    const deletedGroupName = current.selectedGroup?.name || "o grupo";
    try {
      if (current.voiceState === "connected" && current.voiceRoomId && current.voiceRooms.some((room) => room.id === current.voiceRoomId)) leaveVoiceRoom?.({ silent: true });
      await api(`/api/groups/${encodeURIComponent(current.selectedGroupId)}`, { method: "DELETE" });
      const nextGroups = current.groups.filter((group) => group.id !== current.selectedGroupId);
      patch({ groups: nextGroups, groupOverview: null, selectedRoomId: null, selectedGroupId: nextGroups[0]?.id || null, showDeleteGroupDialog: false });
      if (nextGroups[0]?.id) await loadGroup(nextGroups[0].id);
      else patch({ view: "home" });
      patch({ notice: `${deletedGroupName} foi excluído.` });
    } catch (error) {
      patch({ deleteGroupError: error.message || "Não foi possível excluir o grupo agora." });
    } finally {
      patch({ deleteGroupBusy: false });
    }
  }

  return {
    saveGroupSettings,
    createGroupRole,
    assignMemberRole,
    updateRolePermission,
    deleteGroupRole,
    saveGroupRoleDetails,
    setRoleMember,
    createGroupInvite,
    copyGroupInvite,
    deleteGroupInvite,
    openGroupContextMenu,
    closeGroupContextMenu,
    handleGroupContextMenuKeydown,
    openRoomContextMenu,
    closeRoomContextMenu,
    handleRoomContextMenuKeydown,
    copyRoomLink,
    openRoomForEditing,
    deleteGroupRoom,
    confirmDeleteGroupRoom,
    runRoomContextAction,
    runGroupContextAction,
    openDeleteGroupDialog,
    deleteSelectedGroup,
  };
}
