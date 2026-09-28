import assert from "node:assert/strict";
import { createVoiceSignalingController, shouldInitiateVoicePeer } from "../frontend/src/features/voice/signaling-controller.js";

assert.equal(shouldInitiateVoicePeer("a", "b"), true);
assert.equal(shouldInitiateVoicePeer("b", "a"), false);
assert.equal(shouldInitiateVoicePeer("same", "same"), false);
assert.equal(shouldInitiateVoicePeer("", "peer"), false);

const sent = [];
const diagnostics = [];
const state = {
  voiceRoomId: "room",
  voiceClientId: "self",
  voiceState: "connected",
  voiceParticipants: new Map([["peer", { id: "peer" }]]),
  voicePeerConnections: new Map(),
  voicePendingCandidates: new Map(),
  voicePendingSignals: new Map(),
  voiceSignalQueues: new Map(),
};

function fakePeer() {
  return {
    connectionState: "connected",
    signalingState: "stable",
    remoteDescription: null,
    localDescription: null,
    receivedCandidates: [],
    async setLocalDescription(description) {
      if (description.type === "rollback") {
        this.signalingState = "stable";
        this.localDescription = null;
      } else {
        this.localDescription = description;
        this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
      }
    },
    async setRemoteDescription(description) {
      this.remoteDescription = description;
      this.signalingState = description.type === "offer" ? "have-remote-offer" : "stable";
    },
    async createAnswer() { return { type: "answer", sdp: "answer-sdp" }; },
    async addIceCandidate(candidate) { this.receivedCandidates.push(candidate); },
  };
}

const controller = createVoiceSignalingController({
  getState: () => state,
  setState: (next) => Object.assign(state, next),
  createPeer: (participantId) => {
    const peer = fakePeer();
    state.voicePeerConnections.set(participantId, peer);
    return peer;
  },
  sendVoice: (message) => sent.push(message),
  reportClientError: (...args) => diagnostics.push(args),
});

await controller.handleSignal({ from: "waiting", payload: { kind: "offer", sdp: { type: "offer" } } });
assert.equal(state.voicePendingSignals.get("waiting").length, 1);

const peer = await controller.handleSignal({ from: "peer", payload: { kind: "candidate", candidate: { candidate: "candidate-1" } } });
assert.equal(peer, undefined);
assert.deepEqual(state.voicePendingCandidates.get("peer"), [{ candidate: "candidate-1" }]);

await controller.handleSignal({ from: "peer", payload: { kind: "offer", sdp: { type: "offer", sdp: "offer-sdp" } } });
assert.equal(sent.at(-1).payload.kind, "answer");
assert.equal(state.voicePeerConnections.get("peer").receivedCandidates.length, 1);
assert.equal(state.voicePendingCandidates.has("peer"), false);

const localPeer = fakePeer();
localPeer.signalingState = "have-local-offer";
localPeer.localDescription = { type: "offer", sdp: "local-offer" };
state.voicePeerConnections.set("peer", localPeer);
await controller.enqueueSignal({ from: "peer", payload: { kind: "answer", sdp: { type: "answer", sdp: "answer-sdp" } } });
assert.equal(localPeer.remoteDescription.type, "answer");

controller.clearParticipant("peer");
assert.equal(state.voiceSignalQueues.has("peer"), false);
assert.equal(diagnostics.length, 0);
console.log(JSON.stringify({ ok: true, checks: 10, sentMessages: sent.length }));
