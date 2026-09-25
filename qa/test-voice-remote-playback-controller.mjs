import assert from "node:assert/strict";
import { createVoiceRemotePlaybackController } from "../frontend/src/features/voice/remote-playback-controller.js";

const audioByParticipant = new Map();
const bindingsByParticipant = new Map();
const timersByParticipant = new Map();
const scheduled = [];
const removed = [];
const reports = [];
const errors = [];
let blocked = false;
let nextAudio = null;

const timers = {
  setTimeout(callback, delay) {
    const handle = { callback, delay };
    scheduled.push(handle);
    return handle;
  },
  clearTimeout(handle) {
    handle.cleared = true;
  },
};

function createAudio() {
  const listeners = new Map();
  return {
    paused: true,
    ended: false,
    srcObject: { id: "remote-stream" },
    volume: 0,
    muted: false,
    sinkId: "",
    setAttribute() {},
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); },
    async setSinkId(value) {
      if (value === "speaker-1") throw new Error("speaker unavailable");
      this.sinkId = value;
    },
    async play() { this.paused = false; },
    remove() { removed.push(this); },
    listeners,
  };
}

const documentRef = {
  createElement() {
    nextAudio = createAudio();
    return nextAudio;
  },
  body: { appendChild() {} },
};

const controller = createVoiceRemotePlaybackController({
  audioByParticipant,
  bindingsByParticipant,
  playbackTimersByParticipant: timersByParticipant,
  documentRef,
  timers,
  isConnected: () => true,
  isDeafened: () => false,
  isLocallyMuted: (participantId) => participantId === "muted",
  getOutputDeviceId: () => "speaker-1",
  setOutputDeviceFallback: () => {},
  getEffectiveVolume: (participantId) => participantId === "muted" ? 0.25 : 0.8,
  setPlaybackBlocked: (value) => { blocked = value; },
  setVoiceError: (value) => errors.push(value),
  reportClientError: (...args) => reports.push(args),
});

const audio = controller.ensure("peer-1");
assert.equal(audio, nextAudio);
assert.equal(audioByParticipant.get("peer-1"), audio);
assert.equal(audio.className, "voice-remote-audio");
assert.equal(bindingsByParticipant.has("peer-1"), true);

await controller.play("peer-1", audio);
assert.equal(audio.sinkId, "default");
assert.equal(audio.volume, 0.8);
assert.equal(audio.muted, false);
assert.equal(reports[0][0], "voice_output_device_fallback");
assert.equal(blocked, false);

audio.paused = true;
controller.schedule("peer-1", 400);
assert.equal(scheduled.at(-1).delay, 400);
scheduled.at(-1).callback();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(audio.paused, false);

controller.remove("peer-1");
assert.equal(audioByParticipant.has("peer-1"), false);
assert.equal(bindingsByParticipant.has("peer-1"), false);
assert.equal(removed.at(-1), audio);

console.log(JSON.stringify({ ok: true, checks: 13 }));
