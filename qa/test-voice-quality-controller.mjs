import assert from "node:assert/strict";
import { createVoiceQualityController } from "../frontend/src/features/voice/quality-controller.js";

const intervals = [];
const reports = [];
const errors = [];
const statsByPeer = new Map([
  ["peer-a", new Map([
    ["pair-a", { type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.04 }],
    ["audio-a", { id: "audio-a", type: "inbound-rtp", kind: "audio", packetsReceived: 10, bytesReceived: 1000, timestamp: 1000 }],
  ])],
  ["peer-b", new Map([
    ["pair-b", { type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.08 }],
    ["audio-b", { id: "audio-b", type: "inbound-rtp", kind: "audio", packetsReceived: 20, bytesReceived: 2000, timestamp: 1000 }],
  ])],
]);
const peers = new Map([...statsByPeer.entries()].map(([participantId, reportsForPeer]) => [participantId, {
  connectionState: "connected",
  iceConnectionState: "connected",
  getStats: async () => reportsForPeer,
}]));

const controller = createVoiceQualityController({
  getPeerConnections: () => peers,
  loadQualityModule: async () => import("../frontend/src/services/media/rtc-quality.js"),
  reportClientError: (...args) => reports.push(args),
  setIntervalFn: (callback, delay) => {
    const handle = { callback, delay };
    intervals.push(handle);
    return handle;
  },
  clearIntervalFn: (handle) => { handle.cleared = true; },
  pollIntervalMs: 1234,
});

controller.start();
assert.equal(intervals.length, 1);
assert.equal(intervals[0].delay, 1234);
controller.start();
assert.equal(intervals.length, 1);

await controller.poll();
assert.equal(reports.length, 1);
assert.equal(reports[0][0], "voice_rtc_quality");
assert.equal(reports[0][2].samples.length, 2);
assert.equal(reports[0][2].samples[0].roundTripTimeMs, 40);
assert.equal(reports[0][2].samples[1].roundTripTimeMs, 80);

statsByPeer.get("peer-a").set("audio-a", { id: "audio-a", type: "inbound-rtp", kind: "audio", packetsReceived: 20, bytesReceived: 3000, timestamp: 2000 });
statsByPeer.get("peer-b").set("audio-b", { id: "audio-b", type: "inbound-rtp", kind: "audio", packetsReceived: 40, bytesReceived: 5000, timestamp: 2000 });
await controller.poll();
assert.equal(reports[1][2].samples[0].bitrateKbps, 16);
assert.equal(reports[1][2].samples[1].bitrateKbps, 24);

peers.delete("peer-a");
await controller.poll();
assert.equal(reports[2][2].samples.length, 1);

controller.stop();
assert.equal(intervals[0].cleared, true);

const broken = createVoiceQualityController({
  getPeerConnections: () => peers,
  loadQualityModule: async () => { throw new Error("quality module unavailable"); },
  reportClientError: (...args) => errors.push(args),
});
await broken.poll();
assert.equal(errors[0][0], "voice_rtc_quality_error");

console.log(JSON.stringify({ ok: true, checks: 12 }));
