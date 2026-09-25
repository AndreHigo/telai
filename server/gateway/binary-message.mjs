export function createBinaryMessageHandler({
  rooms,
  mediaMode,
  relayChunkMaxBytes,
  relayRecentBytesMax,
  warnLog,
  sendRelayChunk,
}) {
  return function handleBinaryMessage(socket, raw) {
    const room = rooms.get(socket.roomId);
    if (mediaMode !== "relay" || !room?.relay.active || room.host !== socket) return;
    if (raw.byteLength > relayChunkMaxBytes) {
      warnLog("ws_relay_chunk_too_large", { clientId: socket.clientId, roomId: socket.roomId, bytes: raw.byteLength });
      socket.close(1009, "Fragmento relay muito grande");
      return;
    }
    const chunk = Buffer.from(raw);
    if (!room.relay.firstChunk) room.relay.firstChunk = chunk;
    room.relay.recentChunks.push(chunk);
    room.relay.recentBytes = (room.relay.recentBytes || 0) + chunk.length;
    while (room.relay.recentChunks.length > 8 || room.relay.recentBytes > relayRecentBytesMax) {
      const removed = room.relay.recentChunks.shift();
      room.relay.recentBytes = Math.max(0, room.relay.recentBytes - (removed?.length || 0));
    }
    for (const viewer of room.viewers.values()) sendRelayChunk(viewer, chunk, room);
  };
}
