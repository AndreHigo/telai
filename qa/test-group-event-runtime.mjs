import assert from "node:assert/strict";
import { createGroupEventRuntime } from "../frontend/src/features/groups/event-runtime.js";

let gatewayCreates = 0;
let gatewayOptions = null;
let gatewayClosed = 0;
let handlerLoads = 0;
const handledMessages = [];
const notifications = [];
const handlerErrors = [];
const gatewayErrors = [];

const runtime = createGroupEventRuntime({
  createGateway: (options) => {
    gatewayCreates += 1;
    gatewayOptions = options;
    return {
      subscribeGroup: (groupId) => `subscribed:${groupId}`,
      close: () => { gatewayClosed += 1; },
    };
  },
  loadHandler: async () => {
    handlerLoads += 1;
    return (message) => { handledMessages.push(message); };
  },
  onNotification: (notification) => notifications.push(notification),
  onHandlerError: (error) => handlerErrors.push(error),
  onGatewayError: (error) => gatewayErrors.push(error),
});

const firstGateway = runtime.ensure();
assert.equal(gatewayCreates, 1);
assert.equal(runtime.ensure(), firstGateway);
assert.equal(gatewayCreates, 1);
assert.equal(firstGateway.subscribeGroup("group-1"), "subscribed:group-1");

gatewayOptions.onMessage({ type: "notification-created", notification: { id: "notification-1" } });
assert.deepEqual(notifications, [{ id: "notification-1" }]);
assert.equal(handlerLoads, 0);

gatewayOptions.onMessage({ type: "group-message", message: { id: "message-1" } });
gatewayOptions.onMessage({ type: "group-message", message: { id: "message-2" } });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(handlerLoads, 1);
assert.equal(handledMessages.length, 2);
assert.equal(handledMessages[0].message.id, "message-1");
assert.equal(handledMessages[1].message.id, "message-2");

const gatewayError = new Error("gateway failed");
gatewayOptions.onError(gatewayError);
assert.deepEqual(gatewayErrors, [gatewayError]);

const failingRuntime = createGroupEventRuntime({
  createGateway: (options) => {
    failingRuntimeOptions = options;
    return { close() {} };
  },
  loadHandler: async () => { throw new Error("handler failed"); },
  onHandlerError: (error) => handlerErrors.push(error),
});
let failingRuntimeOptions = null;
failingRuntime.ensure();
failingRuntimeOptions.onMessage({ type: "group-message" });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(handlerErrors.length, 1);
assert.equal(handlerErrors[0].message, "handler failed");

runtime.close();
assert.equal(gatewayClosed, 1);
assert.equal(gatewayCreates, 1);
assert.equal(runtime.ensure() !== firstGateway, true);
assert.equal(gatewayCreates, 2);

console.log(JSON.stringify({ ok: true, checks: 14 }));
