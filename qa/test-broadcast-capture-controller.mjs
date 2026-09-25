import assert from "node:assert/strict";
import { createBroadcastCaptureController } from "../frontend/src/features/broadcast/capture-controller.js";

const profile = { width: 1280, height: 720, maxFramerate: 30 };
const economy = { width: 854, height: 480, maxFramerate: 24 };
const calls = [];
const state = {
  audioMode: "system",
  broadcastCameraDeviceId: "camera-1",
  broadcastMicrophoneStream: null,
  broadcastSelectionKind: "screen",
  selectedInputDeviceId: "mic-1",
};
const stateUpdates = [];

function track(kind, settings = {}) {
  return {
    kind,
    ...settings,
    getSettings: () => ({ width: 1280, height: 720, frameRate: 30, ...settings }),
    applyConstraints: async (constraints) => {
      calls.push(["apply-constraints", kind, constraints]);
    },
    stop: () => calls.push(["stop-track", kind]),
  };
}

function stream(video = null, audio = null) {
  const tracks = [video, audio].filter(Boolean);
  return {
    getVideoTracks: () => (video ? [video] : []),
    getAudioTracks: () => (audio ? [audio] : []),
    getTracks: () => tracks,
  };
}

let displayFallback = false;
const desktop = {
  isDesktop: true,
  getDisplayMediaSources: async () => [{ id: "window-1", kind: "window" }],
};

const controller = createBroadcastCaptureController({
  getDisplayMedia: async (constraints) => {
    calls.push(["display", constraints]);
    if (displayFallback) throw Object.assign(new Error("legacy"), { name: "NotSupportedError" });
    return stream(track("video", { displaySurface: "monitor" }), null);
  },
  getQualityProfiles: () => ({ balanced: profile, economy }),
  getSelectedVoiceAudioConstraints: () => ({ deviceId: { exact: "mic-1" }, echoCancellation: true }),
  getState: () => state,
  getUserMedia: async (constraints) => {
    calls.push(["user", constraints]);
    if (constraints.audio) return stream(null, track("audio"));
    return stream(track("video"), null);
  },
  getDesktopBridge: () => desktop,
  loadAudioDevices: async (force) => calls.push(["devices", force]),
  processVoiceInputStream: async (rawStream) => ({ ...rawStream, processed: true }),
  rememberCapturedInputDevice: (capturedTrack, requestedDeviceId) => calls.push(["remember", capturedTrack.kind, requestedDeviceId]),
  reportClientError: (...args) => calls.push(["report", ...args]),
  setState: (next) => {
    stateUpdates.push(next);
    Object.assign(state, next);
    if (next.displaySourceSelection) next.displaySourceSelection.resolve({ id: "window-1" });
  },
  stopVoiceInputStream: (rawStream) => calls.push(["stop-voice", rawStream]),
});

const displayStream = await controller.captureDisplayStream(profile);
assert.equal(displayStream.getVideoTracks()[0].kind, "video");
assert.equal(calls[0][0], "display");
assert.equal(calls.some(([name]) => name === "apply-constraints"), true);
assert.equal(calls[0][1].audio, false);

const cameraStream = await controller.captureBroadcastCameraStream(profile);
const cameraCall = calls.find(([name, constraints]) => name === "user" && constraints.video);
assert.deepEqual(cameraCall[1].video.deviceId, { exact: "camera-1" });
assert.equal(cameraStream.getVideoTracks()[0].kind, "video");

const microphoneStream = await controller.captureBroadcastMicrophoneStream();
assert.equal(microphoneStream.processed, true);
assert.equal(state.broadcastMicrophoneStream, microphoneStream);
assert.ok(calls.some(([name, kind, deviceId]) => name === "remember" && kind === "audio" && deviceId === "mic-1"));

displayFallback = true;
const fallbackStream = await controller.captureDisplayStream(profile);
assert.equal(fallbackStream.getVideoTracks()[0].kind, "video");
const fallbackCall = calls.findLast(([name, constraints]) => name === "user" && constraints.video?.mandatory);
assert.equal(fallbackCall[1].video.mandatory.chromeMediaSourceId, "window-1");
assert.equal(stateUpdates.at(-1).displaySources?.length, 0);

await controller.refreshBroadcastDevices();
assert.ok(calls.some(([name, value]) => name === "devices" && value === true));

console.log(JSON.stringify({ ok: true, checks: 14 }));
