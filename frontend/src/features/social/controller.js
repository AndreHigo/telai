export function createSocialController({
  api,
  getUser,
  getState,
  setState,
  loadStreams,
  setNotice,
}) {
  const state = () => getState();

  async function loadSocial() {
    if (state().socialRefreshInFlight) return;
    setState({ socialRefreshInFlight: true });
    try {
      const result = await api("/api/social");
      setState({ social: result });
    } finally {
      setState({ socialRefreshInFlight: false });
    }
  }

  async function searchSocialUsers() {
    const current = state();
    if (current.socialSearchBusy) return;
    const query = current.socialSearchQuery.trim();
    setState({ socialError: "" });
    if (query.length < 2) {
      setState({ socialSearchResults: [], ...(query ? { socialError: "Digite pelo menos 2 caracteres para pesquisar." } : {}) });
      return;
    }
    setState({ socialSearchBusy: true });
    try {
      const result = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
      const socialSearchResults = result.users || [];
      setState({
        socialSearchResults,
        ...(socialSearchResults.length ? {} : { socialError: "Nenhuma pessoa encontrada." }),
      });
    } catch (error) {
      setState({ socialError: error.message });
    } finally {
      setState({ socialSearchBusy: false });
    }
  }

  async function sendFriendRequest(target) {
    const current = state();
    if (!target?.id || current.socialActionId) return false;
    setState({ socialActionId: target.id, socialError: "" });
    let sent = false;
    try {
      await api(`/api/friends/${encodeURIComponent(target.id)}`, { method: "POST" });
      setState({ socialSearchResults: state().socialSearchResults.map((item) => item.id === target.id ? { ...item, friendshipStatus: "pending_sent" } : item) });
      await loadSocial();
      setNotice(`Solicitação enviada para ${target.displayName}.`);
      sent = true;
    } catch (error) {
      setState({ socialError: error.message });
      setNotice(error.message);
    } finally {
      setState({ socialActionId: "" });
    }
    return sent;
  }

  async function respondToFriendRequest(request, action) {
    const current = state();
    if (!request?.id || current.socialActionId) return;
    setState({ socialActionId: request.id, socialError: "" });
    try {
      await api(`/api/friends/requests/${encodeURIComponent(request.id)}/${action}`, { method: "POST" });
      await loadSocial();
      setNotice(action === "accept" ? `${request.displayName} agora está na sua lista de amigos.` : "Solicitação recusada.");
    } catch (error) {
      setState({ socialError: error.message });
    } finally {
      setState({ socialActionId: "" });
    }
  }

  async function cancelFriendRequest(request) {
    const current = state();
    if (!request?.id || current.socialActionId) return;
    setState({ socialActionId: request.id, socialError: "" });
    try {
      await api(`/api/friends/requests/${encodeURIComponent(request.id)}`, { method: "DELETE" });
      await loadSocial();
    } catch (error) {
      setState({ socialError: error.message });
    } finally {
      setState({ socialActionId: "" });
    }
  }

  async function removeFriend(friend) {
    const current = state();
    if (!friend?.id || current.socialActionId) return;
    setState({ socialActionId: friend.id, socialError: "" });
    try {
      await api(`/api/friends/${encodeURIComponent(friend.id)}`, { method: "DELETE" });
      await loadSocial();
      setNotice(`${friend.displayName} foi removido dos seus amigos.`);
    } catch (error) {
      setState({ socialError: error.message });
    } finally {
      setState({ socialActionId: "" });
    }
  }

  async function toggleFollowUser(target) {
    const current = state();
    if (!target?.id || current.socialActionId) return;
    setState({ socialActionId: `follow:${target.id}`, socialError: "" });
    const nextFollowing = !target.following;
    try {
      await api(`/api/users/${encodeURIComponent(target.id)}/follow`, { method: nextFollowing ? "POST" : "DELETE" });
      setState({ socialSearchResults: state().socialSearchResults.map((item) => item.id === target.id ? { ...item, following: nextFollowing } : item) });
      await loadSocial();
      setNotice(nextFollowing ? `Você está seguindo ${target.displayName}.` : `Você deixou de seguir ${target.displayName}.`);
    } catch (error) {
      setState({ socialError: error.message });
    } finally {
      setState({ socialActionId: "" });
    }
  }

  async function toggleFollowStream(stream) {
    const current = state();
    if (!stream?.id || stream.channelUsername === getUser()?.username || current.socialActionId) return;
    setState({ socialActionId: `stream-follow:${stream.id}`, socialError: "" });
    const nextFollowing = !Boolean(stream.following);
    try {
      await api(`/api/streams/${encodeURIComponent(stream.id)}/follow`, { method: nextFollowing ? "POST" : "DELETE" });
      setState({ streams: state().streams.map((item) => item.id === stream.id ? { ...item, following: nextFollowing } : item) });
      await loadSocial();
      setNotice(nextFollowing ? `Você está seguindo ${stream.channelName}.` : `Você deixou de seguir ${stream.channelName}.`);
    } catch (error) {
      setState({ socialError: error.message });
    } finally {
      setState({ socialActionId: "" });
    }
  }

  return {
    loadSocial,
    searchSocialUsers,
    sendFriendRequest,
    respondToFriendRequest,
    cancelFriendRequest,
    removeFriend,
    toggleFollowUser,
    toggleFollowStream,
  };
}
