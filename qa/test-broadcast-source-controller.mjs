import assert from "node:assert/strict";
import { createBroadcastSourceController } from "../frontend/src/features/broadcast/source-controller.js";

const makeStream = (id) => {
  const tracks = [{ id, stopped: false, stop() { this.stopped = true; } }];
  return { tracks, getTracks: () => tracks };
};
let state = {
  broadcastState: "live",
  broadcastMediaSwitching: false,
  broadcastCameraDeviceId: "old-camera",
  broadcastCameraEnabled: false,
  broadcastCameraPosition: "bottom-right",
  broadcastCameraStream: null,
  broadcastDisplayStream: makeStream("display"),
  broadcastMicrophoneEnabled: false,
  broadcastMicrophoneStream: null,
  broadcastSourceAudioTrack: null,
  broadcastSourceType: "screen",
  broadcastStream: makeStream("old-output"),
  broadcastVideoComposition: null,
  mediaMode: "p2p",
  selectedInputDeviceId: "mic-1",
  selectedQuality: "balanced",
};
const calls = [];
const nextOutput = makeStream("new-output");
const controller = createBroadcastSourceController({
  getState: () => state,
  setState: (next) => { state = { ...state, ...next }; calls.push(["state", next]); },
  buildOutputStream: async () => nextOutput,
  replaceTracks: async (stream) => calls.push(["replace", stream]),
  attachPreview: async () => calls.push(["preview"]),
  captureCamera: async () => makeStream("camera"),
  captureMicrophone: async () => makeStream("microphone"),
  stopMicrophone: (stream) => stream.getTracks().forEach((track) => track.stop()),
  isRelayActive: async () => false,
  qualityProfiles: { balanced: {} },
  setNotice: (notice) => calls.push(["notice", notice]),
  reportClientError: (...args) => calls.push(["error", ...args]),
});

assert.equal(await controller.rebuildOutput({}), true);
assert.equal(state.broadcastStream, nextOutput);
assert.ok(calls.some(([kind]) => kind === "replace"));
assert.ok(calls.some(([kind]) => kind === "preview"));

await controller.handleCameraToggle({ currentTarget: { checked: true } });
assert.equal(state.broadcastCameraEnabled, true);
assert.equal(state.broadcastCameraStream?.getTracks?.()[0]?.id, "camera");

console.log("broadcast source controller: ok");
