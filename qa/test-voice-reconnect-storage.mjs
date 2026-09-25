import assert from "node:assert/strict";
import { createVoiceReconnectStorage } from "../frontend/src/services/media/voice-reconnect-storage.js";

const values = new Map();
const errors = [];
const storage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
let now = 10_000;
const reconnect = createVoiceReconnectStorage({ storage, now: () => now, onError: (...args) => errors.push(args) });

assert.equal(reconnect.read(), null);
const saved = reconnect.write({ groupId: "g".repeat(80), voiceRoomId: "r", groupName: "Grupo", roomName: "Sala" });
assert.equal(saved.groupId.length, 64);
assert.equal(saved.roomName, "Sala");
assert.deepEqual(reconnect.read(), saved);

now += 7 * 24 * 60 * 60 * 1000 + 1;
assert.equal(reconnect.read(), null);
assert.equal(values.size, 0);

values.set("mirante-voice-reconnect", "not-json");
assert.equal(reconnect.read(), null);
assert.equal(values.size, 0);

const failingStorage = createVoiceReconnectStorage({
  storage: {
    getItem: () => null,
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("readonly"); },
  },
  onError: (...args) => errors.push(args),
});
failingStorage.write({ groupId: "g", voiceRoomId: "r" });
failingStorage.clear();
assert.deepEqual(errors.map(([kind]) => kind), ["voice_reconnect_persist_error", "voice_reconnect_clear_error"]);

console.log(JSON.stringify({ ok: true, checks: 10 }));
