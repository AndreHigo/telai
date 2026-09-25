import assert from "node:assert/strict";
import { createBroadcastTrackController } from "../frontend/src/features/broadcast/track-controller.js";

const calls = [];
const video = { kind: "video", id: "video-next" };
const audio = { kind: "audio", id: "audio-next" };
const stream = {
  getVideoTracks: () => [video],
  getAudioTracks: () => [audio],
};

function sender(track, name) {
  return {
    track,
    replaceTrack: async (nextTrack) => calls.push(["replace", name, nextTrack?.id || null]),
  };
}

const peerOne = {
  connectionState: "connected",
  signalingState: "stable",
  senders: [sender({ kind: "video", id: "old-video" }, "video"), sender({ kind: "audio", id: "old-audio" }, "audio"), sender({ kind: "audio", id: "duplicate" }, "duplicate")],
  getSenders() { return this.senders; },
  getTransceivers() { return []; },
  addTrack() { calls.push(["add", "peer-one"]); },
};
const reservedAudioSender = sender(null, "reserved-audio");
const peerTwo = {
  connectionState: "connected",
  signalingState: "stable",
  getSenders: () => [],
  getTransceivers: () => [{ sender: reservedAudioSender, receiver: { track: { kind: "audio" } } }],
  addTrack(track) { calls.push(["add", "peer-two", track.id]); },
};
const peerClosed = {
  connectionState: "closed",
  signalingState: "stable",
  getSenders: () => [],
  getTransceivers: () => [],
  addTrack: () => calls.push(["add", "closed"]),
};
const peers = new Map([["viewer-1", peerOne], ["viewer-2", peerTwo], ["viewer-closed", peerClosed]]);
const negotiated = [];
const controller = createBroadcastTrackController({
  getState: () => ({ mediaMode: "p2p", peerConnections: peers }),
  negotiateBroadcastPeer: async (viewerId) => negotiated.push(viewerId),
});

await controller.replaceBroadcastTracks(stream);
assert.ok(calls.some(([kind, name, id]) => kind === "replace" && name === "video" && id === "video-next"));
assert.ok(calls.some(([kind, name, id]) => kind === "replace" && name === "audio" && id === "audio-next"));
assert.ok(calls.some(([kind, name, id]) => kind === "replace" && name === "duplicate" && id === null));
assert.ok(calls.some(([kind, name, id]) => kind === "replace" && name === "reserved-audio" && id === "audio-next"));
assert.deepEqual(negotiated, ["viewer-1", "viewer-2"]);
assert.ok(calls.some(([kind, name, id]) => kind === "add" && name === "peer-two" && id === "video-next"));
assert.equal(calls.some(([kind, name]) => kind === "add" && name === "closed"), true);

const relayCalls = [];
const relayVideoSender = {
  track: { kind: "video", id: "relay-old-video" },
  replaceTrack: async (track) => relayCalls.push(track.id),
};
const relayAudioSender = {
  track: { kind: "audio", id: "relay-old-audio" },
  replaceTrack: async (track) => relayCalls.push(track.id),
};
const relayPeer = {
  connectionState: "connected",
  signalingState: "stable",
  getSenders: () => [relayVideoSender, relayAudioSender],
  getTransceivers: () => [],
  addTrack: (track) => relayCalls.push(track.id),
};
const relayController = createBroadcastTrackController({
  getState: () => ({ mediaMode: "relay", peerConnections: new Map([["relay-viewer", relayPeer]]) }),
  negotiateBroadcastPeer: async () => { throw new Error("não deveria renegociar relay"); },
});
await relayController.replaceBroadcastTracks(stream);
assert.deepEqual(relayCalls, ["video-next", "audio-next"]);

console.log(JSON.stringify({ ok: true, checks: 10 }));
