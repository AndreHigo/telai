export function createGroupMessageController({
  api,
  getState,
  setState,
  selectRoom,
  scrollGroupMessagesToBottom,
}) {
  async function searchGroupMessages() {
    const state = getState();
    if (state.groupMessageSearchBusy || !state.selectedGroupId) return;
    const query = state.groupMessageSearchQuery.trim();
    setState({ groupMessageSearchError: "" });
    if (query.length < 2) {
      setState({
        groupMessageSearchResults: [],
        ...(query ? { groupMessageSearchError: "Digite pelo menos 2 caracteres para pesquisar." } : {}),
      });
      return;
    }
    setState({ groupMessageSearchBusy: true });
    try {
      const result = await api("/api/groups/" + encodeURIComponent(state.selectedGroupId) + "/messages/search?q=" + encodeURIComponent(query));
      setState({
        groupMessageSearchResults: result.messages || [],
        ...((result.messages || []).length ? {} : { groupMessageSearchError: "Nenhuma mensagem encontrada." }),
      });
    } catch (error) {
      setState({ groupMessageSearchError: error.message });
    } finally {
      setState({ groupMessageSearchBusy: false });
    }
  }

  function openGroupMessageSearch() {
    setState({
      groupMessageSearchQuery: "",
      groupMessageSearchResults: [],
      groupMessageSearchError: "",
      showGroupMessageSearch: true,
    });
  }

  async function openGroupMessageSearchResult(message) {
    const state = getState();
    const room = state.rooms.find((candidate) => candidate.id === message.roomId)
      || state.rooms.find((candidate) => candidate.slug === "geral" && candidate.kind === "text");
    setState({ showGroupMessageSearch: false });
    if (room) await selectRoom(room.id);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const state = getState();
    const body = state.messageDraft.trim();
    const attachments = state.messageAttachments.slice();
    if (!state.selectedGroupId || (!body && !attachments.length) || state.selectedRoom?.kind !== "text") return;
    const groupId = state.selectedGroupId;
    const roomId = state.selectedRoomId;
    const pendingId = "pending-" + Date.now();
    const pendingMessage = {
      id: pendingId,
      roomId,
      body,
      displayName: state.user.displayName,
      username: state.user.username,
      userId: state.user.id,
      createdAt: new Date().toISOString(),
      attachments: attachments.map(({ name, type, size }) => ({ name, mimeType: type, byteSize: size, pending: true })),
      pending: true,
    };
    if (state.groupOverview?.group?.id === groupId) {
      setState({ groupOverview: { ...state.groupOverview, messages: [...(state.groupOverview.messages || []), pendingMessage].slice(-80) } });
    }
    setState({ messageDraft: "", messageAttachments: [] });
    await scrollGroupMessagesToBottom({ force: true });
    try {
      const result = await api("/api/groups/" + encodeURIComponent(groupId) + "/messages", {
        method: "POST",
        body: JSON.stringify({ body, roomId, attachments }),
      });
      const current = getState();
      if (current.selectedGroupId === groupId && current.groupOverview?.group?.id === groupId && result.message) {
        const messages = current.groupOverview.messages || [];
        const pendingStillVisible = messages.some((message) => message.id === pendingId);
        setState({
          knownGroupMessageIds: new Set([...current.knownGroupMessageIds, result.message.id]),
          groupOverview: {
            ...current.groupOverview,
            messages: pendingStillVisible
              ? messages.map((message) => message.id === pendingId ? result.message : message)
              : [...messages, result.message].slice(-80),
          },
        });
        await scrollGroupMessagesToBottom({ force: true });
      }
    } catch (error) {
      const current = getState();
      if (current.selectedGroupId === groupId && current.groupOverview?.group?.id === groupId) {
        setState({ groupOverview: { ...current.groupOverview, messages: (current.groupOverview.messages || []).filter((message) => message.id !== pendingId) } });
      }
      setState({ messageDraft: body, messageAttachments: attachments, notice: error.message });
    }
  }

  async function addMessageAttachments(event) {
    const files = [...(event.currentTarget.files || [])];
    event.currentTarget.value = "";
    if (!files.length) return;
    const state = getState();
    try {
      const { readMessageAttachments } = await import("../../services/media/message-attachments.js");
      const next = await readMessageAttachments(
        files,
        state.messageAttachments.length,
        state.messageAttachments.reduce((total, attachment) => total + attachment.size, 0),
      );
      setState({ messageAttachments: [...getState().messageAttachments, ...next] });
    } catch (error) {
      setState({ notice: error.message });
    }
  }

  function removeMessageAttachment(index) {
    setState({ messageAttachments: getState().messageAttachments.filter((_, attachmentIndex) => attachmentIndex !== index) });
  }

  function startEditMessage(message) {
    setState({ editingMessageId: message.id, editingMessageDraft: message.body });
  }

  function cancelEditMessage() {
    setState({ editingMessageId: "", editingMessageDraft: "" });
  }

  async function saveEditMessage(message) {
    const state = getState();
    const body = state.editingMessageDraft.trim();
    if (!body || !state.selectedGroupId) return;
    try {
      const result = await api("/api/groups/" + encodeURIComponent(state.selectedGroupId) + "/messages/" + encodeURIComponent(message.id), {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
      const current = getState();
      if (result.message && current.groupOverview?.group?.id === current.selectedGroupId) {
        if (message.parentMessageId && current.activeGroupThread?.id === message.parentMessageId) {
          setState({ groupThreadMessages: current.groupThreadMessages.map((item) => item.id === message.id ? result.message : item) });
        } else {
          setState({ groupOverview: { ...current.groupOverview, messages: (current.groupOverview.messages || []).map((item) => item.id === message.id ? result.message : item) } });
        }
      }
      cancelEditMessage();
    } catch (error) {
      setState({ notice: error.message });
    }
  }

  async function deleteMessage(message) {
    const state = getState();
    if (!state.selectedGroupId || !window.confirm("Excluir esta mensagem?")) return;
    try {
      await api("/api/groups/" + encodeURIComponent(state.selectedGroupId) + "/messages/" + encodeURIComponent(message.id), { method: "DELETE" });
      const current = getState();
      if (message.parentMessageId) {
        setState({
          ...(current.activeGroupThread?.id === message.parentMessageId ? { groupThreadMessages: current.groupThreadMessages.filter((item) => item.id !== message.id) } : {}),
          groupOverview: {
            ...current.groupOverview,
            messages: (current.groupOverview.messages || []).map((item) => item.id === message.parentMessageId ? { ...item, threadCount: Math.max(0, (item.threadCount || 0) - 1) } : item),
          },
          knownGroupMessageIds: new Set([...current.knownGroupMessageIds].filter((id) => id !== message.id)),
        });
      } else {
        setState({
          groupOverview: { ...current.groupOverview, messages: (current.groupOverview.messages || []).filter((item) => item.id !== message.id) },
          knownGroupMessageIds: new Set([...current.knownGroupMessageIds].filter((id) => id !== message.id)),
        });
      }
    } catch (error) {
      setState({ notice: error.message });
    }
  }

  return {
    addMessageAttachments,
    cancelEditMessage,
    deleteMessage,
    openGroupMessageSearch,
    openGroupMessageSearchResult,
    removeMessageAttachment,
    saveEditMessage,
    searchGroupMessages,
    sendMessage,
    startEditMessage,
  };
}
