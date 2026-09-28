import assert from "node:assert/strict";
import { createVoiceInputRuntime } from "../frontend/src/features/voice/input-runtime.js";

const storage = new Map();
const updates = [];
const pipelineCalls = [];
const devices = [{ deviceId: "mic-1", label: "Microfone QA" }];
const stream = {
  label: "Microfone QA",
  getSettings: () => ({ deviceId: "mic-1" }),
  getAudioTracks: () => [{ enabled: true, getSettings: () => ({ deviceId: "mic-1" }) }],
  getTracks: () => [{ stop() {} }],
};
let state = {
  voiceInputProfile: "isolation",
  voiceAdvancedOptions: { noiseSuppression: true },
  selectedInputDeviceId: "mic-1",
  selectedInputDeviceLabel: "",
  allAudioInputDevices: devices,
  voiceInputDeviceByStream: new WeakMap(),
  voiceInputSelectionRevision: 2,
  voiceMicrophoneVolume: 1,
  voiceLocalStream: null,
  voiceMuted: false,
  voiceServerMuted: false,
  voiceClientId: "user-1",
  voiceState: "idle",
  broadcastMicrophoneStream: null,
};

const runtime = createVoiceInputRuntime({
  getState: () => state,
  setState: (next) => { updates.push(next); state = { ...state, ...next }; },
  voiceInputPipeline: {
    getResource: () => null,
    process: async (value) => value,
    stop: (value) => pipelineCalls.push(["stop", value]),
    updateGain: (value, volume) => pipelineCalls.push(["gain", value, volume]) || true,
  },
  voiceCaptureService: { capture: async () => ({ stream, device: { actualDeviceId: "mic-1" } }) },
  voiceTrackSyncService: { negotiate: async () => {}, sync: async () => {} },
  voiceInputLifecycleController: {
    bindLocalTrack: () => {},
    recover: () => {},
    reapplySettings: () => {},
    isRecoveryInFlight: () => false,
  },
  voiceAudioTestController: { getState: () => ({ stream: null }) },
  createVoiceAudioConstraints: (profile, options) => ({ profile, options }),
  createSelectedVoiceAudioConstraints: (profile, options, deviceId) => ({ profile, options, deviceId }),
  normalizeAudioVolume: (value) => value,
  rawAudioDeviceLabel: (device) => device?.label || "",
  reportClientError: (...args) => updates.push({ error: args }),
  scheduleAudioVolumePersistence: () => updates.push({ persisted: true }),
  clearVoiceActivityAnalyzer: () => {},
  attachVoiceActivityStream: async () => {},
  ensureVoiceActivityTimer: () => {},
  localStorageRef: { setItem: (key, value) => storage.set(key, value) },
  navigatorRef: { mediaDevices: { getUserMedia: () => {} } },
});

assert.deepEqual(runtime.voiceAudioConstraints(), { profile: "isolation", options: { noiseSuppression: true } });
assert.equal(runtime.voiceInputStreamMatchesSelectedDevice(stream), true);
assert.equal(runtime.shouldProcessVoiceInput(), true);
assert.deepEqual(runtime.rememberCapturedInputDevice(stream), { actualDeviceId: "mic-1", actualLabel: "Microfone QA" });
assert.equal(state.selectedInputDeviceLabel, "Microfone QA");
assert.equal(storage.get("mirante-voice-input-label"), "Microfone QA");
assert.equal(await runtime.captureVoiceInputStream(), stream);
runtime.stopVoiceInputStream(stream);
assert.deepEqual(pipelineCalls.at(-1), ["stop", stream]);

console.log(JSON.stringify({ ok: true, checks: 9, inputRuntime: true }));
