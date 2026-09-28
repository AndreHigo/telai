import assert from "node:assert/strict";
import { createVoiceMessageController } from "../frontend/src/features/voice/message-controller.js";

let state = {
  user: { id: "local", displayName: "Local", username: "local" },
  selectedGroupId: "group-1",
  selectedGroup: { name: "Grupo" },
  selectedRoom: { name: "Sala" },
  voiceClientId: null,
  voiceLocalStream: { getAudioTracks: () => [{ readyState: "live" }] },
  voiceMuted: false,
  voiceServerMuted: false,
  voiceDeafened: false,
  voiceParticipants: new Map(),
  voiceState: "connecting",
  voiceError: "",
  voiceRoomId: "room-1",
  voiceSpeakingSignalKnownParticipantIds: new Set(),
  voicePeerConnections: new Map(),
  voicePendingSignals: new Map(),
};
const calls = [];
const controller = createVoiceMessageController({
  getState: () => state,
  setState: (next) => { state = { ...state, ...next }; },
  uniqueParticipants: (participants) => participants,
  writeReconnectSession: (...args) => calls.push(["persist", ...args]),
  attachVoiceActivityStream: (...args) => calls.push(["activity", ...args]),
  replaceRoomSnapshot: (...args) => calls.push(["snapshot", ...args]),
  upsertRoomParticipant: (...args) => calls.push(["upsert", ...args]),
  removeRoomParticipant: (...args) => calls.push(["remove", ...args]),
  createPeer: (...args) => calls.push(["peer", ...args]),
  shouldInitiatePeer: () => true,
  closePeer: (...args) => calls.push(["close", ...args]),
  syncLocalTrackToPeers: () => calls.push(["sync"]),
  sendVoice: (...args) => calls.push(["send", ...args]),
  playVoiceSound: (...args) => calls.push(["sound", ...args]),
  setGroupState: (...args) => calls.push(["group", ...args]),
});

await controller.handle({ type: "voice-joined", clientId: "local-client", voiceRoomId: "room-1", participants: [{ id: "peer-1", userId: "remote" }] });
assert.equal(state.voiceState, "connected");
assert.equal(state.voiceClientId, "local-client");
assert.equal(state.voiceParticipants.size, 2);
assert.ok(calls.some(([kind]) => kind === "peer"));
assert.ok(calls.some(([kind]) => kind === "snapshot"));

await controller.handle({ type: "voice-user-muted", participantId: "peer-1", muted: true, serverMuted: true });
assert.equal(state.voiceParticipants.get("peer-1").serverMuted, true);
await controller.handle({ type: "voice-user-left", participantId: "peer-1" });
assert.equal(state.voiceParticipants.has("peer-1"), false);

console.log("voice message controller: ok");
