import assert from "node:assert/strict";
import { createBroadcastAudioMixerController } from "../frontend/src/features/broadcast/audio-mixer-controller.js";

globalThis.MediaStream = class {
  constructor(tracks) {
    this.tracks = tracks;
  }
};

const contexts = [];
const reports = [];
const mixedTrack = { kind: "audio", id: "mixed", stopped: false, stop() { this.stopped = true; } };

class FakeAudioContext {
  constructor(options) {
    this.options = options;
    this.closed = false;
    this.resumed = false;
    this.sources = [];
    this.destination = { stream: { getAudioTracks: () => [mixedTrack], getTracks: () => [mixedTrack] } };
    contexts.push(this);
  }

  async resume() { this.resumed = true; }
  async close() { this.closed = true; }
  createMediaStreamDestination() { return this.destination; }
  createMediaStreamSource(stream) {
    const source = { stream, connected: null, connect: (node) => { source.connected = node; return node; } };
    this.sources.push(source);
    return source;
  }
  createGain() {
    return { gain: { value: 0 }, connected: null, connect(node) { this.connected = node; return node; } };
  }
}

const firstTrack = { kind: "audio", id: "first" };
const secondTrack = { kind: "audio", id: "second" };
const controller = createBroadcastAudioMixerController({
  getAudioContext: () => FakeAudioContext,
  reportClientError: (...args) => reports.push(args),
});

assert.equal(await controller.mix(firstTrack), firstTrack);
assert.equal(contexts.length, 0);

assert.equal(await controller.mix(firstTrack, secondTrack), mixedTrack);
assert.equal(contexts.length, 1);
assert.equal(contexts[0].options.latencyHint, "interactive");
assert.equal(contexts[0].resumed, true);
assert.equal(contexts[0].sources.length, 2);
assert.equal(contexts[0].sources[0].stream.tracks[0], firstTrack);

await controller.stop();
assert.equal(contexts[0].closed, true);
assert.equal(mixedTrack.stopped, true);

const fallbackTrack = { kind: "audio", id: "fallback" };
class FailingAudioContext extends FakeAudioContext {
  createMediaStreamSource() { throw new Error("mix failed"); }
}
const failingController = createBroadcastAudioMixerController({
  getAudioContext: () => FailingAudioContext,
  reportClientError: (...args) => reports.push(args),
});
assert.equal(await failingController.mix(firstTrack, fallbackTrack), firstTrack);
assert.equal(reports.at(-1)[0], "broadcast_audio_mix_fallback");
assert.equal(contexts.at(-1).closed, true);

console.log(JSON.stringify({ ok: true, checks: 10 }));
