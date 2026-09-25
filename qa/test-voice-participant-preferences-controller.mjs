import assert from "node:assert/strict";
import { createVoiceParticipantPreferencesController } from "../frontend/src/features/voice/participant-preferences-controller.js";

const stateChanges = [];
const timers = [];
const apiCalls = [];
const reports = [];
const audio = { volume: 0, muted: false };
const state = {
  user: { id: "owner" },
  voiceParticipants: new Map([["client-1", { id: "client-1", userId: "member-1" }]]),
  voiceVolumes: new Map(),
  voiceLocallyMutedParticipants: new Set(),
  voiceOutputVolume: 0.5,
  voiceRemoteAudio: new Map([["client-1", audio]]),
  voiceDeafened: false,
};

const controller = createVoiceParticipantPreferencesController({
  api: async (...args) => { apiCalls.push(args); return { ok: true }; },
  getState: () => state,
  setState: (next) => {
    Object.assign(state, next);
    stateChanges.push(next);
  },
  normalizeAudioVolume: (value, fallback = 1) => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback,
  reportClientError: (...args) => reports.push(args),
  timers: {
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timer.cleared = true; },
  },
});

const preferences = new controller.VoicePreferenceMap([["member-1", 0.6]]);
assert.equal(preferences.get("client-1"), 0.6);
state.voiceVolumes = preferences;
assert.equal(controller.resolveTargetId("client-1"), "member-1");
assert.equal(controller.effectiveVolume("client-1"), 0.3);

assert.equal(controller.setVolume("client-1", 25), true);
assert.equal(state.voiceVolumes.get("member-1"), 0.25);
assert.equal(audio.volume, 0.125);
assert.equal(timers.at(-1).delay, 250);

assert.equal(controller.toggleLocallyMuted("client-1"), true);
assert.equal(state.voiceLocallyMutedParticipants.has("member-1"), true);
assert.equal(audio.muted, true);
assert.equal(controller.isLocallyMuted("client-1"), true);
assert.equal(timers.at(-2).cleared, true);

timers.at(-1).callback();
await Promise.resolve();
assert.equal(apiCalls.length, 1);
const persisted = JSON.parse(apiCalls[0][1].body);
assert.deepEqual(persisted, { targetUserId: "member-1", volume: 0.25, locallyMuted: true });

state.voiceDeafened = true;
state.voiceLocallyMutedParticipants.clear();
controller.refreshRemoteAudio();
assert.equal(audio.volume, 0.125);
assert.equal(audio.muted, true);
assert.equal(reports.length, 0);
controller.dispose();

console.log(JSON.stringify({ ok: true, checks: 17, stateChanges: stateChanges.length }));

