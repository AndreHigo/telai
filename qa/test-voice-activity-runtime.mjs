import assert from "node:assert/strict";
import { createVoiceActivityRuntime } from "../frontend/src/features/voice/activity-runtime.js";

const analyzers = new Map([["user-2", { speaking: true }]]);
const calls = [];
let state = {
  voiceClientId: "user-1",
  voiceRoomId: "voice-1",
  voiceParticipants: new Map([["user-2", { id: "user-2", speaking: false }]]),
  voiceSpeakingSignalKnownParticipantIds: new Set(),
  speakingVoiceParticipantIds: new Set(),
};

const runtime = createVoiceActivityRuntime({
  activityController: {
    getAnalyzer: (participantId) => analyzers.get(participantId) || null,
    clearAnalyzer: (participantId) => { analyzers.delete(participantId); calls.push(["clear", participantId]); },
    ensureTimer: () => calls.push(["timer"]),
    resetPublisher: () => calls.push(["reset"]),
    attachStream: async (...args) => calls.push(["stream", ...args]),
    attachDetector: (...args) => calls.push(["detector", ...args]),
  },
  getState: () => state,
  setState: (next) => { state = { ...state, ...next }; },
  updateVoiceRoomSnapshot: (roomId, update) => calls.push(["snapshot", roomId, update([{ id: "user-2", speaking: false }])]),
});

runtime.markVoiceParticipantSpeaking("user-2", true);
assert.equal(state.voiceParticipants.get("user-2").speaking, true);
assert.equal(state.speakingVoiceParticipantIds.has("user-2"), true);
assert.equal(calls.at(-1)[0], "snapshot");

runtime.ensureVoiceActivityTimer();
runtime.clearVoiceSpeakingPublishTimer();
await runtime.attachVoiceActivityStream("user-2", "stream");
runtime.attachVoiceActivityDetector("user-2", "audio");
assert.deepEqual(calls.slice(-4).map(([type]) => type), ["timer", "reset", "stream", "detector"]);

runtime.clearVoiceActivityAnalyzer("user-2");
assert.equal(state.speakingVoiceParticipantIds.has("user-2"), false);

console.log(JSON.stringify({ ok: true, checks: 8, activityRuntime: true }));
