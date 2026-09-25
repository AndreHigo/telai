import assert from "node:assert/strict";
import { createMaintenanceController } from "../frontend/src/features/shell/maintenance-controller.js";

const startAt = Date.parse("2026-09-25T15:00:00.000Z");
let currentTime = startAt - 4500;
const storageValues = new Map();
const scheduledReloads = [];
const reloads = [];
let fetchCalls = 0;

const notice = {
  id: "maintenance-1",
  startsAt: new Date(startAt).toISOString(),
  message: "Atualização programada.",
};

const controller = createMaintenanceController({
  now: () => currentTime,
  storage: {
    getItem: (key) => storageValues.get(key) || null,
    setItem: (key, value) => storageValues.set(key, value),
  },
  fetchImpl: async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({ notice }) };
  },
  scheduleReload: (callback) => scheduledReloads.push(callback),
  reload: () => reloads.push("reloaded"),
});

const updates = [];
const unsubscribe = controller.subscribe((state) => updates.push({ ...state }));

await controller.load();
assert.equal(fetchCalls, 1);
assert.equal(controller.getState().notice.id, "maintenance-1");
assert.equal(controller.getState().remainingSeconds, 5);
assert.equal(scheduledReloads.length, 0);

currentTime = startAt;
controller.updateCountdown();
assert.equal(controller.getState().remainingSeconds, 0);
assert.equal(controller.getState().reloadKey, "maintenance-1");
assert.equal(storageValues.get("telai-maintenance-reloaded:maintenance-1"), "1");
assert.equal(scheduledReloads.length, 1);
scheduledReloads[0]();
assert.deepEqual(reloads, ["reloaded"]);

await controller.load();
assert.equal(controller.getState().notice, null);
assert.equal(controller.getState().remainingSeconds, 0);
assert.equal(controller.getState().reloadKey, "");
assert.ok(updates.length >= 4);
unsubscribe();

console.log(JSON.stringify({ ok: true, checks: 12, reloadGuard: true, countdown: true }));
