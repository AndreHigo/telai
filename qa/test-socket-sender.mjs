import assert from "node:assert/strict";
import { createSocketSender } from "../server/gateway/socket-sender.mjs";

const errors = [];
const sender = createSocketSender({ errorLog: (event, fields) => errors.push({ event, fields }) });
const sent = [];
const socket = {
  readyState: 1,
  clientId: "client-1",
  send(payload) { sent.push(JSON.parse(payload)); },
};

assert.equal(sender(socket, { type: "hello", value: 1 }), true);
assert.deepEqual(sent[0], { type: "hello", value: 1, sequence: 1 });
assert.equal(sender(socket, { type: "world" }), true);
assert.equal(sent[1].sequence, 2);
assert.equal(sender({ readyState: 0 }, { type: "ignored" }), false);

const failingSocket = {
  readyState: 1,
  clientId: "client-2",
  send() { throw new Error("socket closed"); },
};
assert.equal(sender(failingSocket, { type: "failure" }), false);
assert.deepEqual(errors, [{ event: "ws_send_error", fields: { clientId: "client-2", type: "failure", error: "socket closed" } }]);

console.log(JSON.stringify({ ok: true, sequencing: true, closedSocket: true, errorLogging: true }));
