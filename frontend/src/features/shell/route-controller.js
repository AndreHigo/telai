const AUTH_ERROR_MESSAGES = {
  "login-required": "Entre para vincular uma conta externa.",
  "oauth-denied": "O acesso externo foi cancelado.",
  "oauth-failed": "Não foi possível concluir o acesso externo.",
};

export function createRouteController({ getState, setState, windowObject = globalThis.window, loadGroup, setGroupState, setGroupsView } = {}) {
  function replaceBrowserPath(pathname, { preserveQuery = true } = {}) {
    const url = new URL(windowObject.location.href);
    url.pathname = pathname;
    if (!preserveQuery) url.search = "";
    windowObject.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  function canonicalizeAuthenticatedRoute() {
    if (getState().isViewer) return;
    const pathname = windowObject.location.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/login") replaceBrowserPath("/");
  }

  function detectViewerRoute() {
    const url = new URL(windowObject.location.href);
    setState({
      pendingInviteToken: url.searchParams.get("invite") || "",
      pendingGroupRouteId: url.searchParams.get("group") || "",
      pendingRoomRouteId: url.searchParams.get("room") || "",
    });
    const queryAuthError = url.searchParams.get("auth_error");
    if (queryAuthError) {
      setState({ authError: AUTH_ERROR_MESSAGES[queryAuthError] || "Não foi possível concluir o acesso externo." });
      url.searchParams.delete("auth_error");
      windowObject.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
    const queryRoom = url.searchParams.get("room");
    if (url.searchParams.get("mode") === "viewer" && queryRoom) {
      setState({ isViewer: true, viewerRoomId: queryRoom, viewerStreamPath: "" });
      return;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const reserved = new Set(["login", "svelte", "download", "updates"]);
    const friendly = [1, 2].includes(parts.length)
      && parts.every((part) => /^[a-zA-Z0-9_.-]+$/.test(part))
      && !reserved.has(parts[0].toLowerCase());
    if (friendly) {
      setState({ isViewer: true, viewerRoomId: "", viewerStreamPath: url.pathname });
    }
  }

  async function openPendingChannelRoute() {
    const state = getState();
    if (!state.user || state.isViewer || !state.pendingGroupRouteId) return;
    const groupId = state.pendingGroupRouteId;
    try {
      if (state.selectedGroupId !== groupId || state.groupOverview?.group?.id !== groupId) await loadGroup?.(groupId);
      const current = getState();
      const room = (current.rooms || []).find((candidate) => candidate.id === current.pendingRoomRouteId && ["text", "voice"].includes(candidate.kind));
      if (room) {
        setGroupState?.({ selectedRoomId: room.id });
        setGroupsView?.();
      }
      setState({ pendingGroupRouteId: "", pendingRoomRouteId: "" });
    } catch {}
  }

  return { replaceBrowserPath, canonicalizeAuthenticatedRoute, detectViewerRoute, openPendingChannelRoute };
}
