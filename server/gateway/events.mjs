import { WebSocketServer } from "ws";

function originAllowed(request, publicOriginForRequest) {
  const origin = String(request.headers.origin || "").trim();
  if (!origin) return true;
  let normalizedOrigin;
  try { normalizedOrigin = new URL(origin).origin; } catch { return false; }
  const configured = String(process.env.MIRANTE_ALLOWED_ORIGINS || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const candidates = [
    publicOriginForRequest(request),
    process.env.PUBLIC_BASE_URL,
    process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "",
    ...configured,
  ];
  const allowed = new Set(candidates.map((value) => {
    try { return new URL(value).origin; } catch { return null; }
  }).filter(Boolean));
  return allowed.has(normalizedOrigin);
}

export function createEventGateway({
  server,
  currentUser,
  clientIp,
  publicOriginForRequest,
  allowWebsocketConnection,
  websocketActiveCount,
  websocketActiveConnectionLimit,
  addWebsocketActive,
  removeWebsocketActive,
  websocketTextMessageMaxBytes,
  allowWebsocketControlMessage,
  isGroupMember,
  groupMemberRepository,
  isPresent,
  touchGroupPresence,
  canGroupRoomAction = () => true,
  randomUUID,
  infoLog,
  warnLog,
  errorLog,
}) {
  const clients = new Set();
  const eventServer = new WebSocketServer({
    noServer: true,
    maxPayload: websocketTextMessageMaxBytes,
    verifyClient: ({ req }, done) => {
      if (!originAllowed(req, publicOriginForRequest)) {
        warnLog("events_origin_rejected", { origin: String(req.headers.origin || "").slice(0, 200) });
        return done(false, 403, "Origin não permitido");
      }
      const connectionRate = allowWebsocketConnection(req);
      if (!connectionRate.allowed) {
        warnLog("events_connection_rate_limited", { retryAfter: connectionRate.retryAfter });
        return done(false, 429, "Muitas conexões. Aguarde um instante.");
      }
      if (websocketActiveCount(clientIp(req)) >= websocketActiveConnectionLimit) {
        warnLog("events_active_connection_limit", { active: websocketActiveCount(clientIp(req)), limit: websocketActiveConnectionLimit });
        return done(false, 429, "Limite de conexões atingido.");
      }
      return done(true);
    },
  });

  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
    if (pathname !== "/events") return;
    eventServer.handleUpgrade(request, socket, head, (client) => eventServer.emit("connection", client, request));
  });

  function send(socket, message) {
    if (socket?.readyState !== 1) return false;
    try {
      const sequence = (socket.gatewaySequence || 0) + 1;
      socket.gatewaySequence = sequence;
      socket.send(JSON.stringify({ ...message, sequence }));
      return true;
    } catch (error) {
      errorLog("events_send_error", { clientId: socket.clientId, type: message?.type, error: error.message });
      return false;
    }
  }

  function membersFor(groupId) {
    return groupMemberRepository.listMemberIds(groupId).map((id) => ({ id, online: isPresent(groupId, id) }));
  }

  function publishGroupEvent(groupId, message) {
    const normalizedGroupId = String(groupId || "");
    if (!normalizedGroupId || !message || typeof message !== "object") return 0;
    let delivered = 0;
    for (const socket of clients) {
      if (!socket.eventGroups?.has(normalizedGroupId)) continue;
      const roomId = message.roomId || message.message?.roomId || null;
      if (roomId && !canGroupRoomAction(socket.user?.id, normalizedGroupId, roomId, "canView")) continue;
      if (send(socket, { ...message, groupId: normalizedGroupId })) delivered += 1;
    }
    return delivered;
  }

  function publishGroupPresence(groupId) {
    return publishGroupEvent(groupId, { type: "group-presence", members: membersFor(groupId) });
  }

  function subscribe(socket, groupId) {
    const normalizedGroupId = String(groupId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (normalizedGroupId.length < 12 || !socket.user || !isGroupMember(socket.user.id, normalizedGroupId)) {
      send(socket, { type: "events-error", code: "forbidden", message: "Você não participa deste grupo." });
      return false;
    }
    socket.eventGroups.add(normalizedGroupId);
    touchGroupPresence(normalizedGroupId, socket.user.id);
    send(socket, { type: "group-subscribed", groupId: normalizedGroupId, members: membersFor(normalizedGroupId) });
    publishGroupPresence(normalizedGroupId);
    return true;
  }

  eventServer.on("connection", (socket, request) => {
    socket.clientId = randomUUID();
    socket.clientIpAddress = clientIp(request);
    socket.user = currentUser(request);
    socket.eventGroups = new Set();
    addWebsocketActive(socket.clientIpAddress);
    clients.add(socket);
    infoLog("events_connected", { clientId: socket.clientId, authenticated: Boolean(socket.user) });
    socket.on("error", (error) => errorLog("events_error", { clientId: socket.clientId, error: error.message }));
    socket.on("close", () => {
      clients.delete(socket);
      removeWebsocketActive(socket.clientIpAddress);
      infoLog("events_closed", { clientId: socket.clientId });
    });
    if (!socket.user) {
      send(socket, { type: "events-error", code: "unauthorized", message: "Entre com sua conta para receber eventos." });
      return socket.close(4401, "authentication required");
    }

    socket.on("message", (raw, isBinary) => {
      if (isBinary || !allowWebsocketControlMessage(socket)) return;
      if (Buffer.byteLength(raw) > websocketTextMessageMaxBytes) return socket.close(1009, "Mensagem muito grande");
      try {
        const message = JSON.parse(raw.toString());
        const groupId = String(message.groupId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
        if (message.type === "subscribe-group") return subscribe(socket, groupId);
        if (!["group-presence", "unsubscribe-group"].includes(message.type) || !socket.eventGroups.has(groupId)) return;
        if (message.type === "group-presence") {
          touchGroupPresence(groupId, socket.user.id);
          publishGroupPresence(groupId);
        } else {
          socket.eventGroups.delete(groupId);
          send(socket, { type: "group-unsubscribed", groupId });
        }
      } catch (error) {
        warnLog("events_invalid_message", { clientId: socket.clientId, error: error.message });
        send(socket, { type: "events-error", code: "invalid_message", message: "Mensagem inválida." });
      }
    });
  });

  return { server: eventServer, clients, publishGroupEvent, publishGroupPresence };
}
