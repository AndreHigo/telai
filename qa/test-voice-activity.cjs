const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

const modulePath = pathToFileURL(path.resolve(__dirname, "../frontend/src/voice-activity.js")).href;

function createFakeClock(startAt = 1_000) {
  let currentTime = startAt;
  let nextTimerId = 1;
  const timers = new Map();
  return {
    now: () => currentTime,
    setTimer(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, dueAt: currentTime + delay });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(milliseconds) {
      const targetTime = currentTime + milliseconds;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= targetTime)
          .sort((a, b) => a[1].dueAt - b[1].dueAt)[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        currentTime = timer.dueAt;
        timer.callback();
      }
      currentTime = targetTime;
    },
  };
}

async function main() {
  const { createVoiceSpeakingPublisher, updateVoiceActivitySpeakingState } = await import(modulePath);

  const detector = { speaking: false, silentSince: 0, lastStateChangeAt: 0 };
  assert.equal(updateVoiceActivitySpeakingState(detector, true, 1_000), true, "fala deve acender sem espera artificial");
  for (let time = 1_016; time <= 3_000; time += 16) {
    assert.equal(updateVoiceActivitySpeakingState(detector, true, time), false, "fala contínua não deve disparar nova transição");
  }
  assert.equal(detector.speaking, true, "fala contínua deve manter a borda ativa");
  assert.equal(detector.silentSince, 0, "áudio ativo deve zerar o cronômetro de silêncio");

  assert.equal(updateVoiceActivitySpeakingState(detector, false, 3_016), false, "silêncio ainda está dentro da cauda de liberação");
  assert.equal(updateVoiceActivitySpeakingState(detector, true, 3_080), false, "uma retomada durante a cauda não deve apagar a borda");
  assert.equal(detector.silentSince, 0, "retomada de áudio deve reiniciar a cauda de silêncio");
  assert.equal(updateVoiceActivitySpeakingState(detector, false, 3_100), false);
  assert.equal(updateVoiceActivitySpeakingState(detector, false, 3_219), false, "não deve desligar antes de completar a cauda");
  assert.equal(updateVoiceActivitySpeakingState(detector, false, 3_220), true, "deve desligar ao terminar a cauda curta");
  assert.equal(detector.speaking, false);

  assert.equal(updateVoiceActivitySpeakingState(detector, true, 3_250), false, "guarda anti-oscilação de 48 ms deve filtrar um estalo imediato");
  assert.equal(updateVoiceActivitySpeakingState(detector, true, 3_268), true, "fala retomada deve acender após a guarda curta");

  const clock = createFakeClock();
  const sent = [];
  const publisher = createVoiceSpeakingPublisher({
    send: (message) => sent.push({ ...message, at: clock.now() }),
    isReady: (participantId) => participantId === "local-user",
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  publisher.publish("local-user", true);
  assert.deepEqual(sent, [{ type: "voice-speaking", speaking: true, at: 1_000 }], "transição deve publicar imediatamente, sem espera fixa de 300 ms");

  for (let index = 1; index < 36; index += 1) publisher.publish("local-user", index % 2 === 0);
  assert.equal(sent.length, 36, "publicador deve ficar abaixo do limite de 40 por janela de 10 s");
  publisher.publish("local-user", true);
  publisher.publish("local-user", false);
  assert.equal(sent.length, 36, "transições acima do orçamento devem ser coalescidas");
  clock.advance(10_049);
  assert.equal(sent.length, 36, "não deve ultrapassar a janela do servidor");
  clock.advance(1);
  assert.equal(sent.length, 37, "estado mais recente deve sair assim que a janela liberar orçamento");
  assert.equal(sent.at(-1).speaking, false, "estado coalescido deve refletir a transição mais recente");
  publisher.reset();

  console.log(JSON.stringify({ ok: true, detector: "fala contínua e cauda de 120 ms", publisher: "imediato com orçamento de 36/10 s" }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});
