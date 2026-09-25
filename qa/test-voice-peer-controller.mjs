import assert from "node:assert/strict";
import { createVoicePeerController } from "../frontend/src/features/voice/peer-controller.js";

const signals = [];
const diagnostics = [];
const recoveries = [];
const localTrack = { id: "local", readyState: "live" };
const remoteTrackListeners = {};
const remoteTrack = {
  id: "remote",
  readyState: "live",
  addEventListener: (type, listener) => { remoteTrackListeners[type] = listener; },
};

class FakePeer {
  constructor(config) {
    this.config = config;
    this.connectionState = "new";
    this.iceConnectionState = "new";
    this.signalingState = "stable";
    this.localDescription = null;
    this.tracks = [];
  }

  addTrack(track, stream) { this.tracks.push({ track, stream }); }
  async createOffer() { return { type: "offer", sdp: "fake-offer" }; }
  async setLocalDescription(description) { this.localDescription = description; }
  close() { this.connectionState = "closed"; }
}

globalThis.RTCPeerConnection = FakePeer;

const voicePeerConnections = new Map();
const voicePeerConnectionTimers = new Map();
const voicePeerAudioTrackTimers = new Map();
const voicePeerAudioHealth = new Map();
const voiceRemoteAudio = new Map();
const voiceRemoteStreams = new Map();
const sentState = { voiceError: "" };
const state = {
  voiceLocalStream: { getAudioTracks: () => [localTrack] },
  voiceDeafened: false,
  voiceLocallyMutedParticipants: new Set(),
  voicePeerAudioHealth,
  voicePeerAudioTrackTimers,
  voicePeerConnectionTimers,
  voicePeerConnections,
  voiceRemoteAudio,
  voiceRemoteStreams,
  selectedOutputDeviceId: "",
};

const remoteStream = {
  tracks: [],
  getTracks() { return this.tracks; },
  addTrack(track) { this.tracks.push(track); },
  removeTrack(track) { this.tracks = this.tracks.filter((item) => item !== track); },
  getAudioTracks() { return this.tracks.filter((track) => track.readyState === "live"); },
};
const remoteAudio = { muted: false, volume: 1, srcObject: null };

const controller = createVoicePeerController({
  getState: () => state,
  getRtcConfig: () => ({ iceServers: [{ urls: "stun:fake" }] }),
  setState: (next) => Object.assign(sentState, next),
  ensureVoiceActivityTimer: () => {},
  bindVoiceLocalTrack: () => {},
  sendVoice: (message) => signals.push(message),
  reportClientError: (kind) => diagnostics.push(kind),
  hasTurnServer: () => true,
  recoverPeer: (participantId, peer, options) => { recoveries.push({ participantId, peer, options }); },
  closePeer: () => {},
  schedulePeerRecovery: () => {},
  clearPeerRecovery: () => {},
  ensureRemoteStream: () => { voiceRemoteStreams.set("participant-1", remoteStream); return remoteStream; },
  ensureRemoteAudio: () => { voiceRemoteAudio.set("participant-1", remoteAudio); return remoteAudio; },
  ensurePeerHealthTimer: () => {},
  attachVoiceActivityDetector: () => {},
  playRemoteAudio: async () => {},
  clearRecoveredVoiceError: () => {},
  voicePreferenceTargetId: (participantId) => participantId,
  effectiveVoiceOutputVolume: () => 0.75,
  scheduleVoiceRemotePlayback: () => {},
  connectionTimeoutMs: 8_000,
  audioTrackTimeoutMs: 6_000,
});

const peer = controller.createPeer("participant-1", true);
assert.equal(peer.config.iceCandidatePoolSize, 2);
assert.equal(peer.tracks[0].track, localTrack);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(signals[0].payload.kind, "offer");

peer.onicecandidate({ candidate: { candidate: "candidate" } });
assert.equal(signals[1].payload.kind, "candidate");

peer.connectionState = "connected";
peer.onconnectionstatechange();
peer.ontrack({ receiver: {}, track: remoteTrack });
assert.equal(remoteAudio.srcObject, remoteStream);
assert.equal(remoteAudio.volume, 0.75);
assert.equal(remoteStream.getTracks().length, 1);

peer.iceConnectionState = "failed";
peer.oniceconnectionstatechange();
assert.equal(recoveries.length, 1);
assert.equal(recoveries[0].options.forceRelay, true);
assert.equal(diagnostics.includes("voice_ice_failed"), true);
assert.equal(sentState.voiceError.includes("TURN"), true);

console.log(JSON.stringify({ ok: true, checks: 11 }));
