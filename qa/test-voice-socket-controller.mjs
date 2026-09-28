import assert from "node:assert/strict";
import { createVoiceSocketController } from "../frontend/src/features/voice/socket-controller.js";

const sockets = [];
class FakeWebSocket {
  static OPEN = 1;
  constructor(url) { this.url = url; this.readyState = 0; this.listeners = new Map(); sockets.push(this); }
  addEventListener(type, handler) { this.listeners.set(type, [...(this.listeners.get(type) || []), handler]); }
  emit(type, event = {}) { for (const handler of this.listeners.get(type) || []) handler(event); }
  send(payload) { this.sent = payload; }
  close() { this.readyState = 3; this.emit("close", { code: 1000 }); }
}

let socket = null;
const messages = [];
const closed = [];
const controller = createVoiceSocketController({
  getRoomId: () => "room-1",
  getSocket: () => socket,
  setSocket: (next) => { socket = next; },
  onMessage: (event, current) => messages.push([event.data, current]),
  onClosed: (event, current) => closed.push([event.code, current]),
  WebSocketImpl: FakeWebSocket,
  locationRef: { protocol: "http:", host: "localhost:8787" },
  setTimeoutFn: (handler) => { handler.__timer = true; return handler; },
  clearTimeoutFn: () => {},
});

const connection = controller.connect();
assert.equal(sockets[0].url, "ws://localhost:8787/signal");
socket.readyState = FakeWebSocket.OPEN;
socket.emit("open");
await connection;
assert.equal(controller.send({ type: "ping" }), true);
assert.equal(socket.sent, JSON.stringify({ type: "ping" }));
socket.emit("message", { data: "{\"type\":\"voice-joined\"}" });
assert.equal(messages[0][0], "{\"type\":\"voice-joined\"}");
controller.close();
assert.equal(socket, null);
assert.equal(closed.length, 0);

console.log("voice socket controller: ok");
