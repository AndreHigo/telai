const RECONNECT_DELAY_MS = 1_500;
const PRESENCE_HEARTBEAT_MS = 15_000;

function eventGatewayUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/events`;
}

export function createGroupEventGateway({ onMessage, onError } = {}) {
  let socket = null;
  let desiredGroupId = "";
  let reconnectTimer = null;
  let presenceTimer = null;
  let stopped = false;
  let lastSequence = 0;

  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function sendPresence() {
    if (desiredGroupId) send({ type: "group-presence", groupId: desiredGroupId });
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  function connect() {
    if (stopped || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    lastSequence = 0;
    socket = new WebSocket(eventGatewayUrl());
    socket.addEventListener("open", () => {
      if (desiredGroupId) send({ type: "subscribe-group", groupId: desiredGroupId });
      sendPresence();
    }, { once: true });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data);
        const sequence = Number(message?.sequence);
        if (Number.isSafeInteger(sequence) && sequence > 0) {
          if (sequence <= lastSequence) return;
          lastSequence = sequence;
        }
        onMessage?.(message);
      } catch (error) {
        onError?.(error);
      }
    });
    socket.addEventListener("error", () => onError?.(new Error("A conexão de eventos do grupo falhou.")));
    socket.addEventListener("close", () => {
      socket = null;
      scheduleReconnect();
    }, { once: true });
  }

  function subscribeGroup(groupId) {
    const nextGroupId = String(groupId || "");
    if (desiredGroupId && desiredGroupId !== nextGroupId) send({ type: "unsubscribe-group", groupId: desiredGroupId });
    desiredGroupId = nextGroupId;
    if (!desiredGroupId) return unsubscribeGroup();
    connect();
    if (!send({ type: "subscribe-group", groupId: desiredGroupId })) return;
    sendPresence();
  }

  function unsubscribeGroup() {
    if (desiredGroupId) send({ type: "unsubscribe-group", groupId: desiredGroupId });
    desiredGroupId = "";
  }

  function close() {
    stopped = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (presenceTimer) window.clearInterval(presenceTimer);
    reconnectTimer = null;
    presenceTimer = null;
    socket?.close(1000, "client closed");
    socket = null;
  }

  presenceTimer = window.setInterval(sendPresence, PRESENCE_HEARTBEAT_MS);
  return { connect, subscribeGroup, unsubscribeGroup, close };
}
