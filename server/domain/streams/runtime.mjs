export function createStreamRuntime({
  rooms,
  groupPresence,
  streamRepository,
  runtimeStartedAt,
  streamOrphanGraceMs,
  hostReconnectGraceMs,
  isGroupMember,
  slugFor,
}) {
  function presenceKey(groupId, userId) {
    return `${groupId}:${userId}`;
  }

  function touchGroupPresence(groupId, userId) {
    groupPresence.set(presenceKey(groupId, userId), Date.now());
  }

  function isPresent(groupId, userId) {
    const lastSeen = groupPresence.get(presenceKey(groupId, userId)) || 0;
    return Date.now() - lastSeen <= 35_000;
  }

  function canAccessStream(userId, stream) {
    const createdBy = stream.created_by ?? stream.createdBy;
    const groupId = stream.group_id ?? stream.groupId;
    return stream.visibility === "public" || (userId && createdBy === userId) || (userId && groupId && isGroupMember(userId, groupId));
  }

  function streamForRoom(roomId) {
    return streamRepository.findForRoom(roomId);
  }

  function loadStreamChat(roomId) {
    return streamRepository.loadChatForRoom(roomId);
  }

  function endStreamByRoom(roomId) {
    streamRepository.endByRoom(roomId);
  }

  function runtimeStreamIsLive(stream) {
    const room = rooms.get(stream.roomName);
    if (room?.host) return true;
    if (room?.hostDisconnectedAt && Date.now() - room.hostDisconnectedAt <= hostReconnectGraceMs) return true;
    if (Date.now() - runtimeStartedAt <= streamOrphanGraceMs) return true;
    // A stream is inserted just before the host joins signaling. Give that
    // handshake a short grace period. After the process startup grace above,
    // never expose an abandoned database row indefinitely.
    const startedAt = Date.parse(stream.startedAt || "");
    if (Number.isFinite(startedAt) && Date.now() - startedAt <= 15_000) return true;
    endStreamByRoom(stream.roomName);
    return false;
  }

  function decorateRuntimeStream(stream) {
    const room = rooms.get(stream.roomName);
    return { ...stream, viewerCount: room?.viewers?.size || 0 };
  }

  function streamPublicPath(stream) {
    // O endereço amigável acompanha o nome de exibição. O username continua
    // aceito pelo resolvedor apenas para preservar links antigos.
    const channel = slugFor(stream.channelName || stream.displayName || stream.channelUsername || stream.username || "");
    const group = stream.visibility === "private" ? slugFor(stream.groupSlug || "") : "";
    if (!channel) return "";
    return group ? `/${group}/${channel}` : `/${channel}`;
  }

  return {
    canAccessStream,
    decorateRuntimeStream,
    endStreamByRoom,
    isPresent,
    loadStreamChat,
    runtimeStreamIsLive,
    streamForRoom,
    streamPublicPath,
    touchGroupPresence,
  };
}
