export function createGroupMembershipController({
  api,
  getUser,
  getState,
  setState,
  loadGroups,
  loadGroup,
  loadNotifications,
  markNotificationRead,
  openSettings,
  setGroupsView,
}) {
  function openInviteDialog() {
    setState({
      inviteSearchQuery: "",
      inviteSearchResults: [],
      inviteSearchError: "",
      groupInviteLink: "",
      showInviteDialog: true,
    });
  }

  async function searchUsers() {
    const state = getState();
    if (state.inviteSearchBusy) return;
    const query = state.inviteSearchQuery.trim();
    if (query.length < 2) {
      setState({
        inviteSearchError: "Digite pelo menos 2 caracteres para pesquisar.",
        inviteSearchResults: [],
      });
      return;
    }
    setState({ inviteSearchBusy: true, inviteSearchError: "" });
    try {
      const result = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
      setState({
        inviteSearchResults: result.users || [],
        ...((result.users || []).length ? {} : { inviteSearchError: "Nenhuma conta encontrada." }),
      });
    } catch (error) {
      setState({ inviteSearchError: error.message });
    } finally {
      setState({ inviteSearchBusy: false });
    }
  }

  async function inviteUser(target) {
    const state = getState();
    if (!state.selectedGroupId || !target?.id) return;
    setState({ inviteActionId: target.id, inviteSearchError: "" });
    try {
      await api(`/api/groups/${encodeURIComponent(state.selectedGroupId)}/member-invites`, {
        method: "POST",
        body: JSON.stringify({ userId: target.id }),
      });
      setState({
        inviteSearchResults: getState().inviteSearchResults.filter((item) => item.id !== target.id),
        notice: `Convite enviado para ${target.displayName}.`,
      });
    } catch (error) {
      setState({ inviteSearchError: error.message });
    } finally {
      setState({ inviteActionId: "" });
    }
  }

  async function searchGroups() {
    const state = getState();
    if (state.groupSearchBusy) return;
    const query = state.groupSearchQuery.trim();
    setState({ groupSearchError: "" });
    if (query.length < 2) {
      setState({
        groupSearchResults: [],
        ...(query ? { groupSearchError: "Digite pelo menos 2 caracteres para pesquisar." } : {}),
      });
      return;
    }
    setState({ groupSearchBusy: true });
    try {
      const result = await api(`/api/groups/search?q=${encodeURIComponent(query)}`);
      setState({
        groupSearchResults: result.groups || [],
        ...((result.groups || []).length ? {} : { groupSearchError: "Nenhum grupo encontrado." }),
      });
    } catch (error) {
      setState({ groupSearchError: error.message });
    } finally {
      setState({ groupSearchBusy: false });
    }
  }

  function openGroupSearchDialog() {
    setState({
      groupSearchQuery: "",
      groupSearchResults: [],
      groupSearchError: "",
      showGroupSearchDialog: true,
    });
  }

  async function requestGroupEntry(group) {
    if (!group?.id) return;
    setState({ groupJoinActionId: group.id, groupSearchError: "" });
    try {
      await api(`/api/groups/${encodeURIComponent(group.id)}/join-requests`, { method: "POST" });
      setState({
        groupSearchResults: getState().groupSearchResults.map((item) => item.id === group.id ? { ...item, requestStatus: "pending" } : item),
        notice: `Solicitação enviada para ${group.name}.`,
      });
    } catch (error) {
      setState({ groupSearchError: error.message });
    } finally {
      setState({ groupJoinActionId: "" });
    }
  }

  async function respondToGroupJoinRequest(joinRequest, status) {
    const state = getState();
    if (!state.selectedGroupId || !joinRequest?.id) return;
    setState({ groupJoinActionId: joinRequest.id, groupAdminError: "" });
    try {
      await api(`/api/groups/${encodeURIComponent(state.selectedGroupId)}/join-requests/${encodeURIComponent(joinRequest.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setState({
        groupJoinRequests: getState().groupJoinRequests.filter((item) => item.id !== joinRequest.id),
        notice: status === "approved" ? `${joinRequest.displayName} entrou no grupo.` : "Solicitação recusada.",
      });
      if (status === "approved") await loadGroup(state.selectedGroupId);
    } catch (error) {
      setState({ groupAdminError: error.message });
    } finally {
      setState({ groupJoinActionId: "" });
    }
  }

  async function respondToInvite(invite, action) {
    const inviteId = invite?.entityId || invite?.id;
    if (!inviteId) return;
    setState({ inviteActionId: inviteId });
    try {
      await markNotificationRead(invite);
      await api(`/api/member-invites/${encodeURIComponent(inviteId)}/${action}`, { method: "POST" });
      await loadNotifications();
      if (action === "accept") {
        await loadGroups();
        setState({ notice: `Você entrou no grupo ${invite.groupName}.` });
      } else {
        setState({ notice: "Convite recusado." });
      }
    } catch (error) {
      setState({ notice: error.message });
    } finally {
      setState({ inviteActionId: "" });
    }
  }

  async function redeemPendingInvite() {
    const state = getState();
    if (!state.pendingInviteToken) return;
    if (!getUser()) {
      setState({ notice: "Entre ou crie sua conta para aceitar este convite." });
      return;
    }
    const token = state.pendingInviteToken;
    try {
      const result = await api(`/api/invites/${encodeURIComponent(token)}/redeem`, { method: "POST" });
      setState({ pendingInviteToken: "" });
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("invite");
      window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      await loadGroups();
      if (result.groupId) await loadGroup(result.groupId);
      setGroupsView();
      setState({ notice: "Você entrou no grupo pelo convite." });
    } catch (error) {
      setState({ notice: error.message });
    }
  }

  return {
    inviteUser,
    openGroupSearchDialog,
    openInviteDialog,
    redeemPendingInvite,
    requestGroupEntry,
    respondToGroupJoinRequest,
    respondToInvite,
    searchGroups,
    searchUsers,
  };
}
