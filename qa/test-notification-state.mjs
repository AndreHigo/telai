import assert from "node:assert/strict";
import { createNotificationStateStore } from "../frontend/src/features/notifications/notification-state.js";

const first = createNotificationStateStore();
const updates = [];
const unsubscribe = first.subscribe((state) => updates.push(state));

assert.deepEqual(first.getState().notifications, []);
assert.equal(first.getState().notificationUnreadCount, 0);
assert.deepEqual(first.getState().knownNotificationIds, new Set());

first.setState({ notifications: [{ id: "n1", unread: true }], notificationUnreadCount: 1, knownNotificationIds: new Set(["n1"]) });
assert.equal(first.getState().notifications[0].id, "n1");
assert.equal(first.getState().notificationUnreadCount, 1);
assert.equal(first.getState().knownNotificationIds.has("n1"), true);

const second = createNotificationStateStore();
assert.deepEqual(second.getState().notifications, []);
assert.equal(second.getState().knownNotificationIds.has("n1"), false);

first.reset();
assert.deepEqual(first.getState().notifications, []);
assert.deepEqual(first.getState().knownNotificationIds, new Set());
assert.ok(updates.length >= 3);

unsubscribe();
console.log(JSON.stringify({ ok: true, checks: 10, updates: updates.length }));
