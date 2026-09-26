import assert from "node:assert/strict";
import { createBroadcastRelayController } from "../frontend/src/features/broadcast/relay-controller.js";

const calls = [];
const listeners = new Map();
const stream = { getAudioTracks: () => [{ kind: "audio" }] };
const socket = {
  readyState: 1,
  bufferedAmount: 0,
  send: (payload) => calls.push(["send", payload]),
};
const recorder = {
  state: "inactive",
  addEventListener: (name, handler) => listeners.set(name, handler),
  start: (timeslice) => { recorder.state = "recording"; calls.push(["start", timeslice]); },
  stop: () => { recorder.state = "inactive"; listeners.get("stop")?.(); },
};

globalThis.MediaRecorder = class FakeMediaRecorder {
  static isTypeSupported(type) { return type === "video/webm;codecs=vp8,opus"; }
  constructor() { return recorder; }
};

let warning = "";
const controller = createBroadcastRelayController({
  getState: () => ({ broadcastStream: stream, broadcastSocket: socket, selectedQuality: "balanced" }),
  qualityProfiles: { balanced: { maxBitrate: 2_500_000 } },
  reportClientError: (...args) => calls.push(["error", ...args]),
  sendBroadcast: (message) => calls.push(["message", message]),
  setWarning: (value) => { warning = value; },
});

assert.equal(controller.relayMimeForStream(stream), "video/webm;codecs=vp8,opus");
await controller.start();
assert.equal(controller.isRecording(), true);
assert.deepEqual(calls.slice(0, 2), [["start", 200], ["message", { type: "relay-start", mimeType: "video/webm;codecs=vp8,opus" }]]);
await listeners.get("dataavailable")?.({ data: { size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer } });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls.some(([kind]) => kind === "send"), true);
await controller.stop();
assert.equal(controller.isRecording(), false);
assert.equal(warning, "");
console.log(JSON.stringify({ ok: true, checks: 6 }));
