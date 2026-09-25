import assert from "node:assert/strict";
import { createObservabilitySnapshot } from "../server/observability/snapshot.mjs";

const map = (entries) => new Map(entries);
const observability = {
  startedAt: "2026-09-25T00:00:00.000Z",
  activeRequests: 2,
  requestsTotal: 9,
  requestsCompleted: 6,
  requestsAborted: 1,
  responseBytes: 512,
  statusCounts: map([["200", 7]]),
  routeCounts: map([["/api/v1/groups", 4], ["/healthz", 9]]),
  routeBytes: map([["/healthz", 100]]),
  clientEventCounts: map([["voice_rtc_quality", 3]]),
  websocket: { active: 1, connections: 2, closed: 1, messagesIn: 4, messagesOut: 5, bytesIn: 6, bytesOut: 7 },
  recentEvents: Array.from({ length: 55 }, (_, index) => ({ event: `event-${index}` })),
};
const state = {
  observability,
  mediaMode: "p2p",
  requireLogin: true,
  rooms: new Map([["room", {}]]),
  voiceRooms: new Map(),
  logLevel: "info",
  hasLogFile: () => false,
  downloadRateLimitPerMinute: 20,
  downloadRate: new Map([["client", {}]]),
  clientErrorRateLimitPerMinute: 60,
  clientErrorRate: new Map(),
  apiRateLimitPerMinute: 240,
  apiWriteRateLimitPerMinute: 90,
  apiGlobalRateLimitPerMinute: 900,
  apiRate: new Map(),
  apiWriteRate: new Map(),
  apiGlobalRate: new Map(),
  registerRate: new Map(),
  oauthRate: new Map(),
  loginRateLimitPerMinute: 12,
  loginFailureLimit: 5,
  loginFailureIpLimit: 30,
  loginFailureWindowMs: 900_000,
  loginFailures: new Map(),
  websocketConnectionRateLimit: 30,
  websocketActiveConnectionLimit: 20,
  websocketConnectionRate: new Map(),
  uptime: () => 12.4,
};

const snapshot = createObservabilitySnapshot(state)();
assert.equal(snapshot.ok, true);
assert.equal(snapshot.uptimeSeconds, 12);
assert.equal(snapshot.rooms, 1);
assert.equal(snapshot.requests.total, 9);
assert.deepEqual(snapshot.requests.topRoutes[0], { route: "/healthz", value: 9 });
assert.equal(snapshot.clientEvents[0].route, "voice_rtc_quality");
assert.equal(snapshot.logging.recentEvents.length, 50);
assert.equal(snapshot.logging.recentEvents[0].event, "event-5");
assert.equal(snapshot.downloadProtection.trackedClients, 1);
assert.equal(snapshot.loginProtection.failureWindowSeconds, 900);
assert.deepEqual(snapshot.websocket, observability.websocket);

console.log(JSON.stringify({ ok: true, topRoutes: true, boundedRecentEvents: true, protections: true }));
