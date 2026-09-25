import assert from "node:assert/strict";
import { createVoiceInputLifecycleController } from "../frontend/src/features/voice/input-lifecycle-controller.js";

function createTrack(label) {
  const listeners = new Map();
  return {
    kind: "audio",
    label,
    readyState: "live",
    enabled: false,
    addEventListener(type, callback, options) { listeners.set(type, { callback, options }); },
    dispatch(type) { listeners.get(type)?.callback(); },
    stop() { this.readyState = "ended"; },
  };
}

function createStream(track) {
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  };
}

const oldTrack = createTrack("old microphone");
const nextTrack = createTrack("recovered microphone");
const oldStream = createStream(oldTrack);
const nextStream = createStream(nextTrack);
const state = {
  voiceState: "connected",
  voiceLocalStream: oldStream,
  voiceMuted: true,
  voiceMutedByCaptureFailure: true,
  voiceServerMuted: false,
  voiceError: "Você entrou sem microfone. Verifique as permissões.",
  voiceClientId: "client-1",
  voiceRoomId: "room-1",
  voiceParticipants: new Map([["client-1", { id: "client-1", muted: true, serverMuted: false }]]),
  selectedInputDeviceId: "device-1",
};
const stateChanges = [];
const stoppedStreams = [];
const activityCalls = [];
const participantUpdates = [];
const muteMessages = [];
const reports = [];
const settingsCalls = [];

const controller = createVoiceInputLifecycleController({
  getState: () => state,
  setState: (next) => { Object.assign(state, next); stateChanges.push(next); },
  captureInputStream: async () => nextStream,
  stopInputStream: (stream) => { stoppedStreams.push(stream); stream?.getTracks?.().forEach((track) => track.stop()); },
  syncLocalTrackToPeers: async () => true,
  attachVoiceActivityStream: (participantId, stream) => { activityCalls.push(["attach", participantId, stream]); },
  clearVoiceActivityAnalyzer: (participantId) => { activityCalls.push(["clear", participantId]); },
  ensureVoiceActivityTimer: () => { activityCalls.push(["timer"]); },
  applyInputDevice: async (deviceId) => { settingsCalls.push(["device", deviceId]); },
  getVoiceTestRunning: () => true,
  stopVoiceTest: () => { settingsCalls.push(["stop-test"]); },
  startVoiceTest: async () => { settingsCalls.push(["start-test"]); },
  upsertVoiceRoomParticipant: (roomId, participant) => { participantUpdates.push([roomId, participant]); },
  sendVoiceMuteState: (muted) => { muteMessages.push(muted); },
  reportClientError: (...args) => { reports.push(args); },
});

controller.bindLocalTrack(oldTrack);
assert.equal(controller.isRecoveryInFlight(), false);
await controller.recover("track_ended");

assert.equal(state.voiceLocalStream, nextStream);
assert.equal(state.voiceMuted, false);
assert.equal(state.voiceMutedByCaptureFailure, false);
assert.equal(nextTrack.enabled, true);
assert.equal(stoppedStreams[0], oldStream);
assert.deepEqual(activityCalls.map(([kind]) => kind), ["clear", "attach", "timer"]);
assert.equal(state.voiceParticipants.get("client-1").muted, false);
assert.deepEqual(participantUpdates, [["room-1", { id: "client-1", muted: false, serverMuted: false }]]);
assert.deepEqual(muteMessages, [false]);
assert.equal(reports[0][0], "voice_input_track_recovered");
assert.equal(controller.isRecoveryInFlight(), false);

await controller.reapplySettings();
assert.deepEqual(settingsCalls, [["stop-test"], ["start-test"], ["device", "device-1"]]);
assert.ok(stateChanges.length >= 3);

console.log(JSON.stringify({ ok: true, checks: 17, stateChanges: stateChanges.length }));
