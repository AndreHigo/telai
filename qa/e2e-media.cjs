const { app, BrowserWindow, desktopCapturer, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, `.tmp-media-harness-${process.pid}.sqlite`);
process.env.MIRANTE_DB_PATH = databasePath;
process.env.REQUIRE_LOGIN = "true";
app.commandLine.appendSwitch("use-fake-device-for-media-stream");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(label, check, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`${label} não ficou pronto${lastError ? `: ${lastError.message}` : "."}`);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} retornou ${response.status}: ${body.error || "erro"}`);
  return { body, response };
}

async function evaluate(window, expression) {
  if (window.isDestroyed()) throw new Error("janela de teste foi encerrada");
  return window.webContents.executeJavaScript(`(${expression})()`, true);
}

async function clickText(window, text) {
  const label = JSON.stringify(text);
  const found = await evaluate(window, `() => {
    const label = ${label};
    const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent.trim() === label);
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }`);
  if (!found) {
    const diagnostics = await evaluate(window, () => ({
      body: document.body.innerText.slice(0, 500),
      accountMenuButton: Boolean(document.querySelector("[aria-label='Abrir menu da conta']")),
      accountMenu: Boolean(document.querySelector(".account-menu")),
      buttons: [...document.querySelectorAll("button")].map((button) => button.textContent.trim()).filter(Boolean).slice(0, 30),
    }));
    throw new Error(`botão não encontrado ou desabilitado: ${text}; diagnóstico=${JSON.stringify(diagnostics)}`);
  }
}

async function clickAccountSettings(window) {
  const clicked = await evaluate(window, () => {
    const button = [...document.querySelectorAll(".account-menu-item")]
      .find((candidate) => candidate.textContent.includes("Configurações"));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  });
  if (!clicked) throw new Error("atalho de configurações não encontrado ou desabilitado");
}

async function clickSettingsCategory(window, label) {
  const labelLiteral = JSON.stringify(label);
  const clicked = await evaluate(window, `() => {
    const label = ${labelLiteral};
    const button = [...document.querySelectorAll(".settings-category-nav button")]
      .find((candidate) => candidate.querySelector("strong")?.textContent.trim() === label);
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }`);
  if (!clicked) throw new Error(`categoria de configurações não encontrada ou desabilitada: ${label}`);
}

async function clickFirstDisplaySource(window) {
  await waitFor("seletor de fonte de captura", () => evaluate(window, () => Boolean(document.querySelector(".display-source-card"))));
  const clicked = await evaluate(window, () => {
    const button = document.querySelector(".display-source-card");
    if (!button) return false;
    button.click();
    return true;
  });
  if (!clicked) throw new Error("nenhuma fonte de captura disponível");
}

async function clickDisplayFilter(window, label) {
  const target = JSON.stringify(label);
  const clicked = await evaluate(window, `() => {
    const label = ${target};
    const button = [...document.querySelectorAll(".display-picker-guide-item")]
      .find((candidate) => candidate.querySelector("strong")?.textContent.trim() === label);
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }`);
  if (!clicked) throw new Error(`filtro não encontrado ou desabilitado: ${label}`);
}

async function installSyntheticMedia(window) {
  await evaluate(window, () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    let frame = 0;
    const draw = () => {
      frame += 1;
      context.fillStyle = frame % 2 ? "#253b80" : "#542b66";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.font = "bold 32px sans-serif";
      context.fillText("Mirante QA", 24, 52);
      requestAnimationFrame(draw);
    };
    draw();
    if (typeof canvas.captureStream !== "function") throw new Error("canvas.captureStream não está disponível");
    const videoTemplate = canvas.captureStream(15).getVideoTracks()[0];
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    // Use uma onda harmônica modulada para representar fala sintética sem
    // depender de um microfone físico no teste.
    const oscillator = audioContext.createOscillator();
    const harmonic = audioContext.createOscillator();
    const voiceGain = audioContext.createGain();
    const voiceModulator = audioContext.createOscillator();
    const voiceModulatorGain = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = 180;
    harmonic.type = "triangle";
    harmonic.frequency.value = 360;
    voiceGain.gain.value = 0.18;
    voiceModulator.frequency.value = 4.5;
    voiceModulatorGain.gain.value = 0.08;
    voiceModulator.connect(voiceModulatorGain).connect(voiceGain.gain);
    oscillator.connect(voiceGain);
    harmonic.connect(voiceGain);
    voiceGain.connect(destination);
    oscillator.start();
    harmonic.start();
    voiceModulator.start();
    const audioTemplate = destination.stream.getAudioTracks()[0];
    const appliedConstraints = [];
    const actualAudioDeviceIds = [];
    const makeStream = (constraints = {}) => {
      const wantsVideo = constraints?.video !== false;
      const wantsAudio = constraints?.audio !== false && constraints?.audio != null;
      const stream = new MediaStream([
        ...(wantsVideo ? [videoTemplate.clone()] : []),
        ...(wantsAudio ? [audioTemplate.clone()] : []),
      ]);
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      const requestedAudioDeviceId = constraints?.audio?.deviceId?.exact;
      const actualAudioDeviceId = typeof requestedAudioDeviceId === "string" && requestedAudioDeviceId ? requestedAudioDeviceId : "qa-microphone";
      if (audioTrack) {
        const originalGetSettings = audioTrack.getSettings?.bind(audioTrack);
        audioTrack.getSettings = () => ({ ...(originalGetSettings ? originalGetSettings() : {}), deviceId: actualAudioDeviceId });
      }
      if (audioTrack) actualAudioDeviceIds.push(actualAudioDeviceId);
      if (videoTrack?.applyConstraints) {
        const applyConstraints = videoTrack.applyConstraints.bind(videoTrack);
        videoTrack.applyConstraints = async (constraints) => {
          appliedConstraints.push(constraints);
          return applyConstraints(constraints);
        };
      }
      return stream;
    };
    const calls = [];
    const devices = {
      getUserMedia: async (constraints) => {
        const type = constraints?.video?.mandatory?.chromeMediaSource === "desktop"
          ? "display"
          : constraints?.video === false ? "microphone" : "camera";
        calls.push({ type, constraints });
        return makeStream(constraints);
      },
      getDisplayMedia: async (constraints) => {
        calls.push({ type: "display", constraints });
        window.miranteDesktop.emitDisplayMediaSources?.([{ id: "qa-source", name: "QA screen", kind: "screen", thumbnail: "", processId: null }]);
        await window.miranteDesktop.waitForDisplaySourceSelection?.();
        return makeStream(constraints);
      },
      enumerateDevices: async () => [
        { deviceId: "qa-camera", kind: "videoinput", label: "QA camera", groupId: "qa" },
        { deviceId: "qa-microphone", kind: "audioinput", label: "QA microphone", groupId: "qa" },
        { deviceId: "qa-speaker", kind: "audiooutput", label: "QA speaker", groupId: "qa" },
      ],
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: devices });
    window.__miranteQaMedia = { calls, appliedConstraints, actualAudioDeviceIds, makeStream };
  });
}

async function captureRealCameraProbe(window) {
  return evaluate(window, async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    const result = {
      videoLive: videoTrack?.readyState === "live",
      audioLive: audioTrack?.readyState === "live",
      videoSettings: videoTrack?.getSettings() || {},
    };
    stream.getTracks().forEach((track) => track.stop());
    return result;
  });
}

async function captureRealDisplayProbe(window, kind, preferredWindowName = "") {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 160, height: 90 },
  });
  const selectedSource = sources.find((source) => kind === "window"
    ? source.id.startsWith("window:") && (!preferredWindowName || source.name === preferredWindowName)
    : source.id.startsWith("screen:"));
  if (!selectedSource) throw new Error(`nenhuma fonte ${kind} foi retornada pelo Electron; fontes: ${sources.map((source) => `${source.id}:${source.name}`).join(" | ") || "nenhuma"}`);
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback({ video: selectedSource });
  });
  try {
    const result = await evaluate(window, async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      const videoTrack = stream.getVideoTracks()[0];
      const result = {
        videoLive: videoTrack?.readyState === "live",
        settings: videoTrack?.getSettings() || {},
        label: videoTrack?.label || "",
      };
      stream.getTracks().forEach((track) => track.stop());
      return result;
    });
    return { ...result, requestedSourceId: selectedSource.id, requestedSourceName: selectedSource.name };
  } finally {
    session.defaultSession.setDisplayMediaRequestHandler(null);
  }
}

async function captureRealLegacyDisplayProbe(window) {
  const sources = await desktopCapturer.getSources({ types: ["screen"] });
  const selectedSource = sources.find((source) => source.id.startsWith("screen:"));
  if (!selectedSource) throw new Error("nenhuma tela disponível para captura legada");
  const sourceId = JSON.stringify(selectedSource.id);
  const result = await evaluate(window, `async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: ${sourceId}, minWidth: 1280, maxWidth: 1280, minHeight: 720, maxHeight: 720, maxFrameRate: 30 } },
    });
    const track = stream.getVideoTracks()[0];
    const value = { videoLive: track?.readyState === "live", settings: track?.getSettings() || {}, label: track?.label || "" };
    stream.getTracks().forEach((item) => item.stop());
    return value;
  }`);
  return { ...result, requestedSourceId: selectedSource.id, requestedSourceName: selectedSource.name };
}

async function main() {
  const { closeDatabaseForTests, startServer } = await import(pathToFileURL(path.join(rootDir, "server.mjs")).href);
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const username = `qa_media_${process.pid}`;
  const password = `qa-media-${process.pid}-pass`;
  let hostWindow;
  let viewerWindow;
  let multistreamWindow;
  let captureProbeWindow;
  let captureTargetWindow;
  try {
    await jsonRequest(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, displayName: "QA Media", password, termsAccepted: true, privacyAccepted: true }),
    });
    const { response: loginResponse } = await jsonRequest(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
    if (!cookie?.startsWith("mirante_session=")) throw new Error("login não retornou sessão");
    await session.defaultSession.cookies.set({
      url: baseUrl,
      name: "mirante_session",
      value: cookie.slice("mirante_session=".length),
      httpOnly: true,
      sameSite: "lax",
    });

    captureProbeWindow = new BrowserWindow({
      show: false,
      width: 640,
      height: 360,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    await captureProbeWindow.loadURL(`${baseUrl}/svelte/`);
    captureTargetWindow = new BrowserWindow({ show: true, width: 640, height: 360, title: "Mirante QA Capture Target" });
    await captureTargetWindow.loadURL("data:text/html,<title>Mirante%20QA%20Capture%20Target</title><body style='margin:0;background:%23253b80;color:white;font:32px sans-serif'>Mirante QA Capture Target</body>");
    const realCamera = await captureRealCameraProbe(captureProbeWindow);
    const realScreen = await captureRealDisplayProbe(captureProbeWindow, "screen");
    const realWindow = await captureRealDisplayProbe(captureProbeWindow, "window", "Mirante QA Capture Target");
    const realLegacyScreen = await captureRealLegacyDisplayProbe(captureProbeWindow);
    if (realScreen.settings.displaySurface !== "monitor") throw new Error(`captura de tela retornou displaySurface=${realScreen.settings.displaySurface || "desconhecido"}`);
    if (realWindow.settings.displaySurface !== "window") throw new Error(`captura de janela retornou displaySurface=${realWindow.settings.displaySurface || "desconhecido"}; fonte solicitada=${realWindow.requestedSourceId}`);
    for (const [label, capture] of [["tela", realScreen], ["janela", realWindow]]) {
      if (capture.settings.width > 1280 || capture.settings.height > 720 || capture.settings.frameRate > 30) {
        throw new Error(`captura de ${label} excedeu o teto seguro: ${JSON.stringify(capture.settings)}`);
      }
    }
    if (!realLegacyScreen.videoLive) throw new Error("captura legada de tela não retornou uma faixa de vídeo ativa");

    hostWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { preload: path.join(__dirname, "media-preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    await hostWindow.loadURL(`${baseUrl}/`);
    await waitFor("sessão do host", () => evaluate(hostWindow, () => document.body.innerText.includes("QA Media")));
    await installSyntheticMedia(hostWindow);

    await evaluate(hostWindow, () => document.querySelector("[aria-label='Abrir menu da conta']")?.click());
    await clickAccountSettings(hostWindow);
    await clickSettingsCategory(hostWindow, "Áudio e voz");
    await waitFor("configurações de áudio", () => evaluate(hostWindow, () => Boolean(document.querySelector(".settings-page .voice-settings-card"))));
    const voiceSettingsCleanup = await evaluate(hostWindow, () => ({
      microphoneSearch: [...document.querySelectorAll(".voice-settings-card input")].some((input) => input.type === "search"),
      desktopPermissionNotice: document.body.innerText.includes("Permitir que os aplicativos da área de trabalho acessem seu microfone"),
    }));
    if (voiceSettingsCleanup.microphoneSearch || voiceSettingsCleanup.desktopPermissionNotice) {
      throw new Error(`a tela de áudio ainda exibe controles removidos: ${JSON.stringify(voiceSettingsCleanup)}`);
    }
    await clickText(hostWindow, "Atualizar dispositivos");
    await waitFor("dispositivos de áudio de teste", () => evaluate(hostWindow, () => [...document.querySelectorAll(".voice-settings-card select")].every((select) => [...select.options].some((option) => option.value === "qa-microphone" || option.value === "qa-speaker"))));
    // MediaDeviceInfo real usa getters não enumeráveis; simule isso para
    // garantir que o mapeamento preserve os IDs (o spread (...device) os perde).
    await evaluate(hostWindow, () => {
      const mediaDevice = (deviceId, kind, label, groupId = "qa") => {
        const device = {};
        Object.defineProperties(device, {
          deviceId: { value: deviceId, enumerable: false },
          kind: { value: kind, enumerable: false },
          label: { value: label, enumerable: false },
          groupId: { value: groupId, enumerable: false },
        });
        return device;
      };
      navigator.mediaDevices.enumerateDevices = async () => [
        mediaDevice("qa-microphone", "audioinput", "QA microphone"),
        mediaDevice("qa-speaker", "audiooutput", "QA speaker"),
      ];
    });
    await clickText(hostWindow, "Atualizar dispositivos");
    await waitFor("IDs preservados de MediaDeviceInfo", () => evaluate(hostWindow, () => {
      const selects = [...document.querySelectorAll(".voice-settings-card select")];
      return selects.some((select) => [...select.options].some((option) => option.value === "qa-microphone"))
        && selects.some((select) => [...select.options].some((option) => option.value === "qa-speaker"));
    }));
    const selectedDevices = await evaluate(hostWindow, () => {
      const selects = [...document.querySelectorAll(".voice-settings-card select")];
      const input = selects.find((select) => [...select.options].some((option) => option.value === "qa-microphone"));
      const output = selects.find((select) => [...select.options].some((option) => option.value === "qa-speaker"));
      if (!input || !output) return false;
      input.value = "qa-microphone";
      input.dispatchEvent(new Event("change", { bubbles: true }));
      output.value = "qa-speaker";
      output.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
    if (!selectedDevices) throw new Error("seletores de microfone e saída não ficaram disponíveis");
    await waitFor("persistência dos dispositivos selecionados", () => evaluate(hostWindow, () => localStorage.getItem("mirante-voice-input") === "qa-microphone" && localStorage.getItem("mirante-voice-output") === "qa-speaker"));
    await evaluate(hostWindow, () => {
      navigator.mediaDevices.enumerateDevices = async () => [
        { deviceId: "qa-camera", kind: "videoinput", label: "QA camera" },
        { deviceId: "qa-microphone-v2", kind: "audioinput", label: "QA microphone" },
        { deviceId: "qa-speaker", kind: "audiooutput", label: "QA speaker" },
      ];
    });
    await clickText(hostWindow, "Voltar");
    await waitFor("retorno ao painel principal", () => evaluate(hostWindow, () => !document.querySelector(".settings-page")));
    await evaluate(hostWindow, () => document.querySelector("[aria-label='Abrir menu da conta']")?.click());
    await clickAccountSettings(hostWindow);
    await clickSettingsCategory(hostWindow, "Áudio e voz");
    await waitFor("reabertura das configurações de áudio", () => evaluate(hostWindow, () => Boolean(document.querySelector(".settings-page .voice-settings-card"))));
    await waitFor("botão de atualização de dispositivos", () => evaluate(hostWindow, () => {
      const button = [...document.querySelectorAll(".voice-settings-card button")].find((candidate) => candidate.textContent.trim() === "Atualizar dispositivos");
      return Boolean(button && !button.disabled);
    }));
    await clickText(hostWindow, "Atualizar dispositivos");
    await waitFor("remapeamento do microfone salvo", () => evaluate(hostWindow, () => localStorage.getItem("mirante-voice-input") === "qa-microphone-v2"));
    const remappedInput = await evaluate(hostWindow, () => ({
      value: document.querySelector(".voice-settings-card select")?.value,
      label: localStorage.getItem("mirante-voice-input-label"),
    }));
    if (remappedInput.value !== "qa-microphone-v2" || remappedInput.label !== "QA microphone") {
      throw new Error(`o microfone salvo não foi remapeado pelo rótulo: ${JSON.stringify(remappedInput)}`);
    }
    await waitFor("captura de permissão do microfone remapeado", () => evaluate(hostWindow, () => window.__miranteQaMedia.calls.some((call) => call.constraints?.audio?.deviceId?.exact === "qa-microphone-v2")));
    const restrictedDeviceListInstalled = await evaluate(hostWindow, () => {
      navigator.mediaDevices.enumerateDevices = async () => [
        { deviceId: "qa-camera", kind: "videoinput", label: "QA camera" },
        { deviceId: "default-input", kind: "audioinput", label: "" },
        { deviceId: "default-output", kind: "audiooutput", label: "" },
      ];
      return true;
    });
    if (!restrictedDeviceListInstalled) throw new Error("não foi possível simular a lista restrita de dispositivos");
    await clickText(hostWindow, "Voltar");
    await waitFor("retorno ao painel principal", () => evaluate(hostWindow, () => !document.querySelector(".settings-page")));
    await evaluate(hostWindow, () => document.querySelector("[aria-label='Abrir menu da conta']")?.click());
    await clickAccountSettings(hostWindow);
    await clickSettingsCategory(hostWindow, "Áudio e voz");
    await waitFor("reabertura das configurações de áudio", () => evaluate(hostWindow, () => Boolean(document.querySelector(".settings-page .voice-settings-card"))));
    const persistedDevices = await evaluate(hostWindow, () => ({
      input: localStorage.getItem("mirante-voice-input"),
      output: localStorage.getItem("mirante-voice-output"),
    }));
    if (persistedDevices.input !== null || persistedDevices.output !== "qa-speaker") {
      throw new Error(`o dispositivo de entrada indisponível não foi limpo com segurança: ${JSON.stringify(persistedDevices)}`);
    }
    await clickText(hostWindow, "Testar microfone");
    await waitFor("teste com microfone selecionado", () => evaluate(hostWindow, () => document.querySelector(".voice-test-state")?.classList.contains("active")));
    const fallbackInputApplied = await evaluate(hostWindow, () => {
      const call = [...window.__miranteQaMedia.calls].reverse().find((item) => item.type === "microphone");
      return Boolean(call && !call.constraints?.audio?.deviceId?.exact);
    });
    if (!fallbackInputApplied) throw new Error("o teste não caiu no microfone padrão após remover o dispositivo salvo");
    await clickText(hostWindow, "Parar teste");

    const selectVoiceProfile = async (profile) => {
      const profileLiteral = JSON.stringify(profile);
      const selected = await evaluate(hostWindow, `() => {
        const value = ${profileLiteral};
        const radio = document.querySelector('.voice-profile-option input[value="' + value + '"]');
        if (!radio) return false;
        radio.click();
        return true;
      }`);
      if (!selected) throw new Error(`perfil de voz não encontrado: ${profile}`);
      await waitFor(`perfil de voz ${profile}`, () => evaluate(hostWindow, `() => localStorage.getItem("mirante-voice-profile") === ${profileLiteral}`));
      await clickText(hostWindow, "Testar microfone");
      await waitFor(`teste do microfone no perfil ${profile}`, () => evaluate(hostWindow, () => document.querySelector(".voice-test-state")?.classList.contains("active")));
      await sleep(1_000);
      const processedAudioLevel = await evaluate(hostWindow, () => ({
        activeSegments: document.querySelectorAll(".voice-test-meter span.active").length,
        status: document.querySelector(".voice-test-actions small")?.textContent?.trim() || "",
        noiseStatus: document.querySelector(".voice-noise-status")?.dataset.status || "missing",
      }));
      if (processedAudioLevel.activeSegments === 0 && !processedAudioLevel.status.includes("Microfone funcionando")) {
        throw new Error(`o perfil ${profile} não entregou sinal processado: ${JSON.stringify(processedAudioLevel)}`);
      }
      const profileResult = await evaluate(hostWindow, () => ({
        audioConstraints: window.__miranteQaMedia.calls.at(-1)?.constraints?.audio || null,
        noiseStatus: document.querySelector(".voice-noise-status")?.dataset.status || "missing",
        desktopRuntime: Boolean(window.miranteDesktop?.isDesktop),
      }));
      await clickText(hostWindow, "Parar teste");
      return profileResult;
    };
    const studioConstraints = await selectVoiceProfile("studio");
    if (studioConstraints.audioConstraints?.echoCancellation || studioConstraints.audioConstraints?.noiseSuppression || studioConstraints.audioConstraints?.autoGainControl) {
      throw new Error(`perfil Estúdio ainda enviou processamento nativo: ${JSON.stringify(studioConstraints.audioConstraints)}`);
    }
    const isolationConstraints = await selectVoiceProfile("isolation");
    if (!isolationConstraints.audioConstraints?.echoCancellation || !isolationConstraints.audioConstraints?.noiseSuppression || !isolationConstraints.audioConstraints?.autoGainControl) {
      throw new Error(`perfil Isolamento não enviou os filtros nativos: ${JSON.stringify(isolationConstraints.audioConstraints)}`);
    }
    const validIsolationNoiseStatuses = ["native"];
    if (!validIsolationNoiseStatuses.includes(isolationConstraints.noiseStatus)) {
      throw new Error(`o processamento do perfil Isolamento não foi confirmado: ${JSON.stringify(isolationConstraints)}`);
    }
    await clickText(hostWindow, "Voltar");
    await waitFor("retorno ao painel principal", () => evaluate(hostWindow, () => !document.querySelector(".settings-page")));
    await clickText(hostWindow, "Transmitir");
    await waitFor("assistente de transmissão pública", () => evaluate(hostWindow, () => Boolean(document.querySelector(".public-broadcast-setup"))));
    await clickText(hostWindow, "Escolher fonte");
    await waitFor("painel de transmissão", () => evaluate(hostWindow, () => Boolean(document.querySelector(".broadcast-camera-select"))));

    const combinedDevicesSelected = await evaluate(hostWindow, () => {
      const camera = document.querySelector(".broadcast-camera-select");
      if (!camera || ![...camera.options].some((option) => option.value === "qa-camera")) return false;
      camera.value = "qa-camera";
      camera.dispatchEvent(new Event("change", { bubbles: true }));
      return camera.value === "qa-camera";
    });
    if (!combinedDevicesSelected) throw new Error("o seletor de câmera da transmissão não ficou disponível");
    const combinedAudioSelected = await evaluate(hostWindow, () => {
      const audio = [...document.querySelectorAll(".broadcast-select")]
        .find((select) => [...select.options].some((option) => option.value === "system"));
      if (!audio) return false;
      audio.value = "system";
      audio.dispatchEvent(new Event("change", { bubbles: true }));
      return audio.value === "system";
    });
    if (!combinedAudioSelected) throw new Error("o seletor de áudio da fonte não ficou disponível");

    await clickText(hostWindow, "Escolher tela ou janela");

    await waitFor("filtros da fonte de captura", () => evaluate(hostWindow, () => [...document.querySelectorAll(".display-picker-guide-item")].some((button) => button.querySelector("strong")?.textContent.trim() === "Monitor inteiro")));
    await clickDisplayFilter(hostWindow, "Monitor inteiro");
    await waitFor("filtro de monitores inteiros", () => evaluate(hostWindow, () => {
      const sections = [...document.querySelectorAll(".display-source-section")];
      return sections.length === 1 && sections[0].getAttribute("aria-labelledby") === "display-source-screen";
    }));
    await clickDisplayFilter(hostWindow, "Todas as fontes");
    await waitFor("filtro de todas as fontes", () => evaluate(hostWindow, () => document.querySelectorAll(".display-source-section").length >= 1));
    await clickFirstDisplaySource(hostWindow);
    await waitFor("revisão da transmissão pública", () => evaluate(hostWindow, () => Boolean(document.querySelector(".public-broadcast-review"))));
    await clickText(hostWindow, "Iniciar transmissão");
    await waitFor("live de tela/janela", () => evaluate(hostWindow, () => document.body.innerText.includes("Encerrar transmissão")));
    const screenInvite = await evaluate(hostWindow, () => document.querySelector("input[readonly]")?.value || "");
    if (!screenInvite) throw new Error("a live de tela não gerou link público para o teste de troca de mídia");
    viewerWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "qa-screen-viewer" },
    });
    await viewerWindow.loadURL(screenInvite);
    await waitFor("vídeo da live de tela no espectador", () => evaluate(viewerWindow, () => {
      const video = document.querySelector("video");
      return video && video.readyState >= 2 && video.srcObject?.getVideoTracks?.().some((track) => track.readyState === "live");
    }));
    const liveBroadcastControls = await evaluate(hostWindow, () => ({
      cameraDisabled: Boolean(document.querySelector(".broadcast-camera-select")?.disabled),
      microphoneDisabled: Boolean(document.querySelector(".broadcast-microphone-select")?.disabled),
      microphoneToggleDisabled: Boolean(document.querySelector(".broadcast-microphone-enabled")?.disabled),
      audioDisabled: Boolean([...document.querySelectorAll(".broadcast-select")].find((select) => [...select.options].some((option) => option.value === "system"))?.disabled),
    }));
    if (liveBroadcastControls.cameraDisabled || liveBroadcastControls.microphoneToggleDisabled || liveBroadcastControls.audioDisabled) {
      throw new Error(`os controles de mídia ficaram bloqueados durante a live: ${JSON.stringify(liveBroadcastControls)}`);
    }
    const cameraPositionSelected = await evaluate(hostWindow, () => {
      const position = document.querySelector(".broadcast-camera-position-select");
      if (!position || position.disabled || ![...position.options].some((option) => option.value === "top-left")) return false;
      position.value = "top-left";
      position.dispatchEvent(new Event("change", { bubbles: true }));
      return position.value === "top-left";
    });
    if (!cameraPositionSelected) throw new Error("o seletor de posição da câmera não ficou disponível durante a live");
    await waitFor("aplicação da posição da câmera", () => evaluate(hostWindow, () => document.querySelector(".broadcast-camera-position-select")?.value === "top-left"));
    const cameraToggleAvailable = await evaluate(hostWindow, () => {
      const toggle = document.querySelector(".broadcast-camera-enabled");
      if (!toggle || toggle.disabled || toggle.checked) return false;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
    if (!cameraToggleAvailable) throw new Error("o botão para incluir a câmera não ficou disponível durante a live");
    await waitFor("inclusão da câmera durante a live", () => evaluate(hostWindow, () => ({
      enabled: document.querySelector(".broadcast-camera-enabled")?.checked,
      cameraCalls: window.__miranteQaMedia.calls.filter((call) => call.type === "camera").length,
    })).then((result) => result.enabled && result.cameraCalls === 1 ? result : false));
    const displayCallsBeforeLiveAudioEdit = await evaluate(hostWindow, () => window.__miranteQaMedia.calls.filter((call) => call.type === "display").length);
    await evaluate(hostWindow, () => {
      const audio = [...document.querySelectorAll(".broadcast-select")]
        .find((select) => [...select.options].some((option) => option.value === "system"));
      audio.value = "none";
      audio.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor("desativação do áudio durante a live", () => evaluate(hostWindow, () => ({
      value: [...document.querySelectorAll(".broadcast-select")].find((select) => [...select.options].some((option) => option.value === "system"))?.value,
      displayCalls: window.__miranteQaMedia.calls.filter((call) => call.type === "display").length,
    })).then((result) => result.value === "none" && result.displayCalls === displayCallsBeforeLiveAudioEdit ? result : false));
    await evaluate(hostWindow, () => {
      const audio = [...document.querySelectorAll(".broadcast-select")]
        .find((select) => [...select.options].some((option) => option.value === "system"));
      audio.value = "system";
      audio.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor("reativação do áudio durante a live", () => evaluate(hostWindow, () => ({
      value: [...document.querySelectorAll(".broadcast-select")].find((select) => [...select.options].some((option) => option.value === "system"))?.value,
      displayCalls: window.__miranteQaMedia.calls.filter((call) => call.type === "display").length,
    })).then((result) => result.value === "system" && result.displayCalls === displayCallsBeforeLiveAudioEdit ? result : false));
    await waitFor("controles de mídia prontos após trocar o áudio", () => evaluate(hostWindow, () => {
      const microphoneToggle = document.querySelector(".broadcast-microphone-enabled");
      const audio = [...document.querySelectorAll(".broadcast-select")]
        .find((select) => [...select.options].some((option) => option.value === "system"));
      return microphoneToggle && audio && !microphoneToggle.disabled && !audio.disabled;
    }));
    await evaluate(hostWindow, () => {
      const toggle = document.querySelector(".broadcast-microphone-enabled");
      if (!toggle?.checked) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await waitFor("ativação do microfone para o teste", () => evaluate(hostWindow, () => document.querySelector(".broadcast-microphone-enabled")?.checked));
    const microphoneCallsBeforeLiveEdit = await evaluate(hostWindow, () => window.__miranteQaMedia.calls.filter((call) => call.type === "microphone").length);
    await evaluate(hostWindow, () => {
      const microphone = document.querySelector(".broadcast-microphone-select");
      microphone.value = [...microphone.options].find((option) => option.value)?.value || "";
      microphone.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor("troca do microfone durante a live", () => evaluate(hostWindow, () => ({
      value: document.querySelector(".broadcast-microphone-select")?.value,
      microphoneCalls: window.__miranteQaMedia.calls.filter((call) => call.type === "microphone").length,
    })).then((result) => result.value && result.microphoneCalls > microphoneCallsBeforeLiveEdit ? result : false));
    await evaluate(hostWindow, () => {
      const toggle = document.querySelector(".broadcast-microphone-enabled");
      toggle.checked = false;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor("desativação do microfone durante a live", () => evaluate(hostWindow, () => !document.querySelector(".broadcast-microphone-enabled")?.checked));
    await evaluate(hostWindow, () => {
      const toggle = document.querySelector(".broadcast-microphone-enabled");
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor("reativação do microfone durante a live", () => evaluate(hostWindow, () => ({
      enabled: document.querySelector(".broadcast-microphone-enabled")?.checked,
      microphoneCalls: window.__miranteQaMedia.calls.filter((call) => call.type === "microphone").length,
    })).then((result) => result.enabled && result.microphoneCalls > microphoneCallsBeforeLiveEdit + 1 ? result : false));
    await waitFor("faixa do microfone na prévia", () => evaluate(hostWindow, () => {
      const previewStream = document.querySelector(".broadcast-stage video")?.srcObject;
      return previewStream?.getAudioTracks?.().length === 1 ? true : false;
    }));
    await waitFor("faixa do microfone no espectador", () => evaluate(viewerWindow, () => {
      const remoteStream = document.querySelector("video")?.srcObject;
      return remoteStream?.getAudioTracks?.().some((track) => track.readyState === "live") ? true : false;
    }));
    viewerWindow.destroy();
    viewerWindow = null;
    await evaluate(hostWindow, () => {
      const microphone = document.querySelector(".broadcast-microphone-select");
      microphone.value = "";
      microphone.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor("retorno ao microfone padrão", () => evaluate(hostWindow, () => document.querySelector(".broadcast-microphone-select")?.value === ""));
    const displayResult = await evaluate(hostWindow, () => ({
      calls: window.__miranteQaMedia.calls,
      appliedConstraints: window.__miranteQaMedia.appliedConstraints,
      previewHasLiveVideo: Boolean(document.querySelector(".broadcast-stage video")?.srcObject?.getVideoTracks().some((track) => track.readyState === "live")),
      previewAudioTrackCount: document.querySelector(".broadcast-stage video")?.srcObject?.getAudioTracks().length || 0,
    }));
    if (!displayResult.appliedConstraints.some((constraints) => constraints?.width?.max === 1280 && constraints?.height?.max === 720 && constraints?.frameRate?.max === 30)) {
      throw new Error("captura de janela/tela não aplicou o teto de 720p/30 FPS");
    }
    if (displayResult.previewAudioTrackCount !== 1) {
      throw new Error(`a transmissão combinada não publicou o microfone: ${displayResult.previewAudioTrackCount} faixa(s)`);
    }
    if (!displayResult.calls.some((call) => call.type === "camera" && call.constraints?.video?.deviceId?.exact === "qa-camera")) {
      throw new Error("a transmissão combinada não capturou a câmera selecionada");
    }
    if (!displayResult.calls.some((call) => call.type === "microphone" && call.constraints?.video === false)) {
      throw new Error("a transmissão combinada não capturou o microfone separadamente");
    }
    await evaluate(hostWindow, () => {
      const toggle = document.querySelector(".broadcast-camera-enabled");
      toggle.checked = false;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor("remoção da câmera durante a live", () => evaluate(hostWindow, () => ({
      enabled: document.querySelector(".broadcast-camera-enabled")?.checked,
      videoLive: Boolean(document.querySelector("video")?.srcObject?.getVideoTracks().some((track) => track.readyState === "live")),
      cameraCalls: window.__miranteQaMedia.calls.filter((call) => call.type === "camera").length,
    })).then((result) => !result.enabled && result.videoLive && result.cameraCalls === 1 ? result : false));
    await evaluate(hostWindow, () => {
      const toggle = document.querySelector(".broadcast-camera-enabled");
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor("reativação da câmera durante a live", () => evaluate(hostWindow, () => ({
      enabled: document.querySelector(".broadcast-camera-enabled")?.checked,
      selected: document.querySelector(".broadcast-camera-select")?.value || "",
      videoLive: Boolean(document.querySelector("video")?.srcObject?.getVideoTracks().some((track) => track.readyState === "live")),
      cameraCalls: window.__miranteQaMedia.calls.filter((call) => call.type === "camera").length,
    })).then((result) => result.enabled && result.selected === "qa-camera" && result.videoLive && result.cameraCalls > 1 ? result : false));
    await clickText(hostWindow, "Trocar janela/tela");
    await clickFirstDisplaySource(hostWindow);
    const displaySwitchResult = await waitFor("troca da fonte durante a live", () => evaluate(hostWindow, () => ({
      displayCallCount: window.__miranteQaMedia.calls.filter((call) => call.type === "display").length,
      previewHasLiveVideo: Boolean(document.querySelector("video")?.srcObject?.getVideoTracks().some((track) => track.readyState === "live")),
      switchButtonReady: [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Trocar janela/tela" && !button.disabled),
    })).then((result) => result.displayCallCount >= 2 && result.previewHasLiveVideo && result.switchButtonReady ? result : false));

    await clickText(hostWindow, "Encerrar transmissão");
    let screenStopState = null;
    try {
      await waitFor("encerramento local da live de tela", () => evaluate(hostWindow, () => ({
          hasStopButton: document.body.innerText.includes("Encerrar transmissão"),
          previewDetached: !document.querySelector("video")?.srcObject,
        })).then((state) => {
          screenStopState = state;
          return !state.hasStopButton && state.previewDetached;
        }));
    } catch (error) {
      throw new Error(`${error.message}: estado=${JSON.stringify(screenStopState)}`);
    }
    const streamsAfterScreenStop = await evaluate(hostWindow, async () => (await fetch("/api/streams").then((response) => response.json())).streams || []);
    if (streamsAfterScreenStop.length !== 0) throw new Error(`a live de tela ainda aparece ativa após o encerramento: ${streamsAfterScreenStop.length}`);

    await clickText(hostWindow, "Transmitir câmera");
    await waitFor("configuração prévia da live de câmera", () => evaluate(hostWindow, () => document.querySelector(".broadcast-start-button")?.textContent.trim() === "Abrir câmera"));
    await clickText(hostWindow, "Abrir câmera");
    await waitFor("live de câmera", () => evaluate(hostWindow, () => document.body.innerText.includes("Encerrar transmissão")));
    const cameraResult = await evaluate(hostWindow, () => ({
      calls: window.__miranteQaMedia.calls,
      actualAudioDeviceIds: window.__miranteQaMedia.actualAudioDeviceIds,
      previewHasLiveVideo: Boolean(document.querySelector("video")?.srcObject?.getVideoTracks().some((track) => track.readyState === "live")),
      invite: document.querySelector("input[readonly]")?.value || "",
    }));
    if (!cameraResult.invite) throw new Error("live de câmera não gerou link público");
    const microphoneCall = [...cameraResult.calls].reverse().find((call) => call.type === "microphone");
    if (microphoneCall?.constraints?.audio?.deviceId?.exact || cameraResult.actualAudioDeviceIds.at(-1) !== "qa-microphone") {
      throw new Error(`a live de câmera não caiu no microfone padrão após o dispositivo salvo ficar indisponível: ${JSON.stringify({ microphoneAudio: microphoneCall?.constraints?.audio, actual: cameraResult.actualAudioDeviceIds.at(-1) })}`);
    }

    viewerWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "qa-viewer" },
    });
    await viewerWindow.loadURL(cameraResult.invite);
    const viewerResult = await waitFor("recepção da mídia no espectador", () => evaluate(viewerWindow, () => ({
      title: document.title,
      hasViewerVideo: Boolean(document.querySelector("video")),
      videoReady: (document.querySelector("video")?.readyState || 0) >= 2,
      hasLiveTrack: Boolean(document.querySelector("video")?.srcObject?.getVideoTracks().some((track) => track.readyState === "live")),
      body: document.body.innerText.slice(0, 240),
    })).then((result) => result.videoReady && result.hasLiveTrack ? result : false));

    multistreamWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: "qa-multistream" },
    });
    await multistreamWindow.loadURL(`${baseUrl}/login`);
    const embedInvite = `${cameraResult.invite}${cameraResult.invite.includes("?") ? "&" : "?"}embed=1`;
    await evaluate(multistreamWindow, `() => {
      const container = document.createElement("div");
      container.id = "qa-multistream";
      container.style.cssText = "display:grid;grid-template-columns:repeat(2,640px);width:1280px;height:360px";
      for (let index = 0; index < 2; index += 1) {
        const frame = document.createElement("iframe");
        frame.src = ${JSON.stringify(embedInvite)};
        frame.allow = "autoplay; fullscreen; picture-in-picture";
        frame.loading = "eager";
        frame.style.cssText = "width:640px;height:360px;border:0";
        container.appendChild(frame);
      }
      document.body.appendChild(container);
    }`);
    const multistreamResult = await waitFor("recepção da mídia nos viewers do multistream", () => evaluate(multistreamWindow, () => {
      const frames = [...document.querySelectorAll("#qa-multistream iframe")];
      const status = frames.map((frame) => {
        const video = frame.contentDocument?.querySelector("video");
        return {
          documentReady: Boolean(frame.contentDocument),
          videoReady: (video?.readyState || 0) >= 2,
          hasLiveTrack: Boolean(video?.srcObject?.getVideoTracks().some((track) => track.readyState === "live")),
        };
      });
      return status.length === 2 && status.every((item) => item.documentReady && item.videoReady && item.hasLiveTrack) ? status : false;
    }));
    const hostChatLayout = await evaluate(hostWindow, () => ({
      panel: Boolean(document.querySelector(".broadcast-chat-panel")),
      input: Boolean(document.querySelector(".broadcast-chat-form input:not(:disabled)")),
    }));
    if (!hostChatLayout.panel || !hostChatLayout.input) throw new Error("o chat do transmissor não ficou disponível durante a live");
    const chatBody = `mensagem do espectador ${Date.now()}`;
    const chatBodyLiteral = JSON.stringify(chatBody);
    const chatSent = await evaluate(viewerWindow, `() => {
      const input = document.querySelector(".viewer-chat-form input");
      if (!input) return false;
      input.value = ${chatBodyLiteral};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.form?.requestSubmit();
      return true;
    }`);
    if (!chatSent) throw new Error("não foi possível enviar mensagem de teste pelo espectador");
    await waitFor("mensagem no chat do transmissor", () => evaluate(hostWindow, `() => [...document.querySelectorAll(".broadcast-chat-message p")].some((item) => item.textContent === ${chatBodyLiteral})`));

    for (let index = 0; index < 8; index += 1) {
      const sent = await evaluate(viewerWindow, `(async () => {
        const input = document.querySelector('.viewer-chat-form input');
        const form = document.querySelector('.viewer-chat-form');
        if (!input || !form) return false;
        input.value = 'QA chat ' + ${index};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        form.requestSubmit();
        return true;
      })`);
      if (!sent) throw new Error("formulário do chat do espectador não ficou disponível");
      await sleep(80);
    }
    const viewerChatLayout = await waitFor("chat limitado à área do visualizador", () => evaluate(viewerWindow, () => {
      const page = document.querySelector('.viewer-page');
      const list = document.querySelector('.viewer-chat-list');
      const messages = document.querySelectorAll('.viewer-chat-message');
      if (!page || !list || messages.length < 8) return false;
      return {
        messageCount: messages.length,
        pageHeight: page.clientHeight,
        pageScrollHeight: page.scrollHeight,
        chatHeight: list.clientHeight,
        chatScrollHeight: list.scrollHeight,
      };
    }).then((result) => result && result.pageScrollHeight <= result.pageHeight + 1 && result.chatScrollHeight > result.chatHeight ? result : false));

    await evaluate(viewerWindow, () => document.querySelector('.viewer-chat-collapse-button')?.click());
    const viewerChatCollapsed = await waitFor("recolhimento animado do chat", () => evaluate(viewerWindow, () => {
      const page = document.querySelector('.viewer-page');
      const player = document.querySelector('.viewer-player-shell');
      const panel = document.querySelector('.viewer-chat-panel');
      return page?.classList.contains('chat-collapsed') && player && panel
        ? { playerWidth: player.getBoundingClientRect().width, chatWidth: panel.getBoundingClientRect().width }
        : false;
    }).then((result) => result && result.chatWidth <= 70 && result.playerWidth > 900 ? result : false));
    await evaluate(viewerWindow, () => document.querySelector('.viewer-chat-collapse-button')?.click());
    await waitFor("reabertura do chat", () => evaluate(viewerWindow, () => {
      const page = document.querySelector('.viewer-page');
      const panel = document.querySelector('.viewer-chat-panel');
      return !page?.classList.contains('chat-collapsed') && panel && panel.getBoundingClientRect().width > 250;
    }));

    console.log(JSON.stringify({
      ok: true,
      realCapture: { camera: realCamera, screen: realScreen, window: realWindow, legacyScreen: realLegacyScreen },
      display: { calls: displayResult.calls.filter((call) => call.type === "display"), previewHasLiveVideo: displayResult.previewHasLiveVideo, sourceSwitch: displaySwitchResult },
      camera: { calls: cameraResult.calls.filter((call) => call.type === "camera"), previewHasLiveVideo: cameraResult.previewHasLiveVideo },
      viewer: { ...viewerResult, chatLayout: viewerChatLayout, chatCollapsed: viewerChatCollapsed },
      multistream: { frameCount: multistreamResult.length, allFramesReady: true },
      broadcasterChat: { layout: hostChatLayout, messageReceived: true },
    }));
  } finally {
    if (viewerWindow && !viewerWindow.isDestroyed()) viewerWindow.destroy();
    if (multistreamWindow && !multistreamWindow.isDestroyed()) multistreamWindow.destroy();
    if (hostWindow && !hostWindow.isDestroyed()) hostWindow.destroy();
    if (captureProbeWindow && !captureProbeWindow.isDestroyed()) captureProbeWindow.destroy();
    if (captureTargetWindow && !captureTargetWindow.isDestroyed()) captureTargetWindow.destroy();
    await new Promise((resolve) => server.close(() => resolve()));
    closeDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

app.whenReady().then(async () => {
  try {
    await main();
    app.quit();
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }));
    app.exit(1);
  }
});
