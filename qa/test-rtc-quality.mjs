import assert from "node:assert/strict";
import { summarizeRtcQuality } from "../frontend/src/services/media/rtc-quality.js";

const first = summarizeRtcQuality(new Map([
  ["pair", { type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.05 }],
  ["codec-audio", { id: "codec-audio", type: "codec", mimeType: "audio/opus", clockRate: 48000, channels: 2 }],
  ["audio", { id: "audio", type: "inbound-rtp", kind: "audio", codecId: "codec-audio", jitter: 0.01, packetsLost: 2, packetsReceived: 98, bytesReceived: 1000, timestamp: 1000 }],
]), new Map(), { includeCodecs: true });
assert.equal(first.sample.roundTripTimeMs, 50);
assert.equal(first.sample.jitterMs, 10);
assert.equal(first.sample.packetsLost, 2);
assert.equal(first.sample.mediaStreams, 1);
assert.equal(first.sample.bitrateKbps, 0);
assert.deepEqual(first.sample.codecs, [{ kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2, sdpFmtpLine: null }]);

const second = summarizeRtcQuality(new Map([
  ["pair", { type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.04 }],
  ["audio", { id: "audio", type: "inbound-rtp", kind: "audio", jitter: 0.02, packetsLost: 3, packetsReceived: 197, bytesReceived: 9000, timestamp: 2000 }],
]), first.snapshots);
assert.equal(second.sample.roundTripTimeMs, 40);
assert.equal(second.sample.jitterMs, 20);
assert.equal(second.sample.packetsLost, 3);
assert.equal(second.sample.packetsReceived, 197);
assert.equal(second.sample.bitrateKbps, 64);
console.log(JSON.stringify({ ok: true, metrics: second.sample }));
