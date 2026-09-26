import assert from "node:assert/strict";
import { createGatewaySequenceGuard } from "../frontend/src/services/gateway-sequence.js";

const accept = createGatewaySequenceGuard();
const firstSocket = {};
const secondSocket = {};

assert.equal(accept(firstSocket, { type: "legacy" }), true);
assert.equal(accept(firstSocket, { sequence: 1 }), true);
assert.equal(accept(firstSocket, { sequence: 1 }), false);
assert.equal(accept(firstSocket, { sequence: 0 }), true);
assert.equal(accept(firstSocket, { sequence: 3 }), true);
assert.equal(accept(firstSocket, { sequence: 2 }), false);
assert.equal(accept(secondSocket, { sequence: 1 }), true);
assert.equal(accept(secondSocket, { sequence: 1 }), false);

console.log(JSON.stringify({ ok: true, checks: 8, perSocketIsolation: true, monotonic: true }));
