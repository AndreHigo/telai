import assert from "node:assert/strict";
import { createApiClient } from "../frontend/src/services/api.js";

const calls = [];
const api = createApiClient({
  fetchImpl: async (path, options) => {
    calls.push({ path, method: options.method || "GET" });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  },
});

await api("/api/groups");
await api("/healthz");
assert.deepEqual(calls, [
  { path: "/api/v1/groups", method: "GET" },
  { path: "/healthz", method: "GET" },
]);

const errorApi = createApiClient({
  fetchImpl: async (path) => {
    assert.equal(path, "/api/v1/groups");
    return new Response(JSON.stringify({ error: "Não autorizado.", code: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  },
});
await assert.rejects(() => errorApi("/api/groups"), (error) => error.status === 401 && error.code === "unauthorized");
console.log(JSON.stringify({ ok: true, versionedPath: true, errorCodePreserved: true }));
