export function createDirectController({
  api,
  tick,
  getUser,
  getView,
  getState,
  setState,
  loadNotifications,
  closeVoiceContextMenu,
  setNotice,
}) {
  async function scrollToBottom() {
    await tick();
    const list = document.querySelector(".direct-message-list");
    if (list) list.scrollTop = list.scrollHeight;
  }

  async function loadDirectConversations() {
    if (getState().directConversationsRefreshInFlight) return;
    setState({ directConversationsRefreshInFlight: true });
    try {
      const result = await api("/api/direct/conversations");
      setState({ directConversations: result.conversations || [] });
    } finally {
      setState({ directConversationsRefreshInFlight: false });
    }
  }

  function listedDirectConversationTarget(conversationId) {
    return getState().directConversations.find((conversation) => conversation.id === conversationId)?.otherUser || null;
  }

  async function loadDirectConversationMessages({ silent = false } = {}) {
    const state = getState();
    const conversationId = state.directConversationId;
    if (!conversationId) return;
    if (state.directConversationRefreshInFlight) {
      setState({ directConversationRefreshQueued: true });
      return;
    }
    setState({
      directConversationRefreshInFlight: true,
      directConversationRefreshId: conversationId,
      ...(silent ? {} : { directConversationLoading: true }),
      directConversationError: "",
    });
    try {
      const result = await api(`/api/direct/conversations/${encodeURIComponent(conversationId)}/messages`);
      const current = getState();
      if (current.directConversationId !== conversationId || current.directConversationRefreshId !== conversationId) return;
      setState({
        directConversationTarget: result.conversation?.otherUser || listedDirectConversationTarget(conversationId) || current.directConversationTarget,
        directMessages: result.messages || [],
      });
      if (getView() === "direct" && getState().directConversationId === conversationId) await scrollToBottom();
    } catch (error) {
      if (getState().directConversationId === conversationId) setState({ directConversationError: error.message });
    } finally {
      const current = getState();
      setState({
        directConversationRefreshInFlight: false,
        directConversationRefreshId: "",
        ...(silent ? {} : { directConversationLoading: false }),
      });
      if (current.directConversationRefreshQueued) {
        setState({ directConversationRefreshQueued: false });
        void loadDirectConversationMessages({ silent: true });
      }
    }
  }

  async function openDirectConversationById(conversationId) {
    if (!conversationId) return;
    const listedTarget = listedDirectConversationTarget(conversationId);
    setState({ directConversationLoading: true, directConversationError: "", view: "direct" });
    try {
      const result = await api(`/api/direct/conversations/${encodeURIComponent(conversationId)}/messages?includeAvatar=1`);
      setState({
        directConversationId: result.conversation.id,
        directConversationTarget: result.conversation.otherUser || listedTarget,
        directMessages: result.messages || [],
      });
      await loadDirectConversations();
      await loadNotifications({ silent: true });
      await scrollToBottom();
    } catch (error) {
      setState({ directConversationError: error.message });
    } finally {
      setState({ directConversationLoading: false });
    }
  }

  async function openDirectConversationWithUser(targetUser) {
    // Participantes de voz usam `id` para a conexão WebRTC; a conta Telai
    // fica em `userId`. Para mensagens privadas, o segundo é a referência
    // persistente e precisa ter prioridade quando os dois existem.
    const targetUserId = targetUser?.userId || targetUser?.id;
    if (!targetUserId || targetUserId === getUser()?.id) {
      setNotice("Você não pode iniciar uma conversa consigo mesmo.");
      closeVoiceContextMenu();
      return;
    }
    closeVoiceContextMenu();
    setState({ directConversationLoading: true, directConversationError: "", view: "direct" });
    try {
      const result = await api("/api/direct/conversations", { method: "POST", body: JSON.stringify({ userId: targetUserId }) });
      setState({ directConversationId: result.conversation.id, directConversationTarget: result.conversation.otherUser });
      await loadDirectConversationMessages();
      await loadDirectConversations();
    } catch (error) {
      setState({ directConversationError: error.message });
    } finally {
      setState({ directConversationLoading: false });
    }
  }

  async function sendDirectMessage(event) {
    event.preventDefault();
    const state = getState();
    const body = state.directMessageDraft.trim();
    if (!state.directConversationId || !body || state.directConversationSending) return;
    setState({ directConversationSending: true, directConversationError: "" });
    try {
      const result = await api(`/api/direct/conversations/${encodeURIComponent(state.directConversationId)}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      const current = getState();
      setState({
        ...(result.message ? { directMessages: [...current.directMessages, result.message] } : {}),
        directMessageDraft: "",
      });
      await loadDirectConversations();
      await scrollToBottom();
    } catch (error) {
      setState({ directConversationError: error.message });
    } finally {
      setState({ directConversationSending: false });
    }
  }

  return {
    loadDirectConversationMessages,
    loadDirectConversations,
    openDirectConversationById,
    openDirectConversationWithUser,
    sendDirectMessage,
  };
}
