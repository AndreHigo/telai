import assert from "node:assert/strict";
import { createBroadcastAudioBridgeController } from "../frontend/src/features/broadcast/audio-bridge-controller.js";

const tracks = [];
const callbacks = [];
const contexts = [];

class FakeAudioContext {
  constructor(options) {
    this.options = options;
    this.closed = false;
    this.resumed = false;
    this.processor = null;
    this.destination = {
      stream: {
        getAudioTracks: () => [{ kind: "audio", id: `track-${contexts.length + 1}` }],
      },
    };
    contexts.push(this);
  }

  createMediaStreamDestination() {
    return this.destination;
  }

  createScriptProcessor(...args) {
    this.processor = {
      args,
      onaudioprocess: null,
      connectedTo: null,
      disconnected: false,
      connect: (destination) => { this.processor.connectedTo = destination; },
      disconnect: () => { this.processor.disconnected = true; },
    };
    return this.processor;
  }

  async resume() {
    this.resumed = true;
  }

  async close() {
    this.closed = true;
  }
}

const desktop = {
  startWindowAudio: async (processId) => {
    tracks.push(["window-start", processId]);
    return { ok: true };
  },
  startSystemAudio: async () => {
    tracks.push(["system-start"]);
    return { ok: true };
  },
  stopWindowAudio: async () => {
    tracks.push(["stop"]);
  },
  onWindowAudioChunk: (callback) => {
    callbacks.push(callback);
    return () => tracks.push(["unsubscribe"]);
  },
};

const controller = createBroadcastAudioBridgeController({
  getAudioContext: () => FakeAudioContext,
  getDesktopBridge: () => desktop,
});

const windowTrack = await controller.startWindowAudio("process-42");
assert.equal(windowTrack.kind, "audio");
assert.deepEqual(tracks.slice(0, 1), [["stop"]]);
assert.deepEqual(tracks.slice(1), [["window-start", "process-42"]]);
assert.equal(contexts[0].options.sampleRate, 48000);
assert.equal(contexts[0].resumed, true);
assert.equal(callbacks.length, 1);

callbacks[0](new Uint8Array([0xe8, 0x03, 0x18, 0xfc]));
const left = new Float32Array(1);
const right = new Float32Array(1);
contexts[0].processor.onaudioprocess({ outputBuffer: { getChannelData: (channel) => channel === 0 ? left : right, numberOfChannels: 2 } });
assert.ok(Math.abs(left[0] - 1000 / 32768) < 0.000001);
assert.ok(Math.abs(right[0] + 1000 / 32768) < 0.000001);

await controller.startSystemAudio();
assert.equal(contexts[0].closed, true);
assert.equal(contexts[0].processor.disconnected, true);
assert.ok(tracks.some(([name]) => name === "unsubscribe"));
assert.ok(tracks.some(([name]) => name === "system-start"));

await controller.stop();
assert.equal(contexts[1].closed, true);
assert.equal(contexts[1].processor.disconnected, true);
assert.equal(tracks.at(-1)?.[0], "stop");

console.log(JSON.stringify({ ok: true, checks: 12 }));
