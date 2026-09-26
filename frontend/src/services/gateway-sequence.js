/**
 * Keeps a monotonic sequence per WebSocket so reconnects or duplicated
 * gateway events cannot be applied twice by a feature.
 */
export function createGatewaySequenceGuard() {
  const sequenceBySocket = new WeakMap();

  return function acceptGatewayMessage(socket, message) {
    const sequence = Number(message?.sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1) return true;
    const previous = sequenceBySocket.get(socket) || 0;
    if (sequence <= previous) return false;
    sequenceBySocket.set(socket, sequence);
    return true;
  };
}
