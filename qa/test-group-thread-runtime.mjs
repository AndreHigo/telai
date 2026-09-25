import assert from "node:assert/strict";
import { createGroupThreadRuntime } from "../frontend/src/features/groups/thread-runtime.js";

let loads = 0;
const calls = [];
const controller = {
  openGroupThread: (...args) => { calls.push(["open", args]); return "opened"; },
  sendGroupThreadMessage: (...args) => { calls.push(["send", args]); return "sent"; },
};
const runtime = createGroupThreadRuntime({
  loadController: async () => {
    loads += 1;
    return controller;
  },
});

assert.equal(await runtime.openGroupThread("message-1"), "opened");
assert.equal(await runtime.sendGroupThreadMessage({ body: "resposta" }), "sent");
assert.equal(loads, 1);
assert.equal(await runtime.getController(), controller);
assert.deepEqual(calls, [
  ["open", ["message-1"]],
  ["send", [{ body: "resposta" }]],
]);

const failingRuntime = createGroupThreadRuntime({
  loadController: async () => { throw new Error("thread controller failed"); },
});
await assert.rejects(() => failingRuntime.openGroupThread("message-2"), { message: "thread controller failed" });

console.log(JSON.stringify({ ok: true, checks: 7 }));
