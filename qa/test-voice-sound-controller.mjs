import assert from "node:assert/strict";
import { createVoiceSoundController, readSoundPreferences } from "../frontend/src/features/voice/sound-controller.js";

const storage = new Map([
  ["mirante-sound-preferences", JSON.stringify({ enabled: false, volume: 0.8, enter: false })],
]);
const storageAdapter = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
assert.deepEqual(readSoundPreferences(storageAdapter), {
  enabled: false,
  volume: 0.8,
  enter: false,
  leave: true,
  mute: true,
  unmute: true,
  message: true,
  notification: true,
});

const state = { soundPreferences: readSoundPreferences(storageAdapter), voiceOutputVolume: 0.75, voiceDeafened: false, voiceSoundEffects: false };
const updates = [];
const oscillators = [];
const context = {
  state: "running",
  currentTime: 10,
  destination: {},
  resume: async () => {},
  createOscillator: () => {
    const oscillator = {
      type: "",
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect(target) { this.target = target; return target; },
      start() {},
      stop() {},
    };
    oscillators.push(oscillator);
    return oscillator;
  },
  createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(target) { return target; } }),
};
const controller = createVoiceSoundController({
  storage: storageAdapter,
  windowRef: { AudioContext: function AudioContext() { return context; } },
  getState: () => state,
  setState: (next) => { Object.assign(state, next); updates.push(next); },
});

controller.playVoiceSound("enter");
assert.equal(oscillators.length, 0, "disabled sound effects must not create tones");
controller.updateSoundPreference("enabled", true);
controller.updateSoundPreference("enter", true);
controller.updateSoundPreference("volume", 1.5);
assert.equal(state.soundPreferences.volume, 1);
assert.equal(storage.get("mirante-voice-sounds"), "true");
controller.playVoiceSound("enter");
assert.equal(oscillators.length, 2);
state.voiceDeafened = true;
controller.playVoiceSound("leave");
assert.equal(oscillators.length, 2, "deafened users must not hear UI tones");
assert.ok(updates.length >= 2);
console.log(JSON.stringify({ ok: true, persisted: true, tones: oscillators.length }));
