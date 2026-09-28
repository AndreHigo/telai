import assert from "node:assert/strict";
import { createVoiceRoomController } from "../frontend/src/features/voice/room-controller.js";

const tracks = () => [{ readyState: "live", enabled: true }];
const stream = { getAudioTracks: tracks, getTracks: tracks };
const sent = [];
const calls = [];
let state = {
  selectedRoom: { id: "voice-1", kind: "voice" },
  selectedGroupId: "group-1",
  selectedInputDeviceId: "mic-1",
  user: { id: "user-1", displayName: "QA", username: "qa" },
  voiceClientId: null,
  voiceDeafened: false,
  voiceError: "",
  voiceLocalStream: null,
  voiceMuted: false,
  voiceMutedByCaptureFailure: false,
  voiceParticipants: new Map(),
  voicePeerConnections: new Map(),
  voicePlaybackBlocked: false,
  voiceRemoteAudio: new Map(),
  voiceRoomId: null,
  voiceServerMuted: false,
  voiceSpeakingSignalKnownParticipantIds: new Set(),
  voiceState: "idle",
};

const controller = createVoiceRoomController({
  getState: () => state,
  setState: (next) => { state = { ...state, ...next }; },
  refreshIceConfiguration: async () => calls.push("ice"),
  connectSocket: async () => calls.push("connect"),
  closeSocket: () => calls.push("close"),
  getVoiceSoundContext: () => calls.push("sound-context"),
  captureVoiceInputStream: async () => stream,
  inputStreamMatchesSelectedDevice: () => true,
  stopVoiceInputStream: () => calls.push("stop-input"),
  bindVoiceLocalTrack: () => calls.push("bind-track"),
  sendVoice: (message) => sent.push(message),
  upsertVoiceRoomParticipant: () => calls.push("upsert"),
  removeVoiceRoomParticipant: () => calls.push("remove"),
  closeVoicePeer: () => calls.push("close-peer"),
  clearPeerRecovery: () => calls.push("clear-recovery"),
  clearVoiceActivityAnalyzer: () => calls.push("clear-analyzer"),
  resetVoiceActivity: () => calls.push("reset-activity"),
  clearVoicePeerHealth: () => calls.push("clear-health"),
  clearVoicePeerRelayRecovery: () => calls.push("clear-relay-recovery"),
  clearVoiceSignalingQueues: () => calls.push("clear-signaling"),
  clearVoicePendingSignals: () => calls.push("clear-pending"),
  stopVoicePeerHealthTimer: () => calls.push("stop-health"),
  clearReconnectSession: () => calls.push("clear-reconnect"),
  clearSpeakingPublishTimer: () => calls.push("clear-speaking"),
  releasePushToTalk: () => calls.push("release-ptt"),
  resumeVoiceRemoteAudio: () => calls.push("resume-audio"),
  isLocallyMuted: () => false,
  voicePreferenceTargetId: (id) => id,
  playVoiceSound: (sound) => calls.push(`sound:${sound}`),
  openSettings: async () => {},
  loadAudioDevices: async () => {},
  reportClientError: (kind) => calls.push(kind),
});

assert.equal(await controller.joinVoiceRoom(), true);
assert.equal(state.voiceState, "connecting");
assert.equal(state.voiceRoomId, "voice-1");
assert.equal(state.voiceLocalStream, stream);
assert.equal(sent.at(-1).type, "voice-join");

state = {
  ...state,
  voiceState: "connected",
  voiceClientId: "client-1",
  voiceParticipants: new Map([["client-1", { id: "client-1", muted: false, deafened: false }]]),
};
assert.equal(controller.setVoiceMuted(true), true);
assert.equal(state.voiceMuted, true);
assert.equal(sent.at(-1).type, "voice-mute-state");
controller.toggleVoiceDeafen();
assert.equal(state.voiceDeafened, true);
assert.equal(sent.at(-1).type, "voice-deafen-state");
await controller.leaveVoiceRoom();
assert.equal(state.voiceState, "idle");
assert.equal(state.voiceRoomId, null);
assert.ok(sent.some((message) => message.type === "voice-leave"));

console.log("voice room controller: ok");
