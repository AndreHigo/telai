import { WebSocketServer } from "ws";
import { installWebsocketHeartbeat } from "./heartbeat.mjs";

export function createWebsocketGateway({
  server,
  currentUser,
  clientIp,
  publicOriginForRequest,
  allowWebsocketConnection,
  websocketActiveCount,
  websocketActiveConnectionLimit,
  addWebsocketActive,
  removeWebsocketActive,
  observability,
  addResponseBytes,
  randomUUID,
  infoLog,
  warnLog,
  errorLog,
  send,
  handleBinaryMessage,
  allowWebsocketControlMessage,
  websocketTextMessageMaxBytes,
  handleMessage,
  leave,
  leaveVoiceRoom,
}) {
  function websocketOriginAllowed(request) {
    const origin = String(request.headers.origin || "").trim();
    // Clientes nativos e ferramentas de diagnóstico podem não enviar Origin.
    // CSWSH depende de um Origin de navegador, portanto só validamos quando ele
    // existe, sem quebrar esses clientes.
    if (!origin) return true;
    let normalizedOrigin;
    try { normalizedOrigin = new URL(origin).origin; } catch { return false; }
    const configured = String(process.env.MIRANTE_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
    const candidates = [publicOriginForRequest(request), process.env.PUBLIC_BASE_URL, process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "", ...configured];
    const allowed = new Set(candidates.map((value) => {
      try { return new URL(value).origin; } catch { return null; }
    }).filter(Boolean));
    return allowed.has(normalizedOrigin);
  }

  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024 * 1024,
    verifyClient: ({ req }, done) => {
      if (!websocketOriginAllowed(req)) {
        warnLog("ws_origin_rejected", { origin: String(req.headers.origin || "").slice(0, 200), host: String(req.headers.host || "").slice(0, 200) });
        return done(false, 403, "Origin não permitido");
      }
      const ip = clientIp(req);
      const connectionRate = allowWebsocketConnection(req);
      if (!connectionRate.allowed) {
        warnLog("ws_connection_rate_limited", { retryAfter: connectionRate.retryAfter });
        return done(false, 429, "Muitas conexões. Aguarde um instante.");
      }
      if (websocketActiveCount(ip) >= websocketActiveConnectionLimit) {
        warnLog("ws_active_connection_limit", { active: websocketActiveCount(ip), limit: websocketActiveConnectionLimit });
        return done(false, 429, "Limite de conexões atingido.");
      }
      return done(true);
    },
  });

  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).pathname;
    if (pathname !== "/signal") return;
    websocketServer.handleUpgrade(request, socket, head, (client) => websocketServer.emit("connection", client, request));
  });

  installWebsocketHeartbeat(websocketServer);
  websocketServer.on("connection", (socket, request) => {
    Promise.resolve().then(async () => {
    socket.clientId = randomUUID();
    socket.clientIpAddress = clientIp(request);
    addWebsocketActive(socket.clientIpAddress);
    socket.user = await currentUser(request);
    observability.websocket.active += 1;
    observability.websocket.connections += 1;
    const originalSocketSend = socket.send.bind(socket);
    socket.send = (...args) => {
      const payload = args[0];
      if (payload != null) {
        observability.websocket.messagesOut += 1;
        observability.websocket.bytesOut += addResponseBytes(null, payload);
      }
      return originalSocketSend(...args);
    };
    infoLog("ws_connected", { clientId: socket.clientId, authenticated: Boolean(socket.user) });
    socket.on("message", (raw, isBinary) => {
      observability.websocket.messagesIn += 1;
      observability.websocket.bytesIn += addResponseBytes(null, raw);
      if (isBinary) return Promise.resolve(handleBinaryMessage(socket, raw)).catch((error) => {
        errorLog("ws_binary_message_error", { clientId: socket.clientId, roomId: socket.roomId, error: error.message });
        send(socket, { type: "error", message: "Não foi possível processar a transmissão." });
      });
      if (!allowWebsocketControlMessage(socket)) {
        warnLog("ws_control_rate_limited", { clientId: socket.clientId, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId });
        // Não derrube uma live/sala inteira por uma rajada de ICE, renegociação
        // ou mensagens de um cliente abusivo. O excesso é descartado e a janela
        // volta a aceitar mensagens normalmente após 10 segundos.
        return send(socket, { type: "rate-limit", message: "Mensagens temporariamente limitadas. O excesso foi descartado." });
      }
      if (Buffer.byteLength(raw) > websocketTextMessageMaxBytes) {
        warnLog("ws_text_message_too_large", { clientId: socket.clientId, bytes: Buffer.byteLength(raw) });
        return socket.close(1009, "Mensagem de controle muito grande");
      }
      try {
        const message = JSON.parse(raw.toString());
        Promise.resolve(handleMessage(socket, message)).catch((error) => {
          errorLog("ws_message_error", { clientId: socket.clientId, type: message?.type, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId, error: error.message, stack: error.stack });
          send(socket, { type: "error", message: "Não foi possível processar a mensagem." });
        });
      } catch (error) {
        warnLog("ws_invalid_message", { clientId: socket.clientId, error: error.message });
        send(socket, { type: "error", message: "Mensagem inválida." });
      }
    });
    socket.on("error", (error) => {
      errorLog("ws_error", { clientId: socket.clientId, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId, error: error.message });
    });
    socket.on("close", (code, reason) => {
      observability.websocket.active = Math.max(0, observability.websocket.active - 1);
      removeWebsocketActive(socket.clientIpAddress);
      observability.websocket.closed += 1;
      infoLog("ws_closed", { clientId: socket.clientId, code, reason: reason?.toString().slice(0, 120), roomId: socket.roomId, voiceRoomId: socket.voiceRoomId });
      leave(socket);
      leaveVoiceRoom(socket);
    });
    }).catch((error) => {
      removeWebsocketActive(socket.clientIpAddress || clientIp(request));
      errorLog("ws_authentication_error", { clientId: socket.clientId, error: error.message });
      try { socket.close(1011, "authentication unavailable"); } catch {}
    });
  });

  return websocketServer;
}
