export function createBroadcastRuntime({
  rooms,
  send,
  loadStreamChat,
  endStreamByRoom,
  hostReconnectGraceMs,
  infoLog,
  debugLog,
}) {
  function clearHostReconnectTimer(room) {
    if (room?.hostReconnectTimer) clearTimeout(room.hostReconnectTimer);
    if (room) room.hostReconnectTimer = null;
  }

  function endRelay(room) {
    room.relay.active = false;
    room.relay.mimeType = "";
    room.relay.firstChunk = null;
    room.relay.recentChunks = [];
    room.relay.recentBytes = 0;
  }

  function notifyViewers(room, message) {
    for (const viewer of room.viewers.values()) send(viewer, message);
  }

  function notifyViewerCount(room) {
    const message = { type: "viewer-count", count: room.viewers.size };
    send(room.host, message);
    notifyViewers(room, message);
  }

  async function roomFor(roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, {
      host: null,
      hostDisconnectedAt: null,
      hostReconnectTimer: null,
      viewers: new Map(),
      chat: await loadStreamChat(roomId),
      closed: false,
      relay: { active: false, mimeType: "", firstChunk: null, recentChunks: [], recentBytes: 0 },
    });
    return rooms.get(roomId);
  }

  async function closeBroadcastRoom(roomId, event = "host-stopped") {
    const room = rooms.get(roomId);
    if (!room || room.closed) return false;
    room.closed = true;
    room.hostDisconnectedAt = null;
    clearHostReconnectTimer(room);
    endRelay(room);
    await endStreamByRoom(roomId);
    notifyViewers(room, { type: event });
    return true;
  }

  async function expireDisconnectedHost(roomId, room) {
    if (rooms.get(roomId) !== room || room.host || !room.hostDisconnectedAt) return;
    room.hostDisconnectedAt = null;
    room.closed = true;
    clearHostReconnectTimer(room);
    endRelay(room);
    await endStreamByRoom(roomId);
    notifyViewers(room, { type: "host-left" });
    infoLog("broadcast_host_expired", { roomId, viewers: room.viewers.size });
    if (room.viewers.size === 0) rooms.delete(roomId);
  }

  function scheduleHostReconnect(roomId, room) {
    clearHostReconnectTimer(room);
    room.hostReconnectTimer = setTimeout(() => {
      expireDisconnectedHost(roomId, room).catch((error) => debugLog("broadcast_host_expire_error", { roomId, error: error.message }));
    }, hostReconnectGraceMs);
  }

  function sendRelayChunk(socket, chunk, room) {
    if (socket?.readyState !== 1) return;
    // Não deixe um espectador lento transformar o relay em uma fila infinita.
    // Quando a fila voltar ao normal, reenvie o cabeçalho WebM e faça o player
    // reconstruir o buffer a partir do vídeo atual, em vez de ficar congelado.
    if (socket.bufferedAmount > 768 * 1024) {
      socket.relayNeedsResync = true;
      return;
    }
    if (socket.relayNeedsResync) {
      socket.relayNeedsResync = false;
      try {
        send(socket, { type: "relay-resync", mimeType: room.relay.mimeType });
        if (room.relay.firstChunk) {
          socket.send(room.relay.firstChunk, { binary: true });
          for (const recentChunk of room.relay.recentChunks || []) {
            if (recentChunk !== room.relay.firstChunk) socket.send(recentChunk, { binary: true });
          }
        }
      } catch {
        socket.relayNeedsResync = true;
        return;
      }
    }
    try { socket.send(chunk, { binary: true }); } catch { socket.relayNeedsResync = true; }
  }

  function resyncRelayViewer(socket, room) {
    if (socket?.readyState !== 1 || !room?.relay.active || !room.relay.firstChunk) return;
    const now = Date.now();
    if (now - (socket.lastRelayResyncAt || 0) < 1000) return;
    socket.lastRelayResyncAt = now;
    if (socket.bufferedAmount > 768 * 1024) {
      socket.relayNeedsResync = true;
      return;
    }
    socket.relayNeedsResync = false;
    try {
      send(socket, { type: "relay-resync", mimeType: room.relay.mimeType });
      socket.send(room.relay.firstChunk, { binary: true });
      for (const recentChunk of room.relay.recentChunks || []) {
        if (recentChunk !== room.relay.firstChunk) socket.send(recentChunk, { binary: true });
      }
    } catch { socket.relayNeedsResync = true; }
  }

  function notifyRelayStarted(room, target) {
    if (!room.relay.active) return;
    send(target, { type: "relay-start", mimeType: room.relay.mimeType });
    if (room.relay.firstChunk) sendRelayChunk(target, room.relay.firstChunk, room);
    // Um MediaRecorder pode gerar o primeiro fragmento apenas com o cabeçalho
    // WebM. Reenvie uma pequena janela recente para que um espectador que entra
    // depois receba também um keyframe e não fique com a tela preta.
    for (const recentChunk of room.relay.recentChunks || []) {
      if (recentChunk !== room.relay.firstChunk) sendRelayChunk(target, recentChunk, room);
    }
  }

  function leave(socket) {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (room.host === socket) {
      room.host = null;
      endRelay(room);
      if (room.closed) {
        clearHostReconnectTimer(room);
        room.hostDisconnectedAt = null;
      } else {
        room.hostDisconnectedAt = Date.now();
        notifyViewers(room, { type: "host-paused", retryInMs: hostReconnectGraceMs, message: "O transmissor está reconectando…" });
        scheduleHostReconnect(socket.roomId, room);
      }
      debugLog("broadcast_host_leave", { clientId: socket.clientId, roomId: socket.roomId, closed: room.closed, viewers: room.viewers.size });
    } else if (room.viewers.delete(socket.clientId)) {
      send(room.host, { type: "viewer-left", viewerId: socket.clientId });
      notifyViewerCount(room);
      debugLog("broadcast_viewer_leave", { clientId: socket.clientId, roomId: socket.roomId, viewers: room.viewers.size });
    }

    if (!room.host && room.viewers.size === 0 && !room.hostDisconnectedAt) {
      clearHostReconnectTimer(room);
      rooms.delete(socket.roomId);
    }
    socket.roomId = null;
  }

  return {
    clearHostReconnectTimer,
    closeBroadcastRoom,
    endRelay,
    leave,
    notifyRelayStarted,
    notifyViewerCount,
    notifyViewers,
    resyncRelayViewer,
    roomFor,
    sendRelayChunk,
  };
}
