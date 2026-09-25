import assert from "node:assert/strict";
import { createNotificationService } from "../server/notifications/service.mjs";

const events = [];
const notification = { userId: "user-1", type: "friend_request", entityId: "request-1", title: "Novo pedido", body: "Você recebeu um pedido." };
const service = createNotificationService({
  persistNotification: (value) => ({ created: true, id: "notification-1", value }),
  publishUserEvent: (userId, event) => events.push({ userId, event }),
});
const result = service.createNotification(notification);
assert.equal(result.created, true);
assert.equal(events.length, 1);
assert.equal(events[0].userId, "user-1");
assert.equal(events[0].event.type, "notification-created");
assert.equal(events[0].event.notification.id, "notification-1");
assert.equal(events[0].event.notification.unread, true);

const asyncEvents = [];
const asyncService = createNotificationService({
  persistNotification: async () => ({ created: true, id: "notification-2" }),
  publishUserEvent: (userId, event) => asyncEvents.push({ userId, event }),
});
const asyncResult = await asyncService.createNotification(notification);
assert.equal(asyncResult.id, "notification-2");
assert.equal(asyncEvents.length, 1);

console.log(JSON.stringify({ ok: true, sync: true, async: true, published: events.length + asyncEvents.length }));

