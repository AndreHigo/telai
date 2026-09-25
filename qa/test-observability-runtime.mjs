import assert from "node:assert/strict";
import { createObservabilityRuntime } from "../server/observability/runtime.mjs";

const runtime = createObservabilityRuntime({
  fs: null,
  path: null,
  logPath: "",
  logLevels: { debug: 10, info: 20, warn: 30, error: 40 },
  logLevel: "info",
});

assert.equal(runtime.hasLogFile(), false);
assert.equal(runtime.metricRoute("/api/v1/groups"), "/api/v1");
assert.equal(runtime.metricRoute("/updates/latest"), "/updates/*");
assert.equal(runtime.metricRoute("/signal"), "/signal");
assert.equal(runtime.metricRoute("/unknown"), "/unknown");

const counts = new Map();
runtime.addMapCount(counts, "ok");
runtime.addMapCount(counts, "ok", 2);
assert.equal(counts.get("ok"), 3);
assert.equal(runtime.addResponseBytes(null, "Telai"), 5);
assert.equal(runtime.addResponseBytes(null, new Uint8Array(7)), 7);

const localRequest = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
assert.equal(runtime.isLocalObservabilityRequest(localRequest), true);
assert.equal(runtime.isLocalObservabilityRequest({ ...localRequest, headers: { "x-forwarded-for": "127.0.0.1" } }), false);

runtime.infoLog("runtime_probe", { token: "secret" });
assert.equal(runtime.observability.recentEvents.at(-1).event, "runtime_probe");
assert.equal(runtime.observability.recentEvents.at(-1).token, "[redacted]");

console.log(JSON.stringify({ ok: true, checks: 12 }));
