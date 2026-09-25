import assert from "node:assert/strict";
import { createRuntimeCleanup } from "../server/services/runtime-cleanup.mjs";

const oauthStates = new Map([
  ["expired", { expiresAt: 99_999 }],
  ["active", { expiresAt: 100_001 }],
  ["invalid", null],
]);
const groupPresence = new Map([
  ["stale", 64_000],
  ["active", 65_001],
]);
const deletedAt = [];
const errors = [];
const scheduled = [];
const cleared = [];
const timer = { unrefCalled: false, unref() { this.unrefCalled = true; } };
const cleanup = createRuntimeCleanup({
  oauthStates,
  groupPresence,
  sessionRepository: {
    deleteExpired(value) {
      deletedAt.push(value);
      return Promise.resolve(2);
    },
  },
  errorLog: (event, fields) => errors.push({ event, fields }),
  now: () => 100_000,
  setIntervalFn: (callback, delay) => {
    scheduled.push({ callback, delay });
    return timer;
  },
  clearIntervalFn: (value) => cleared.push(value),
});

cleanup.pruneExpiredRuntimeState();
await Promise.resolve();
assert.equal(oauthStates.has("expired"), false);
assert.equal(oauthStates.has("invalid"), false);
assert.equal(oauthStates.has("active"), true);
assert.equal(groupPresence.has("stale"), false);
assert.equal(groupPresence.has("active"), true);
assert.deepEqual(deletedAt, ["1970-01-01T00:01:40.000Z"]);
assert.deepEqual(errors, []);

cleanup.start();
cleanup.start();
assert.equal(cleanup.isRunning(), true);
assert.equal(scheduled.length, 1);
assert.equal(scheduled[0].delay, 300_000);
assert.equal(timer.unrefCalled, true);
cleanup.stop();
assert.equal(cleanup.isRunning(), false);
assert.deepEqual(cleared, [timer]);

console.log(JSON.stringify({ ok: true, oauthPruned: true, presencePruned: true, sessionsDeleted: true, timerUnref: true }));
