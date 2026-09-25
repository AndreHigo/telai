import assert from "node:assert/strict";
import { createVoicePeerHealthController } from "../frontend/src/features/voice/peer-health-controller.js";

const intervals = [];
const reports = [];
const recoveries = [];
const relayAttempts = [];
let now = 0;
const health = new Map();
const stats = new Map([["audio", { type: "inbound-rtp", kind: "audio", bytesReceived: 100, packetsReceived: 2 }]]);
const peers = new Map([["peer", {
  connectionState: "connected",
  iceConnectionState: "connected",
  getStats: async () => stats,
}]]);

const controller = createVoicePeerHealthController({
  getPeerConnections: () => peers,
  getPeerAudioHealth: () => health,
  getNow: () => now,
  hasTurnServer: () => true,
  recoverPeer: async (...args) => recoveries.push(args),
  markRelayRecoveryAttempted: (id) => relayAttempts.push(id),
  reportClientError: (...args) => reports.push(args),
  setIntervalFn: (callback, delay) => { const handle = { callback, delay }; intervals.push(handle); return handle; },
  clearIntervalFn: (handle) => { handle.cleared = true; },
});

controller.start();
controller.start();
assert.equal(intervals.length, 1);
assert.equal(intervals[0].delay, 2_000);

health.set("peer", { firstTrackAt: 0, lastProgressAt: 0, lastBytes: 100, recoveryAttempted: false });
await controller.poll();
assert.equal(reports.length, 0);

now = 4_000;
await controller.poll();
assert.equal(reports[0][0], "voice_peer_audio_stalled");
assert.equal(recoveries.length, 1);
assert.deepEqual(recoveries[0][2], { forceRelay: true });
assert.deepEqual(relayAttempts, ["peer"]);

controller.stop();
assert.equal(intervals[0].cleared, true);

const broken = createVoicePeerHealthController({
  getPeerConnections: () => peers,
  getPeerAudioHealth: () => new Map([["peer", { firstTrackAt: 0, lastProgressAt: 0, lastBytes: 0, recoveryAttempted: false }]]),
  reportClientError: (...args) => reports.push(args),
  getNow: () => 1,
});
peers.get("peer").getStats = async () => { throw new Error("stats unavailable"); };
await broken.poll();
assert.equal(reports.at(-1)[0], "voice_peer_audio_health_error");

console.log(JSON.stringify({ ok: true, checks: 10 }));
