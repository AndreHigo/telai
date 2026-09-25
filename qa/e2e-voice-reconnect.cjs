const assert = require("node:assert/strict");
const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

const rootDir = path.resolve(__dirname, "..");
const databasePath = path.join(rootDir, `.tmp-voice-reconnect-${process.pid}-${Date.now()}.sqlite`);
process.env.MIRANTE_DB_PATH = databasePath;
process.env.REQUIRE_LOGIN = "true";
app.commandLine.appendSwitch("use-fake-device-for-media-stream");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathName} retornou ${response.status}: ${body.error || "erro"}`);
  return { response, body };
}

async function waitFor(label, check, timeoutMs = 20_000) {
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

async function evaluate(window, expression) {
  if (window.isDestroyed()) throw new Error("janela de teste foi encerrada");
  return window.webContents.executeJavaScript(`(${expression})()`, true);
}

async function register(baseUrl, username) {
  const result = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, displayName: "QA Voice Reconnect", password: "SenhaQA123!", termsAccepted: true, privacyAccepted: true }),
  });
  const cookie = result.response.headers.get("set-cookie")?.split(",")[0]?.split(";")[0];
  assert.match(cookie || "", /^mirante_session=/);
  return { cookie, user: result.body.user };
}

async function installSyntheticMicrophone(window) {
  await evaluate(window, () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();
    oscillator.frequency.value = 180;
    oscillator.type = "sine";
    gain.gain.value = 0.08;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    const template = destination.stream.getAudioTracks()[0];
    const devices = [
      { deviceId: "qa-microphone", kind: "audioinput", label: "QA microphone", groupId: "qa" },
      { deviceId: "qa-speaker", kind: "audiooutput", label: "QA speaker", groupId: "qa" },
    ];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async (constraints = {}) => {
          if (constraints.audio === false) return new MediaStream();
          return new MediaStream([template.clone()]);
        },
        enumerateDevices: async () => devices,
      },
    });
    window.__telaiQaAudio = { audioContext, template };
  });
}

async function main() {
  const { closeDatabaseForTests, getWebsocketServerForTests, startServer } = await import(pathToFileURL(path.join(rootDir, "server.mjs")).href);
  const server = await startServer({ host: "127.0.0.1", port: 0 });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}${process.pid}`;
  let window;
  try {
    const owner = await register(baseUrl, `qa_voice_reconnect_${suffix}`.slice(0, 32));
    const groupResult = await request(baseUrl, "/api/groups", {
      method: "POST",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ name: `QA Voice Reconnect ${suffix}`, slug: `qa-voice-reconnect-${suffix}`.slice(0, 64) }),
    });
    const groupId = groupResult.body.group.id;
    const roomResult = await request(baseUrl, `/api/groups/${groupId}/rooms`, {
      method: "POST",
      headers: { cookie: owner.cookie },
      body: JSON.stringify({ name: "QA Voice", kind: "voice" }),
    });
    const voiceRoomId = roomResult.body.room.id;

    await session.defaultSession.cookies.set({
      url: baseUrl,
      name: "mirante_session",
      value: owner.cookie.slice("mirante_session=".length),
      httpOnly: true,
      sameSite: "lax",
    });
    window = new BrowserWindow({
      show: false,
      width: 1280,
      height: 850,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    await window.loadURL(`${baseUrl}/svelte/`);
    await waitFor("painel autenticado", () => evaluate(window, () => Boolean(document.querySelector(".user-menu-chip"))));
    await installSyntheticMicrophone(window);

    await waitFor("navegação para grupos", () => evaluate(window, () => Boolean([...document.querySelectorAll(".global-sidebar-item, .nav-card")].find((item) => item.textContent.includes("Meus grupos")))));
    await evaluate(window, () => [...document.querySelectorAll(".global-sidebar-item, .nav-card")].find((item) => item.textContent.includes("Meus grupos"))?.click());
    await waitFor("cartão do grupo", () => evaluate(window, () => Boolean(document.querySelector(".groups-picker-card"))));
    const openedGroup = await evaluate(window, () => {
      const card = document.querySelector(".groups-picker-card");
      if (!card || card.disabled) return false;
      card.click();
      return true;
    });
    assert.equal(openedGroup, true, "o grupo de teste não ficou disponível");
    await waitFor("workspace do grupo", () => evaluate(window, () => Boolean(document.querySelector(".discord-layout"))));
    await waitFor("canal de voz", () => evaluate(window, () => Boolean(document.querySelector(".voice-channel-section .channel-item"))));
    await evaluate(window, () => document.querySelector(".voice-channel-section .channel-item")?.click());
    await waitFor("workspace de voz", () => evaluate(window, () => Boolean(document.querySelector(".voice-room-workspace"))));

    const gateway = getWebsocketServerForTests();
    const findVoiceSocket = () => [...gateway.clients].find((socket) => socket.user?.id === owner.user.id && socket.voiceRoomId === voiceRoomId);
    await waitFor("entrada inicial na sala de voz", () => Boolean(findVoiceSocket()));
    await waitFor("estado visual conectado", () => evaluate(window, () => Boolean(document.querySelector(".channel-voice-control") && document.body.innerText.includes("Você está em voz"))));

    const firstSocket = findVoiceSocket();
    assert.ok(firstSocket, "o gateway não encontrou o socket inicial da sala");
    firstSocket.terminate();
    await waitFor("aviso de reconexão após queda", () => evaluate(window, () => Boolean(document.querySelector(".voice-reconnect-banner"))), 8_000);
    await waitFor("reconexão automática da sala de voz", () => {
      const socket = findVoiceSocket();
      return socket && socket !== firstSocket && socket.readyState === 1;
    }, 15_000);
    await waitFor("estado visual reconectado", () => evaluate(window, () => Boolean(document.querySelector(".channel-voice-control") && document.body.innerText.includes("Você está em voz"))), 8_000);

    const reconnectState = await evaluate(window, () => ({
      bannerVisible: Boolean(document.querySelector(".voice-reconnect-banner")),
      storedSession: JSON.parse(localStorage.getItem("mirante-voice-reconnect") || "null"),
      voiceControlVisible: Boolean(document.querySelector(".channel-voice-control")),
    }));
    assert.equal(reconnectState.bannerVisible, false, `o aviso permaneceu visível após a reconexão: ${JSON.stringify(reconnectState)}`);
    assert.equal(reconnectState.voiceControlVisible, true, "o controle visual não voltou após a reconexão");
    assert.equal(reconnectState.storedSession?.groupId, groupId, "a sessão persistida perdeu o grupo após reconectar");
    assert.equal(reconnectState.storedSession?.voiceRoomId, voiceRoomId, "a sessão persistida perdeu a sala após reconectar");
    console.log(JSON.stringify({ ok: true, automaticReconnect: true, bannerCleared: true, persistedSession: true }));
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    await new Promise((resolve) => server.close(resolve));
    closeDatabaseForTests();
    for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); app.exit(1); });
