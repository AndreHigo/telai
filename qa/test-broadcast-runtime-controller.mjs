import assert from "node:assert/strict";
import { createBroadcastRuntimeController } from "../frontend/src/features/broadcast/runtime-controller.js";

globalThis.WebSocket = { OPEN: 1 };
const calls = [];
const state = {
  broadcastAudioWarning: "",
  broadcastCaptureRecoveryTimer: null,
  broadcastChatDraft: "  mensagem de teste  ",
  broadcastState: "live",
  broadcastSocket: { readyState: 1, send: (payload) => calls.push(["socket", JSON.parse(payload)]) },
  broadcastStream: null,
  broadcastDisplayStream: null,
  broadcastCameraStream: null,
  broadcastRoomId: "room-1",
  broadcastStreamId: "stream-1",
  broadcastSourceType: "screen",
  mediaMode: "p2p",
};
const updates = [];
const controller = createBroadcastRuntimeController({
  getState: () => state,
  hasLiveBroadcastCapture: () => false,
  reportClientError: (...args) => calls.push(["error", ...args]),
  setState: (next) => { Object.assign(state, next); updates.push(next); },
  stopBroadcast: (reason) => calls.push(["stop", reason]),
});

controller.sendBroadcast({ type: "ping" });
assert.deepEqual(calls[0], ["socket", { type: "ping" }]);
controller.sendBroadcastChatMessage();
assert.deepEqual(calls[1], ["socket", { type: "chat-message", body: "mensagem de teste" }]);
assert.equal(state.broadcastChatDraft, "");

const track = { readyState: "ended" };
state.broadcastStream = { getVideoTracks: () => [track] };
controller.handleBroadcastVideoTrackEnded(track);
assert.match(state.broadcastAudioWarning, /captura de vídeo foi encerrada/);
assert.ok(state.broadcastCaptureRecoveryTimer);
assert.equal(calls.filter(([kind]) => kind === "error").length, 1);
controller.clearBroadcastCaptureRecoveryTimer();
assert.equal(state.broadcastCaptureRecoveryTimer, null);

state.broadcastState = "starting";
controller.handleBroadcastVideoTrackEnded(track);
assert.deepEqual(calls.at(-1), ["stop", "capture-ended-before-start"]);

console.log(JSON.stringify({ ok: true, checks: 8 }));
