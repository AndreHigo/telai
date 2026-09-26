import assert from "node:assert/strict";
import { createBroadcastLifecycleController } from "../frontend/src/features/broadcast/lifecycle-controller.js";

const calls = [];
const makeTrack = (name) => ({ name, stopped: false, stop() { this.stopped = true; calls.push(["track-stop", name]); } });
const stream = { tracks: [makeTrack("output")], getTracks() { return this.tracks; } };
const displayStream = { tracks: [makeTrack("display")], getTracks() { return this.tracks; } };
const cameraStream = { tracks: [makeTrack("camera")], getTracks() { return this.tracks; } };
const microphoneStream = { tracks: [makeTrack("microphone")], getTracks() { return this.tracks; } };
const peer = {
  getSenders: () => [{ replaceTrack: async (track) => calls.push(["replace-track", track]) }],
  close: () => calls.push(["peer-close"]),
};
const state = {
  broadcastCameraEnabled: true,
  broadcastCaptureRecoveryTimer: null,
  broadcastChatDraft: "draft",
  broadcastChatMessageIds: new Set(["message"]),
  broadcastChatMessages: [{ id: "message" }],
  broadcastCameraStream: cameraStream,
  broadcastDisplayStream: displayStream,
  broadcastInvite: "http://localhost/live",
  broadcastMicrophoneStream: microphoneStream,
  broadcastPeerNegotiations: new Map([["viewer", Promise.resolve()]]),
  broadcastPeerRetryTimers: new Map([["viewer", 0]]),
  broadcastRoomId: "room-1",
  broadcastSelectedSourceName: "Tela 1",
  broadcastSelectionKind: "screen",
  broadcastSourceType: "screen",
  broadcastSourceSwitching: true,
  broadcastState: "live",
  broadcastStream: stream,
  broadcastStreamId: "stream-1",
  broadcastVideo: { srcObject: stream },
  broadcastSocket: { close: () => calls.push(["socket-close"]) },
  mediaMode: "p2p",
  pendingBroadcastCandidates: new Map([["viewer", []]]),
  peerConnections: new Map([["viewer", peer]]),
  selectedGroupId: "group-1",
};
const updates = [];
const controller = createBroadcastLifecycleController({
  api: async (path, options) => { calls.push(["api", path, options]); return {}; },
  clearBroadcastCaptureRecoveryTimer: () => calls.push(["clear-recovery"]),
  getState: () => state,
  loadStreams: async () => calls.push(["load-streams"]),
  refreshGroupOverview: async () => calls.push(["refresh-group"]),
  reportClientError: (...args) => calls.push(["error", ...args]),
  sendBroadcast: (message) => calls.push(["broadcast", message]),
  setNotice: (value) => calls.push(["notice", value]),
  setState: (next) => { Object.assign(state, next); updates.push(next); },
  stopBroadcastAudioMix: async () => calls.push(["stop-audio-mix"]),
  stopBroadcastVideoComposition: () => calls.push(["stop-composition"]),
  stopRelayRecorder: async () => calls.push(["stop-relay"]),
  stopVoiceInputStream: (value) => { calls.push(["stop-microphone", value]); value?.getTracks?.().forEach((track) => track.stop()); },
  stopWindowAudioBridge: async () => calls.push(["stop-window-audio"]),
});

await controller.stop("user");
assert.equal(state.broadcastState, "idle");
assert.equal(state.broadcastStreamId, "");
assert.equal(state.broadcastRoomId, "");
assert.equal(state.broadcastChatMessages.length, 0);
assert.equal(state.broadcastVideo.srcObject, null);
assert.equal(state.peerConnections.size, 0);
assert.equal(state.pendingBroadcastCandidates.size, 0);
assert.equal(state.broadcastPeerNegotiations.size, 0);
assert.equal(state.broadcastPeerRetryTimers.size, 0);
assert.equal(calls.some(([kind, path]) => kind === "api" && path === "/api/streams/stream-1/end"), true);
assert.equal(calls.some(([kind]) => kind === "load-streams"), true);
assert.equal(calls.some(([kind]) => kind === "refresh-group"), true);
assert.equal(stream.tracks[0].stopped, true);
assert.equal(displayStream.tracks[0].stopped, true);
assert.equal(cameraStream.tracks[0].stopped, true);
assert.equal(microphoneStream.tracks[0].stopped, true);

console.log(JSON.stringify({ ok: true, checks: 16 }));
