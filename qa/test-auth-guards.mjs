import assert from "node:assert/strict";
import { createRequireUser } from "../server/auth/guards.mjs";

const responses = [];
const json = (_response, status, body) => { responses.push({ status, body }); return true; };
const request = { headers: {} };
const authenticatedUser = { id: "user-1" };
const requireUser = createRequireUser({
  currentUser: async () => authenticatedUser,
  json,
});
assert.deepEqual(await requireUser(request, {}), authenticatedUser);
assert.equal(responses.length, 0);

const requireAnonymousUser = createRequireUser({ currentUser: async () => null, json });
assert.equal(await requireAnonymousUser(request, {}), null);
assert.deepEqual(responses[0], { status: 401, body: { error: "Entre com sua conta para continuar." } });

console.log(JSON.stringify({ ok: true, authenticated: true, anonymousStatus: responses[0].status }));

