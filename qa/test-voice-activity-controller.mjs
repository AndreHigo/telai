import assert from "node:assert/strict";
import { createVoiceActivityController } from "../frontend/src/features/voice/activity-controller.js";

function createTrack() {
  const listeners = new Map();
  return {
    readyState: "live",
    enabled: true,
    getSettings: () => ({ sampleRate: 48000, channelCount: 1 }),
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    end() {
      this.readyState = "ended";
      listeners.get("ended")?.();
    },
  };
}

function createAudioContext() {
  const destination = {};
  const context = {
    state: "running",
    sampleRate: 48000,
    destination,
    createMediaStreamSource() {
      return { connect(node) { this.node = node; return node; }, disconnect() {} };
    },
    createAnalyser() {
      return {
        fftSize: 128,
        smoothingTimeConstant: 1,
        getFloatTimeDomainData(samples) { samples.fill(0); },
        connect(node) { this.node = node; return node; },
        disconnect() {},
      };
    },
    createGain() {
      return {
        gain: { value: 1 },
        connect(node) { this.node = node; return node; },
        disconnect() {},
      };
    },
  };
  return context;
}

async function main() {
  const previousWindow = globalThis.window;
  const timers = new Set();
  globalThis.window = {
    setInterval(callback) {
      const timer = { callback };
      timers.add(timer);
      return timer;
    },
    clearInterval(timer) { timers.delete(timer); },
  };

  try {
    const track = createTrack();
    const stream = { getAudioTracks: () => [track] };
    const context = createAudioContext();
    const sent = [];
    const speaking = [];
    const ended = [];
    const state = {
      voiceClientId: "local-user",
      voiceSocketReady: true,
      sendVoice: (message) => sent.push(message),
      voiceSpeakingSignalKnownParticipantIds: new Set(),
      isDesktop: false,
      voiceInputProfile: "automatic",
      voiceSensitivityAuto: true,
      voiceSensitivity: 0.5,
      voicePeerConnections: new Map(),
    };
    const controller = createVoiceActivityController({
      getState: () => state,
      getAudioContext: () => context,
      reportClientError: () => {},
      onSpeakingStateChange: (participantId, active) => speaking.push([participantId, active]),
      onRtcSpeakingStateChange: (participantId, active) => speaking.push([participantId, active, "rtc"]),
      onTrackEnded: (participantId) => ended.push(participantId),
    });

    await controller.attachStream("local-user", stream);
    assert.ok(controller.getAnalyzer("local-user"), "o controlador deve registrar o analisador da faixa");
    assert.equal(timers.size, 1, "o controlador deve manter um único timer de atividade");

    controller.publishSpeaking("local-user", true);
    assert.deepEqual(sent, [{ type: "voice-speaking", speaking: true }], "o publisher deve usar o transporte do estado");

    track.end();
    assert.equal(controller.getAnalyzer("local-user"), undefined, "faixa encerrada deve liberar o analisador");
    assert.deepEqual(ended, ["local-user"], "faixa encerrada deve emitir diagnóstico uma vez");
    assert.deepEqual(speaking.at(-1), ["local-user", false], "limpeza da faixa deve desligar a borda");

    state.voicePeerConnections.set("remote-user", {
      connectionState: "connected",
      getStats: async () => new Map([[
        "audio-1",
        { id: "audio-1", type: "inbound-rtp", kind: "audio", audioLevel: 0.2 },
      ]]),
    });
    await controller.pollRtcActivity();
    assert.deepEqual(speaking.at(-1), ["remote-user", true, "rtc"], "RTC deve permanecer separado do detector local");

    controller.reset();
    assert.equal(timers.size, 0, "reset deve encerrar o timer do controlador");
    console.log(JSON.stringify({ ok: true, checks: 8 }));
  } finally {
    globalThis.window = previousWindow;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
