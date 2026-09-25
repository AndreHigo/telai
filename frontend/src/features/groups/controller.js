export function createGroupController({
  api,
  getState,
  setState,
  mergeActiveVoicePresence,
  shouldKeepGroupMessagesAtBottom,
  scrollGroupMessagesToBottom,
  playVoiceSound,
  setNotice,
  getUser,
  getIsViewer,
  subscribeGroup,
  getSelectedRoomId,
  markGroupRoomRead,
  getVoiceSoundContext,
  getMessageComposerInput,
  tick,
  joinVoiceRoom,
}) {
  async function loadGroups() {
    const result = await api("/api/groups");
    const groups = result.groups || [];
    const state = getState();
    setState({ groups, ...(state.selectedGroupId && groups.some((group) => group.id === state.selectedGroupId) ? {} : { selectedGroupId: groups[0]?.id || null }) });
  }

  async function loadGroup(groupId) {
    if (!groupId) return;
    let loadedResult = null;
    const state = getState();
    const loadSequence = state.groupLoadSequence + 1;
    const switchingGroup = Boolean(state.selectedGroupId && state.selectedGroupId !== groupId);
    setState({
      groupLoadSequence: loadSequence,
      groupLoading: true,
      watchingGroupLiveStreamId: "",
      selectedGroupId: groupId,
    });
    let request = state.pendingGroupOverviewRequests.get(groupId);
    if (!request) {
      request = api(`/api/groups/${encodeURIComponent(groupId)}/overview`);
      state.pendingGroupOverviewRequests.set(groupId, request);
      void request.finally(() => {
        if (state.pendingGroupOverviewRequests.get(groupId) === request) state.pendingGroupOverviewRequests.delete(groupId);
      }).catch(() => {});
    }
    try {
      const result = await request;
      loadedResult = result;
      const current = getState();
      setState({ groupOverviewRetryAt: 0 });
      if (loadSequence !== current.groupLoadSequence || current.selectedGroupId !== groupId) return;
      setState({
        groupOverview: mergeActiveVoicePresence(result),
        knownGroupMessageIds: new Set((result.messages || []).map((message) => message.id)),
        selectedRoomId: result.rooms?.find((room) => room.kind === "text")?.id || result.rooms?.[0]?.id || null,
      });
    } catch (error) {
      if (error?.status === 429) {
        setState({ groupOverviewRetryAt: Date.now() + Math.max(5_000, (error.retryAfter || 30) * 1_000) });
      }
      const current = getState();
      if (loadSequence !== current.groupLoadSequence || current.selectedGroupId !== groupId) return;
      setState({ groupOverview: null, knownGroupMessageIds: new Set(), selectedRoomId: null });
      setNotice(error.message);
    } finally {
      const current = getState();
      if (loadSequence !== current.groupLoadSequence) return;
      setState({ groupLoading: false, showGroupPicker: false });
      void scrollGroupMessagesToBottom({ force: true });
      if (switchingGroup && current.broadcastState === "live") {
        setNotice("Sua live continua ativa. Use “Voltar à live” no topo ou encerre-a antes de iniciar outra.");
      }
    }
    if (loadedResult?.group?.id === groupId) {
      if (getUser?.() && !getIsViewer?.()) subscribeGroup?.(groupId);
      const room = (loadedResult.rooms || []).find((candidate) => candidate.id === getSelectedRoomId?.() && candidate.kind === "text");
      if (room) void markGroupRoomRead?.(room);
    }
    return loadedResult;
  }

  async function refreshGroupOverview({ includeMessages = true } = {}) {
    const state = getState();
    if (!state.selectedGroupId || state.groupLoading || state.groupOverviewRefreshInFlight || Date.now() < state.groupOverviewRetryAt) return;
    setState({ groupOverviewRefreshInFlight: true });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(state.selectedGroupId)}/overview${includeMessages ? "" : "?includeMessages=0"}`);
      const current = getState();
      setState({ groupOverviewRetryAt: 0 });
      if (current.selectedGroupId !== result.group?.id) return;
      const hasMessages = Array.isArray(result.messages);
      const messages = hasMessages ? result.messages : (current.groupOverview?.messages || []);
      const newMessages = hasMessages ? messages.filter((message) => !current.knownGroupMessageIds.has(message.id)) : [];
      const messageList = document.querySelector(".chat-workspace .message-list");
      const keepAtBottom = shouldKeepGroupMessagesAtBottom(messageList);
      if (current.groupOverview && newMessages.some((message) => message.userId !== current.user?.id)) playVoiceSound("message");
      const nextOverview = mergeActiveVoicePresence({ ...result, messages });
      setState({
        knownGroupMessageIds: hasMessages ? new Set(messages.map((message) => message.id)) : current.knownGroupMessageIds,
        groupOverview: nextOverview,
      });
      if (newMessages.length && keepAtBottom) void scrollGroupMessagesToBottom({ force: true });
    } catch (error) {
      if (error?.status === 429) setState({ groupOverviewRetryAt: Date.now() + Math.max(5_000, (error.retryAfter || 30) * 1_000) });
    } finally {
      setState({ groupOverviewRefreshInFlight: false });
    }
  }

  async function refreshGroupPresence() {
    const state = getState();
    if (!state.selectedGroupId || state.groupLoading || state.groupPresenceRefreshInFlight || !state.groupOverview) return;
    setState({ groupPresenceRefreshInFlight: true });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(state.selectedGroupId)}/presence`);
      const current = getState();
      if (current.selectedGroupId !== result.groupId || !current.groupOverview) return;
      const onlineById = new Map((result.members || []).map((member) => [member.id, Boolean(member.online)]));
      setState({
        groupOverview: {
          ...current.groupOverview,
          members: (current.groupOverview.members || []).map((member) => (
            onlineById.has(member.id) ? { ...member, online: onlineById.get(member.id) } : member
          )),
        },
      });
    } catch {}
    finally { setState({ groupPresenceRefreshInFlight: false }); }
  }

  async function selectRoom(roomId) {
    const state = getState();
    const room = (state.groupOverview?.rooms || []).find((candidate) => candidate.id === roomId);
    if (!room) return;
    setState({
      selectedRoomId: room.id,
      watchingGroupLiveStreamId: "",
      showMobileChannels: false,
      mentionSuggestions: [],
      mentionStartIndex: -1,
    });
    if (room.kind === "text") void markGroupRoomRead?.(room);
    if (room.kind === "voice") getVoiceSoundContext?.();
    await tick?.();
    const current = getState();
    if (room.kind === "text" && current.selectedRoomId === room.id) {
      getMessageComposerInput?.()?.focus?.();
      void scrollGroupMessagesToBottom({ force: true });
    }
    if (room.kind === "voice" && current.selectedRoomId === room.id) await joinVoiceRoom?.();
  }

  return { loadGroup, loadGroups, refreshGroupOverview, refreshGroupPresence, selectRoom };
}
