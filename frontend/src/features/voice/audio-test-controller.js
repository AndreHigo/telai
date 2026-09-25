const DEFAULT_STATUS = "Clique em testar para verificar seu microfone.";

function defaultTimers() {
  return {
    setInterval: (...args) => globalThis.setInterval(...args),
    clearInterval: (...args) => globalThis.clearInterval(...args),
    setTimeout: (...args) => globalThis.setTimeout(...args),
  };
}

export function createVoiceAudioTestController({
  captureInputStream,
  stopInputStream,
  getAudioContextConstructor,
  getAudioContext,
  getCurrentAudioContext,
  getSelectedInputDevice,
  getSelectedOutputDevice,
  getOutputVolume,
  getIsDesktop,
  reportClientError,
  onStateChange,
  timers = defaultTimers(),
}) {
  let state = {
    stream: null,
    context: null,
    analyser: null,
    source: null,
    timer: null,
    running: false,
    level: 0,
    peak: 0,
    error: "",
    status: DEFAULT_STATUS,
    speakerStatus: "",
  };

  function emit(next) {
    state = { ...state, ...next };
    onStateChange?.({ ...state });
  }

  function stop({ reset = true } = {}) {
    if (state.timer) timers.clearInterval(state.timer);
    try { state.source?.disconnect(); } catch {}
    try { state.analyser?.disconnect(); } catch {}
    stopInputStream?.(state.stream);
    if (state.context && state.context !== getCurrentAudioContext?.()) {
      const closing = state.context.close?.();
      closing?.catch?.(() => {});
    }
    emit({
      stream: null,
      context: null,
      analyser: null,
      source: null,
      timer: null,
      running: false,
      ...(reset ? { level: 0, peak: 0, status: DEFAULT_STATUS } : {}),
    });
  }

  function poll() {
    const analyser = state.analyser;
    if (!analyser) return;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = Math.sqrt(energy / Math.max(samples.length, 1));
    const level = Math.min(1, Math.max(0, rms * 7));
    const levelPercent = Math.round(level * 100);
    emit({
      level: levelPercent,
      peak: Math.max(state.peak * 0.985, levelPercent),
      status: levelPercent >= 12
        ? "Microfone funcionando — sua voz está sendo capturada."
        : "Fale normalmente para testar o nível do microfone.",
    });
  }

  async function start() {
    stop({ reset: false });
    emit({ error: "", status: "Solicitando acesso ao microfone…" });
    try {
      const stream = await captureInputStream();
      const track = stream?.getAudioTracks?.()[0];
      if (!track) throw new Error("Nenhum microfone foi encontrado.");
      const AudioContextConstructor = getAudioContextConstructor?.();
      if (!AudioContextConstructor) throw new Error("Áudio indisponível neste dispositivo.");
      const context = new AudioContextConstructor();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);
      const timer = timers.setInterval(poll, 100);
      emit({ stream, context, source, analyser, timer, running: true, status: "Fale normalmente para testar o nível do microfone." });
      track.addEventListener?.("ended", () => {
        if (state.stream?.getAudioTracks?.()[0] !== track) return;
        stop();
        emit({ error: "O microfone foi desconectado durante o teste." });
      }, { once: true });
    } catch (error) {
      stop({ reset: false });
      emit({
        error: error?.name === "NotAllowedError"
          ? "Permita o microfone para fazer o teste."
          : "Não foi possível iniciar o teste do microfone.",
        status: "Teste não iniciado.",
      });
      reportClientError?.("voice_test_error", error, {
        isDesktop: getIsDesktop?.(),
        deviceSelected: Boolean(getSelectedInputDevice?.()),
      });
    }
  }

  async function testSpeaker() {
    emit({ speakerStatus: "Reproduzindo som de teste…" });
    try {
      const context = getAudioContext?.();
      if (!context) throw new Error("Saída de áudio indisponível.");
      const selectedOutputDevice = getSelectedOutputDevice?.();
      if (selectedOutputDevice && typeof context.setSinkId === "function") await context.setSinkId(selectedOutputDevice);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.08 * getOutputVolume?.()), now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.38);
      timers.setTimeout(() => emit({ speakerStatus: "Som de teste reproduzido." }), 450);
    } catch (error) {
      emit({ speakerStatus: "Não foi possível reproduzir o som de teste." });
      reportClientError?.("voice_speaker_test_error", error, {
        isDesktop: getIsDesktop?.(),
        deviceSelected: Boolean(getSelectedOutputDevice?.()),
      });
    }
  }

  return {
    getState: () => ({ ...state }),
    poll,
    start,
    stop,
    testSpeaker,
  };
}
