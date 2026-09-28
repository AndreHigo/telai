/** Owns the voice WebSocket transport while the room runtime owns messages. */
export function createVoiceSocketController({
  getRoomId,
  getSocket,
  setSocket,
  onMessage,
  onClosed,
  reportClientError,
  timeoutMs = 12_000,
  locationRef = globalThis.location,
  WebSocketImpl = globalThis.WebSocket,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  function send(message) {
    const socket = getSocket?.();
    const openState = WebSocketImpl?.OPEN ?? 1;
    if (socket?.readyState === openState) socket.send(JSON.stringify(message));
    return Boolean(socket?.readyState === openState);
  }

  function close() {
    const socket = getSocket?.();
    setSocket?.(null);
    try { socket?.close?.(); } catch {}
  }

  function connect() {
    return new Promise((resolve, reject) => {
      const protocol = locationRef?.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocketImpl(`${protocol}//${locationRef?.host}/signal`);
      setSocket?.(socket);
      let settled = false;
      const handshakeTimeout = setTimeoutFn(() => {
        if (settled) return;
        const error = new Error("A conexão da sala de voz demorou para responder.");
        reportClientError?.("voice_socket_connect_timeout", error, { roomId: getRoomId?.() });
        try { socket.close(); } catch {}
        settled = true;
        reject(error);
      }, timeoutMs);
      const resolveConnection = () => {
        if (settled) return;
        settled = true;
        clearTimeoutFn(handshakeTimeout);
        resolve(socket);
      };
      const rejectConnection = (error) => {
        if (settled) return;
        settled = true;
        clearTimeoutFn(handshakeTimeout);
        reject(error);
      };
      socket.addEventListener("open", resolveConnection, { once: true });
      socket.addEventListener("error", () => {
        const error = new Error("Não foi possível conectar à sala de voz.");
        reportClientError?.("voice_socket_connect_error", error, { roomId: getRoomId?.() });
        rejectConnection(error);
      }, { once: true });
      socket.addEventListener("message", (event) => {
        if (getSocket?.() !== socket || typeof event.data !== "string") return;
        onMessage?.(event, socket);
      });
      socket.addEventListener("error", () => {
        reportClientError?.("voice_socket_error", new Error("A conexão da sala de voz falhou."), { roomId: getRoomId?.() });
      });
      socket.addEventListener("close", (event) => {
        if (!settled) rejectConnection(new Error("A conexão da sala de voz foi encerrada antes de conectar."));
        if (getSocket?.() !== socket) return;
        onClosed?.(event, socket);
      });
    });
  }

  return { connect, send, close };
}
