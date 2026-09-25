import { streamViewerUrl } from "./stream-url.js";

export function createLiveController({
  api,
  getUser,
  getState,
  setState,
  markNotificationRead,
  returnToBroadcast,
}) {
  const state = () => getState();

  async function loadStreams() {
    const current = state();
    if (current.streamsRefreshInFlight) return;
    setState({ streamsRefreshInFlight: true });
    try {
      const result = await api(`/api/streams${current.followingOnly ? "?following=1" : ""}`);
      const streams = result.streams || [];
      setState({
        streams,
        selectedStreams: new Set([...state().selectedStreams].filter((id) => streams.some((stream) => stream.id === id))),
      });
    } finally {
      setState({ streamsRefreshInFlight: false });
    }
  }

  function isOwnPublicStream(stream) {
    if (!stream || typeof stream === "string") return false;
    const currentUserId = getUser()?.id == null ? "" : String(getUser().id);
    const streamOwnerId = stream.createdBy == null ? "" : String(stream.createdBy);
    if (currentUserId && streamOwnerId && currentUserId === streamOwnerId) return true;
    const currentUsername = String(getUser()?.username || "").trim().toLowerCase();
    const streamUsername = String(stream.channelUsername || "").trim().toLowerCase();
    return Boolean(currentUsername && streamUsername && currentUsername === streamUsername);
  }

  function openStreamViewer(streamOrPath) {
    if (isOwnPublicStream(streamOrPath)) {
      void returnToBroadcast();
      return;
    }
    const streamPath = typeof streamOrPath === "string"
      ? streamOrPath
      : streamOrPath?.publicPath || streamViewerUrl(streamOrPath);
    if (!streamPath) return;
    setState({
      isViewer: false,
      viewerRoomId: "",
      viewerStreamPath: streamPath,
      viewerStream: typeof streamOrPath === "string" ? null : streamOrPath,
    });
    const nextUrl = new URL(streamPath, window.location.origin);
    window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    setState({ view: "viewer" });
  }

  async function openStreamNotification(notification) {
    if (!notification?.streamPath) return;
    await markNotificationRead(notification);
    if (notification?.streamPath) openStreamViewer(notification.streamPath);
  }

  function setLiveNotificationScope(scope, enabled) {
    const current = state();
    const next = new Set(current.liveNotificationScopes);
    if (enabled) next.add(scope);
    else next.delete(scope);
    // Pelo menos um escopo precisa continuar ativo para evitar uma
    // configuração que pareça salva, mas silencie todos os avisos.
    if (!next.size) next.add("related");
    const liveNotificationScopes = ["related", "all"].filter((item) => next.has(item));
    setState({
      liveNotificationScopes,
      liveNotificationScope: liveNotificationScopes.includes("all") ? "all" : "related",
    });
  }

  function toggleStream(id) {
    const next = new Set(state().selectedStreams);
    if (next.has(id)) next.delete(id);
    else if (next.size < 4) next.add(id);
    setState({ selectedStreams: next });
  }

  function handleStreamCardClick(event, stream) {
    if (event.target?.closest?.("button, input, a, select, textarea")) return;
    toggleStream(stream.id);
  }

  function handleStreamCardKeydown(event, stream) {
    if (event.target?.closest?.("button, input, a, select, textarea")) return;
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    toggleStream(stream.id);
  }

  function openMultistream() {
    if (state().selectedStreams.size < 2) return;
    setState({ multistreamOpen: true, view: "multistream" });
  }

  function closeMultistream() {
    setState({ multistreamOpen: false, view: "live" });
  }

  return {
    closeMultistream,
    handleStreamCardClick,
    handleStreamCardKeydown,
    loadStreams,
    openMultistream,
    openStreamNotification,
    openStreamViewer,
    setLiveNotificationScope,
    toggleStream,
  };
}
