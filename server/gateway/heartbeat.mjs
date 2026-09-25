const OPEN = 1;

export function installWebsocketHeartbeat(websocketServer, { intervalMs = 30_000 } = {}) {
  const onConnection = (socket) => {
    socket.isAlive = true;
    socket.on("pong", () => { socket.isAlive = true; });
  };
  const heartbeatTimer = setInterval(() => {
    for (const socket of websocketServer.clients) {
      if (socket.readyState !== OPEN) continue;
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      try { socket.ping(); } catch { socket.terminate(); }
    }
  }, intervalMs);
  heartbeatTimer.unref?.();

  websocketServer.on("connection", onConnection);
  const stop = () => {
    clearInterval(heartbeatTimer);
    websocketServer.off("connection", onConnection);
    websocketServer.off("close", stop);
  };
  websocketServer.once("close", stop);
  return stop;
}
