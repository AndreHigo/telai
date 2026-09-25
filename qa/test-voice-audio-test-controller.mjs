import assert from "node:assert/strict";
import { createVoiceAudioTestController } from "../frontend/src/features/voice/audio-test-controller.js";

const states = [];
const reports = [];
const stopped = [];
let intervalCallback = null;
let timeoutCallback = null;
let trackEnded = null;

const timers = {
  setInterval(callback) {
    intervalCallback = callback;
    return "interval";
  },
  clearInterval(value) {
    assert.equal(value, "interval");
  },
  setTimeout(callback) {
    timeoutCallback = callback;
    return "timeout";
  },
};

const track = {
  addEventListener(type, callback) {
    assert.equal(type, "ended");
    trackEnded = callback;
  },
};
const stream = { getAudioTracks: () => [track] };

function createContext() {
  const context = {
    currentTime: 0,
    destination: {},
    closed: false,
    sinkId: "",
    async resume() {},
    async close() { this.closed = true; },
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    },
    createAnalyser() {
      return {
        fftSize: 512,
        smoothingTimeConstant: 0,
        connect() {},
        disconnect() {},
        getFloatTimeDomainData(samples) { samples.fill(0.1); },
      };
    },
    createOscillator() {
      return {
        type: "",
        frequency: { setValueAtTime() {} },
        connect(target) { return target; },
        start() {},
        stop() {},
      };
    },
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect(target) { return target; },
      };
    },
    async setSinkId(value) { this.sinkId = value; },
  };
  return context;
}

const inputContext = createContext();
const speakerContext = createContext();
const controller = createVoiceAudioTestController({
  captureInputStream: async () => stream,
  stopInputStream: (value) => stopped.push(value),
  getAudioContextConstructor: () => class { constructor() { return inputContext; } },
  getAudioContext: () => speakerContext,
  getCurrentAudioContext: () => null,
  getSelectedInputDevice: () => "mic-1",
  getSelectedOutputDevice: () => "speaker-1",
  getOutputVolume: () => 0.5,
  getIsDesktop: () => true,
  reportClientError: (...args) => reports.push(args),
  onStateChange: (state) => states.push(state),
  timers,
});

await controller.start();
assert.equal(controller.getState().running, true);
assert.equal(controller.getState().status, "Fale normalmente para testar o nível do microfone.");
assert.equal(typeof intervalCallback, "function");
intervalCallback();
assert.equal(controller.getState().level, 70);
assert.equal(controller.getState().peak, 70);

await controller.testSpeaker();
assert.equal(speakerContext.sinkId, "speaker-1");
assert.equal(typeof timeoutCallback, "function");
timeoutCallback();
assert.equal(controller.getState().speakerStatus, "Som de teste reproduzido.");

trackEnded();
assert.equal(controller.getState().running, false);
assert.equal(controller.getState().error, "O microfone foi desconectado durante o teste.");
assert.equal(stopped.at(-1), stream);
assert.equal(reports.length, 0);

controller.stop();
assert.equal(controller.getState().level, 0);
assert.equal(controller.getState().status, "Clique em testar para verificar seu microfone.");

console.log(JSON.stringify({ ok: true, checks: 12 }));

