export function createSocketSender({ errorLog, errorEvent = "ws_send_error" } = {}) {
  return function send(socket, message) {
    if (socket?.readyState !== 1) return false;
    try {
      const sequence = (socket.gatewaySequence || 0) + 1;
      socket.gatewaySequence = sequence;
      const payload = message && typeof message === "object" && !Buffer.isBuffer(message)
        ? { ...message, sequence }
        : message;
      socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      errorLog(errorEvent, { clientId: socket.clientId, type: message?.type, error: error.message });
      return false;
    }
  };
}
