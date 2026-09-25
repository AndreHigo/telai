import assert from "node:assert/strict";
import { createVoicePeerRecoveryController } from "../frontend/src/features/voice/peer-recovery-controller.js";

const timers = [];
const reports = [];
const sent = [];
const created = [];
const closed = [];
const state = { voiceState: "connected", rtcConfig: { iceServers: [] }, voicePeerConnections: new Map() };

function peer({ state: signalingState = "stable" } = {}) {
  return {
    connectionState: "failed",
    signalingState,
    localDescription: null,
    restartIce() { this.restarted = true; },
    async createOffer() { return { type: "offer", sdp: "restart-offer" }; },
    async setLocalDescription(description) { this.localDescription = description; this.signalingState = "have-local-offer"; },
  };
}

const controller = createVoicePeerRecoveryController({
  getState: () => state,
  refreshIceConfiguration: async () => {},
  hasTurnServer: () => false,
  closePeer: (id) => { closed.push(id); state.voicePeerConnections.delete(id); },
  createPeer: (...args) => { created.push(args); return null; },
  shouldInitiate: () => true,
  sendVoice: (message) => sent.push(message),
  reportClientError: (...args) => reports.push(args),
  setTimeoutFn: (callback, delay) => { const handle = { callback, delay }; timers.push(handle); return handle; },
  clearTimeoutFn: (handle) => { handle.cleared = true; },
});

const renegotiatingPeer = peer();
state.voicePeerConnections.set("peer", renegotiatingPeer);
await controller.recover("peer", renegotiatingPeer);
assert.equal(renegotiatingPeer.restarted, true);
assert.equal(sent[0].payload.kind, "offer");
assert.equal(reports[0][0], "voice_peer_recovery_started");
assert.equal(controller.getRecoveryCount("peer"), 1);

const relayController = createVoicePeerRecoveryController({
  getState: () => state,
  refreshIceConfiguration: async () => {},
  hasTurnServer: () => true,
  closePeer: (id) => { closed.push(id); state.voicePeerConnections.delete(id); },
  createPeer: (...args) => { created.push(args); return null; },
  shouldInitiate: () => false,
  reportClientError: (...args) => reports.push(args),
});
const relayPeer = peer();
state.voicePeerConnections.set("relay-peer", relayPeer);
await relayController.recover("relay-peer", relayPeer, { forceRelay: true });
assert.deepEqual(closed.at(-1), "relay-peer");
assert.deepEqual(created.at(-1)[1], false);
assert.equal(created.at(-1)[2].iceTransportPolicy, "relay");
assert.equal(reports.at(-1)[0], "voice_peer_recovery_recreated");
assert.equal(relayController.getRecoveryCount("relay-peer"), 1);

const delayedPeer = peer();
state.voicePeerConnections.set("delayed", delayedPeer);
controller.schedule("delayed", 123, true);
controller.schedule("delayed", 456, true);
assert.equal(timers.at(-1).delay, 123);
assert.equal(timers.length, 1);
controller.clearParticipant("delayed");
assert.equal(timers.at(-1).cleared, true);
controller.clearAll();
assert.equal(controller.getRecoveryCount("peer"), 0);

console.log(JSON.stringify({ ok: true, checks: 10 }));
