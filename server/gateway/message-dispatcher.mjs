export function createGatewayMessageDispatcher({
  debugLog,
  allowRtcSignal,
  warnLog,
  send,
  handleVoiceMessage,
  handleBroadcastMessage,
}) {
  return async function handleMessage(socket, message) {
    const messageType = String(message?.type || "unknown");
    if (!["signal", "voice-signal", "relay-chunk"].includes(messageType)) {
      debugLog("ws_message", { clientId: socket.clientId, type: messageType, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId });
    }
    if (messageType === "signal" || messageType === "voice-signal") {
      if (!allowRtcSignal(socket)) {
        warnLog("ws_signal_rate_limited", { clientId: socket.clientId, type: messageType, roomId: socket.roomId, voiceRoomId: socket.voiceRoomId });
        // Um bloqueio de sinalização não pode derrubar a sala de voz inteira.
        // O frontend trata este tipo como recuperável e renegocia apenas o par
        // afetado; o erro genérico era interpretado como saída da sala.
        return send(socket, {
          type: messageType === "voice-signal" ? "voice-signal-error" : "error",
          ...(messageType === "voice-signal" ? { target: String(message.target || "").slice(0, 64) } : {}),
          message: "Sinalização temporariamente limitada. Tentando recuperar o áudio.",
        });
      }
    }
    if (await handleVoiceMessage(socket, message)) return;

    if (await handleBroadcastMessage(socket, message)) return;
  };
}
