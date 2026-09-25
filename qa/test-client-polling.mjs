import assert from "node:assert/strict";
import { CLIENT_POLL_INTERVALS, createClientPollingController } from "../frontend/src/services/client-polling.js";

const scheduled = [];
const cleared = [];
const calls = [];
let visible = true;
let state = { user: { id: "user-1" }, isViewer: false, view: "groups", groupsWorkspaceOpen: true, selectedGroupId: "group-1", directConversationId: "" };
const controller = createClientPollingController({
  getState: () => state,
  shouldPoll: () => visible,
  refreshGroupOverview: () => calls.push("groups"),
  loadStreams: () => calls.push("streams"),
  loadNotifications: () => calls.push("notifications"),
  loadDirectConversationMessages: () => calls.push("direct"),
  loadMaintenance: () => calls.push("maintenance"),
  updateMaintenanceCountdown: () => calls.push("countdown"),
  setIntervalFn: (callback, delay) => {
    const timer = { callback, delay };
    scheduled.push(timer);
    return timer;
  },
  clearIntervalFn: (timer) => cleared.push(timer),
});

controller.start();
controller.start();
assert.equal(controller.isRunning(), true);
assert.deepEqual(scheduled.map((timer) => timer.delay), [
  CLIENT_POLL_INTERVALS.groupOverview,
  CLIENT_POLL_INTERVALS.streams,
  CLIENT_POLL_INTERVALS.notifications,
  CLIENT_POLL_INTERVALS.directMessages,
  CLIENT_POLL_INTERVALS.maintenance,
  CLIENT_POLL_INTERVALS.maintenanceCountdown,
]);

for (const timer of scheduled) timer.callback();
assert.deepEqual(calls, ["groups", "streams", "notifications", "maintenance", "countdown"]);

state = { ...state, view: "home", groupsWorkspaceOpen: false };
scheduled[1].callback();
scheduled[2].callback();
assert.deepEqual(calls, ["groups", "streams", "notifications", "maintenance", "countdown", "streams", "notifications"]);

state = { ...state, view: "direct", directConversationId: "conversation-1" };
scheduled[3].callback();
assert.equal(calls.at(-1), "direct");

visible = false;
const maintenanceCallsBeforeHidden = calls.filter((call) => call === "maintenance").length;
scheduled[4].callback();
assert.equal(calls.filter((call) => call === "maintenance").length, maintenanceCallsBeforeHidden);
scheduled[5].callback();
assert.equal(calls.at(-1), "countdown");

controller.stop();
assert.equal(controller.isRunning(), false);
assert.equal(cleared.length, scheduled.length);

console.log(JSON.stringify({ ok: true, intervals: scheduled.length, visibilityGating: true, idempotentStart: true }));
