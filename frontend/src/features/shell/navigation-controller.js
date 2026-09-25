export function createNavigationController({
  getState,
  setState,
  loadGroups,
  loadStreams,
  loadNotifications,
  loadDirectConversations,
  loadSocial,
  loadGroup,
  setNotice,
  setNotificationsError,
  setDirectConversationError,
  setSocialError,
}) {
  const state = () => getState();

  function setGroupsView({ openWorkspace = true } = {}) {
    const current = state();
    setState({
      globalSidebarCollapsed: current.view !== "groups" && !current.compactViewport
        ? true
        : current.globalSidebarCollapsed,
      showGlobalSidebar: false,
      view: "groups",
      groupsWorkspaceOpen: openWorkspace,
      ...(openWorkspace ? {} : {
        groupPickerQuery: "",
        showMobileChannels: false,
        showMobileMembers: false,
      }),
    });
  }

  function selectView(next) {
    setState({ multistreamOpen: false, showGlobalSidebar: false });
    if (next === "groups") {
      setGroupsView({ openWorkspace: false });
      void loadGroups().catch((error) => setNotice(error.message));
    } else {
      setState({ view: next });
    }
    if (next === "live") void loadStreams().catch((error) => setNotice(error.message));
    if (next === "notifications") void loadNotifications().catch((error) => setNotificationsError(error.message));
    if (next === "direct") void loadDirectConversations().catch((error) => setDirectConversationError(error.message));
    if (["friends", "following"].includes(next)) void loadSocial().catch((error) => setSocialError(error.message));
  }

  async function openGroupWorkspace(groupId) {
    if (!groupId) return;
    setGroupsView();
    // Abra o workspace imediatamente e carregue o resumo pesado em segundo
    // plano. Assim a navegação responde mesmo quando o grupo tem muitos
    // membros, mensagens ou transmissões ativas.
    void loadGroup(groupId);
  }

  function toggleGlobalNavigation() {
    const current = state();
    if (current.compactViewport) {
      setState({ showGlobalSidebar: !current.showGlobalSidebar });
      return;
    }
    setState({ globalSidebarCollapsed: !current.globalSidebarCollapsed });
  }

  return {
    openGroupWorkspace,
    selectView,
    setGroupsView,
    toggleGlobalNavigation,
  };
}
