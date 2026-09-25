import { normalizeBroadcastQuality } from "../../shared/media-contract.mjs";

export function createBroadcastMessageHandler({
  send,
  rooms,
  mediaMode,
  authorizeRoomJoin,
  leave,
  roomFor,
  clearHostReconnectTimer,
  notifyViewerCount,
  notifyRelayStarted,
  resyncRelayViewer,
  notifyViewers,
  normalizeRtcSignalPayload,
  streamForRoom,
  streamRepository,
  randomUUID,
  closeBroadcastRoom,
  infoLog,
}) {
  return async function handleBroadcastMessage(socket, message) {
    if (message.type === "join") {
      const roomId = String(message.roomId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
      const role = message.role === "host" ? "host" : "viewer";
      if (roomId.length < 6) {
        send(socket, { type: "error", message: "Sala inválida." });
        return true;
      }

      const authorization = await authorizeRoomJoin(roomId, socket, role);
      if (!authorization.ok) {
        send(socket, { type: "error", message: authorization.message });
        return true;
      }

      leave(socket);
      const room = await roomFor(roomId);
      if (room.closed) {
        send(socket, { type: "error", message: "Esta sala foi encerrada." });
        return true;
      }

      socket.roomId = roomId;
      socket.role = role;
      socket.chatTimestamps = [];

      if (role === "host") {
        if (room.host) {
          send(socket, { type: "error", message: "Esta sala já possui um transmissor." });
          return true;
        }
        clearHostReconnectTimer(room);
        room.hostDisconnectedAt = null;
        room.closed = false;
        room.host = socket;
        send(socket, { type: "joined", role, clientId: socket.clientId, viewerCount: room.viewers.size });
        notifyViewerCount(room);
        send(socket, { type: "chat-history", messages: room.chat });
        for (const viewer of room.viewers.values()) {
          send(viewer, { type: "host-ready", hostId: socket.clientId });
          if (mediaMode === "relay") notifyRelayStarted(room, viewer);
          send(socket, { type: "viewer-joined", viewerId: viewer.clientId });
        }
        infoLog("broadcast_host_join", { clientId: socket.clientId, roomId, viewers: room.viewers.size });
        return true;
      }

      room.viewers.set(socket.clientId, socket);
      send(socket, { type: "joined", role, clientId: socket.clientId, hostId: room.host?.clientId || null, viewerCount: room.viewers.size });
      send(socket, { type: "chat-history", messages: room.chat });
      send(room.host, { type: "viewer-joined", viewerId: socket.clientId });
      notifyViewerCount(room);
      if (room.host) send(socket, { type: "host-ready", hostId: room.host.clientId });
      else send(socket, { type: "waiting", message: "Aguardando o transmissor abrir a sala." });
      if (mediaMode === "relay") notifyRelayStarted(room, socket);
      infoLog("broadcast_viewer_join", { clientId: socket.clientId, roomId, hostPresent: Boolean(room.host), viewers: room.viewers.size });
      return true;
    }

    if (message.type === "relay-start") {
      const room = rooms.get(socket.roomId);
      if (mediaMode !== "relay" || room?.host !== socket) return true;
      const mimeType = String(message.mimeType || "");
      if (!/^video\/webm(?:;codecs=vp8(?:,opus)?)?$/i.test(mimeType)) {
        send(socket, { type: "error", message: "Formato relay não suportado pelo servidor." });
        return true;
      }
      room.relay = { active: true, mimeType, firstChunk: null, recentChunks: [] };
      notifyViewers(room, { type: "relay-start", mimeType });
      infoLog("relay_started", { clientId: socket.clientId, roomId: socket.roomId, viewers: room.viewers.size });
      return true;
    }

    if (message.type === "relay-resync") {
      const room = rooms.get(socket.roomId);
      if (mediaMode === "relay" && room?.viewers.get(socket.clientId) === socket) resyncRelayViewer(socket, room);
      return true;
    }

    if (message.type === "signal") {
      const room = rooms.get(socket.roomId);
      if (!room || !message.target) return true;
      const target = room.host?.clientId === message.target
        ? room.host
        : room.viewers.get(message.target);
      const payload = normalizeRtcSignalPayload(message.payload);
      if (!payload) {
        send(socket, { type: "error", message: "Sinalização de transmissão inválida." });
        return true;
      }
      send(target, { type: "signal", from: socket.clientId, payload });
      return true;
    }

    if (message.type === "quality-lock") {
      const room = rooms.get(socket.roomId);
      const quality = normalizeBroadcastQuality(message.quality);
      const target = room?.viewers.get(String(message.target || ""));
      if (room?.host !== socket || !target) return true;
      send(target, { type: "quality-lock", quality });
      return true;
    }

    if (message.type === "quality") {
      // A qualidade da live é definida pelo transmissor. Preferências do
      // espectador não podem elevar o perfil acima do limite do host.
      return true;
    }

    if (message.type === "chat-message") {
      const room = rooms.get(socket.roomId);
      if (!room || (room.host !== socket && room.viewers.get(socket.clientId) !== socket)) return true;
      const stream = await streamForRoom(socket.roomId);
      if (room.closed || !stream || stream.endedAt) {
        send(socket, { type: "chat-error", message: "Esta transmissão já foi encerrada." });
        return true;
      }
      const body = String(message.body || "").trim().slice(0, 500);
      if (!body) return true;
      const now = Date.now();
      socket.chatTimestamps = (socket.chatTimestamps || []).filter((timestamp) => now - timestamp < 10_000);
      if (socket.chatTimestamps.length >= 8) {
        send(socket, { type: "chat-error", message: "Aguarde alguns segundos antes de enviar mais mensagens." });
        return true;
      }
      socket.chatTimestamps.push(now);
      const chatMessage = {
        id: randomUUID(),
        userId: socket.user?.id || null,
        body,
        displayName: socket.user?.displayName || "Visitante",
        username: socket.user?.username || "visitante",
        createdAt: new Date(now).toISOString(),
      };
      await streamRepository.insertChatMessage({
        id: chatMessage.id,
        channelUserId: stream.createdBy,
        streamId: stream.id,
        userId: socket.user?.id || null,
        body: chatMessage.body,
        displayName: chatMessage.displayName,
        username: chatMessage.username,
        createdAt: chatMessage.createdAt,
      });
      room.chat.push(chatMessage);
      if (room.chat.length > 120) room.chat.splice(0, room.chat.length - 120);
      send(room.host, { type: "chat-message", message: chatMessage });
      for (const viewer of room.viewers.values()) send(viewer, { type: "chat-message", message: chatMessage });
      return true;
    }

    if (message.type === "clear-chat") {
      const room = rooms.get(socket.roomId);
      const stream = await streamForRoom(socket.roomId);
      if (!room || room.host !== socket || !stream || stream.createdBy !== socket.user?.id) {
        send(socket, { type: "chat-error", message: "Somente o dono do canal pode limpar o histórico." });
        return true;
      }
      await streamRepository.clearChat(stream.id);
      room.chat = [];
      send(room.host, { type: "chat-cleared" });
      for (const viewer of room.viewers.values()) send(viewer, { type: "chat-cleared" });
      return true;
    }

    if (message.type === "stop") {
      const room = rooms.get(socket.roomId);
      if (room?.host === socket) {
        const requestedReason = String(message.reason || "user");
        const reason = ["user", "logout", "capture-timeout", "capture-ended-before-start"].includes(requestedReason)
          ? requestedReason
          : "user";
        await closeBroadcastRoom(socket.roomId);
        infoLog("broadcast_stopped", { clientId: socket.clientId, roomId: socket.roomId, viewers: room.viewers.size, reason });
      }
      return true;
    }

    if (message.type === "leave") {
      leave(socket);
      return true;
    }

    return false;
  };
}
