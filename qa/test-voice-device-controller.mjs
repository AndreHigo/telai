import assert from "node:assert/strict";
import { createVoiceDeviceController } from "../frontend/src/services/media/voice-device-controller.js";

const storageValues = new Map([
  ["mirante-voice-input", "old-device"],
  ["mirante-voice-input-label", "Microfone USB"],
]);
const storage = {
  setItem(key, value) { storageValues.set(key, String(value)); },
  removeItem(key) { storageValues.delete(key); },
};
const permissionTracks = [{ stopCalls: 0, stop() { this.stopCalls += 1; } }];
const errors = [];
const persistedInputs = [];
const state = {
  user: { id: "user-1" },
  selectedInputDeviceId: "old-device",
  selectedInputDeviceLabel: "Microfone USB",
  selectedOutputDeviceId: "output-1",
  allAudioInputDevices: [],
  audioInputDevices: [],
  cameraInputDevices: [],
  audioOutputDevices: [],
  audioDevicesRequestRevision: 0,
  voiceInputSelectionRevision: 0,
  voiceState: "idle",
  voiceTestRunning: false,
  voiceLocalStream: null,
  voiceMuted: false,
  voiceMutedByCaptureFailure: false,
  voiceServerMuted: false,
  voiceError: "",
  voiceClientId: "client-1",
  voiceRoomId: "room-1",
  voiceParticipants: new Map(),
  voiceDevicesBusy: false,
  voiceDevicesError: "",
};
const outputAudio = {
  sinks: [],
  async setSinkId(id) { this.sinks.push(id); },
};
const remoteAudio = new Map([["participant-1", outputAudio]]);
const played = [];
const controller = createVoiceDeviceController({
  getState: () => state,
  setState: (next) => Object.assign(state, next),
  getUserMedia: async () => ({ getTracks: () => permissionTracks }),
  enumerateDevices: async () => [
    { kind: "audioinput", deviceId: "new-device", groupId: "group-1", label: "Microfone USB" },
    { kind: "videoinput", deviceId: "camera-1", groupId: "group-2", label: "Câmera" },
    { kind: "audiooutput", deviceId: "output-2", groupId: "group-3", label: "Fone" },
  ],
  getVoiceAudioConstraints: () => ({ noiseSuppression: true }),
  getSelectedVoiceAudioConstraints: () => ({ deviceId: { exact: state.selectedInputDeviceId } }),
  persistPreferredInputDeviceId: (value) => persistedInputs.push(value),
  clearUnavailableInputDevice: () => { state.selectedInputDeviceId = ""; },
  reportClientError: (kind, error) => errors.push({ kind, message: error.message }),
  storage,
  captureInputStream: async () => { throw new Error("não deveria capturar fora da sala"); },
  stopInputStream: () => {},
  stopVoiceTest: () => {},
  getRemoteAudio: () => remoteAudio,
  playRemoteAudio: async (id) => played.push(id),
  persistOutputPreference: () => {},
});

await controller.loadAudioDevices(true);
assert.equal(state.selectedInputDeviceId, "new-device");
assert.equal(state.selectedInputDeviceLabel, "Microfone USB");
assert.equal(state.audioInputDevices.length, 1);
assert.equal(state.cameraInputDevices.length, 1);
assert.equal(state.audioOutputDevices.length, 1);
assert.deepEqual(persistedInputs, ["new-device"]);
assert.equal(permissionTracks[0].stopCalls, 2);

await controller.applyVoiceOutputDevice("output-2");
assert.deepEqual(outputAudio.sinks, ["output-2"]);
assert.deepEqual(played, ["participant-1"]);
assert.equal(storageValues.get("mirante-voice-output"), "output-2");

await controller.applyVoiceInputDevice("new-device");
assert.equal(state.selectedInputDeviceId, "new-device");
assert.equal(state.voiceInputSelectionRevision, 1);
assert.equal(errors.length, 0);

console.log(JSON.stringify({ ok: true, checks: 12 }));
