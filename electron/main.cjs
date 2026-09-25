const { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, session, shell, Tray, utilityProcess } = require("electron");
const { trayStateForStatus } = require("./tray-icon-design.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const config = require("./config.json");
const { autoUpdater } = require("electron-updater");
const runtimeConfig = { ...config, appUrl: process.env.MIRANTE_APP_URL || config.appUrl };
if (process.env.MIRANTE_DESKTOP_LOCAL === "1") {
  runtimeConfig.appUrl = "http://localhost:8789";
  runtimeConfig.startLocalServer = true;
}

let mainWindow;
let pendingDisplayRequest;
let sourcesById = new Map();
let embeddedServer;
let tray;
let isQuitting = false;
let updateCheckTimer;
let updateCheckInFlight = false;
let windowAudioCaptureActive = false;
let windowAudioWorker;
let windowAudioRequestId = 0;
const windowAudioRequests = new Map();
const systemAudioWorkers = new Map();
const systemAudioRequests = new Map();
let systemAudioRequestId = 0;
let systemAudioMixTimer = null;
let systemAudioMixBuffers = new Map();
let systemAudioCaptureActive = false;
let pushToTalkAccelerator = null;
let pushToTalkActive = false;
let muteShortcutAccelerator = null;
const launchedAtLogin = process.platform === "win32" && process.argv.includes("--hidden");
let trayStatusKey = "";
const desktopDebugEnabled = process.env.TELAI_DEBUG === "1" || process.env.MIRANTE_DEBUG === "1";
let desktopLogPath = null;
let desktopLogWriteChain = Promise.resolve();
let rendererRecoveryTimer = null;
let rendererRecoveryAttempts = 0;

function safeDesktopLogValue(value, key = "") {
  const sensitiveKey = /token|secret|password|credential|authorization|cookie|body|sdp|candidate|payload|avatar|access[_-]?token|refresh[_-]?token/i.test(key);
  if (sensitiveKey) return "[redacted]";
  if (value instanceof Error) return { name: value.name, message: String(value.message || "").slice(0, 500), stack: String(value.stack || "").slice(0, 1800) };
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeDesktopLogValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([entryKey, entryValue]) => [entryKey, safeDesktopLogValue(entryValue, entryKey)]));
  }
  return value;
}

function desktopLog(level, event, fields = {}) {
  const record = {
    time: new Date().toISOString(),
    level,
    event,
    ...safeDesktopLogValue(fields),
  };
  const line = `${JSON.stringify(record)}\n`;
  try {
    if (!desktopLogPath) {
      const logDirectory = app.isReady()
        ? app.getPath("logs")
        : path.join(process.env.APPDATA || os.tmpdir(), "Telai", "logs");
      fs.mkdirSync(logDirectory, { recursive: true });
      desktopLogPath = path.join(logDirectory, "main.log");
    }
    const logPath = desktopLogPath;
    desktopLogWriteChain = desktopLogWriteChain
      .catch(() => {})
      .then(() => new Promise((resolve) => {
        fs.appendFile(logPath, line, "utf8", () => resolve());
      }));
  } catch {
    // Logging must never prevent the desktop client from starting or closing.
  }
  if (desktopDebugEnabled || level === "error") {
    const output = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    output(line.trim());
  }
}

function sendToMainWindow(channel, payload) {
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return false;
  try {
    contents.send(channel, payload);
    return true;
  } catch (error) {
    desktopLog("error", "web_contents_send_error", { channel, error });
    return false;
  }
}

function scheduleRendererRecovery(details = {}) {
  if (isQuitting || !mainWindow || mainWindow.isDestroyed() || rendererRecoveryTimer) return;
  if (rendererRecoveryAttempts >= 3) {
    desktopLog("error", "renderer_recovery_limit_reached", { reason: details.reason, exitCode: details.exitCode });
    return;
  }
  rendererRecoveryAttempts += 1;
  rendererRecoveryTimer = setTimeout(() => {
    rendererRecoveryTimer = null;
    if (isQuitting || !mainWindow || mainWindow.isDestroyed()) return;
    try {
      desktopLog("warn", "renderer_recovery_started", { attempt: rendererRecoveryAttempts, reason: details.reason, exitCode: details.exitCode });
      mainWindow.webContents.reload();
    } catch (error) {
      desktopLog("error", "renderer_recovery_failed", { error });
    }
  }, 750);
}

function isAllowedAppNavigation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const configuredOrigins = Array.isArray(runtimeConfig.allowedOrigins) ? runtimeConfig.allowedOrigins : [];
    const allowedOrigins = new Set([runtimeConfig.appUrl, ...configuredOrigins].map((value) => {
      try { return new URL(value).origin; } catch { return null; }
    }).filter(Boolean));
    return allowedOrigins.has(url.origin);
  } catch {
    return false;
  }
}

function configureMediaPermissionHandler() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    const requestUrl = webContents?.getURL?.() || "";
    const mediaTypes = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
    const isMediaRequest = permission === "media";
    const allowed = isMediaRequest && isAllowedAppNavigation(requestUrl)
      && mediaTypes.every((type) => type === "audio" || type === "video");
    desktopLog(allowed ? "info" : "warn", "media_permission_request", {
      allowed,
      permission,
      mediaTypes,
      url: String(requestUrl).split("?")[0],
    });
    callback(allowed);
  });
}

function openSafeExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      desktopLog('warn', 'external_navigation_blocked', { protocol: url.protocol });
      return;
    }
    void shell.openExternal(url.toString()).catch((error) => desktopLog('error', 'external_navigation_error', { error }));
  } catch (error) {
    desktopLog('warn', 'external_navigation_invalid', { error });
  }
}

process.on("uncaughtExceptionMonitor", (error, origin) => {
  desktopLog("error", "uncaught_exception", { origin, error });
});
process.on("unhandledRejection", (reason) => {
  desktopLog("error", "unhandled_rejection", { reason });
});

// O modo E2E é usado somente para validar o executável empacotado em uma
// máquina que já tenha uma instância instalada aberta. O comportamento normal
// continua usando o bloqueio de instância única.
const gotSingleInstanceLock = process.env.MIRANTE_E2E === "1" || app.requestSingleInstanceLock();

// A aceleração fica ligada por padrão. Quando o usuário escolher o modo de
// compatibilidade, desative-a antes do ready; o Chromium não permite mudar
// esse recurso com a janela já inicializada.
const desktopPreferencesAtStartup = readDesktopPreferences();
const hardwareAccelerationMode = desktopPreferencesAtStartup.hardwareAcceleration === "disabled" ? "disabled" : "auto";
if (hardwareAccelerationMode === "disabled") app.disableHardwareAcceleration();

function finishDisplayMediaRequest(callback, streams = null) {
  if (!callback) return;
  try {
    // null cancels getDisplayMedia without being mistaken for a capture object.
    callback(streams);
  } catch (error) {
    desktopLog("error", "display_media_callback_error", { error });
  } finally {
    if (pendingDisplayRequest === callback) {
      pendingDisplayRequest = null;
      sourcesById.clear();
    }
  }
}

function resolveSourceProcessId(sourceName, visibleWindows = []) {
  const normalizedName = String(sourceName || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  if (!normalizedName) return null;
  const exact = visibleWindows.find((window) => String(window.title || "").replace(/\s+/g, " ").trim().toLocaleLowerCase() === normalizedName);
  const partial = visibleWindows.find((window) => {
    const title = String(window.title || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
    return title && (title.includes(normalizedName) || normalizedName.includes(title));
  });
  return Number((exact || partial)?.processId) || null;
}

function rejectWindowAudioRequests(error, worker = null) {
  for (const [id, request] of windowAudioRequests.entries()) {
    if (worker && request.worker !== worker) continue;
    clearTimeout(request.timeout);
    request.reject(error);
    windowAudioRequests.delete(id);
  }
}

function terminateWindowAudioWorker() {
  const worker = windowAudioWorker;
  windowAudioWorker = null;
  if (!worker) return;
  try { worker.kill(); } catch (error) { desktopLog("warn", "window_audio_worker_kill_error", { error }); }
}

function ensureWindowAudioWorker() {
  if (process.platform !== "win32") return null;
  if (windowAudioWorker?.pid) return windowAudioWorker;
  const workerPath = path.join(__dirname, "window-audio-worker.cjs");
  const worker = utilityProcess.fork(workerPath, [], { serviceName: "Telai Window Audio", stdio: "ignore" });
  windowAudioWorker = worker;
  worker.on("message", (message) => {
    if (message?.type === "chunk") {
      if (windowAudioWorker === worker && windowAudioCaptureActive) sendToMainWindow("window-audio-chunk", Buffer.from(message.chunk));
      return;
    }
    if (message?.type === "status") {
      if (windowAudioWorker !== worker) return;
      windowAudioCaptureActive = false;
      sendToMainWindow("window-audio-status", { status: message.status });
      return;
    }
    if (message?.type !== "response") return;
    const request = windowAudioRequests.get(message.id);
    if (!request || request.worker !== worker) return;
    windowAudioRequests.delete(message.id);
    clearTimeout(request.timeout);
    request.resolve(message);
  });
  worker.on("error", (error) => {
    desktopLog("error", "window_audio_worker_error", { error });
    const isCurrentWorker = windowAudioWorker === worker;
    if (isCurrentWorker) {
      windowAudioWorker = null;
      windowAudioCaptureActive = false;
    }
    rejectWindowAudioRequests(error instanceof Error ? error : new Error("O capturador de áudio falhou."), worker);
    if (!isQuitting && isCurrentWorker) sendToMainWindow("window-audio-status", { status: "error" });
  });
  worker.on("exit", (code) => {
    desktopLog(code ? "error" : "info", "window_audio_worker_exit", { code });
    const isCurrentWorker = windowAudioWorker === worker;
    if (isCurrentWorker) {
      windowAudioWorker = null;
      windowAudioCaptureActive = false;
    }
    rejectWindowAudioRequests(new Error(`O capturador de áudio foi encerrado${code ? ` (código ${code})` : ""}.`), worker);
    if (!isQuitting && isCurrentWorker) sendToMainWindow("window-audio-status", { status: "error" });
  });
  return worker;
}

function requestWindowAudio(message) {
  const worker = ensureWindowAudioWorker();
  if (!worker) return Promise.resolve({ ok: false, message: "Áudio isolado por janela só está disponível no Windows." });
  const id = ++windowAudioRequestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      windowAudioRequests.delete(id);
      reject(new Error("O capturador de áudio não respondeu a tempo."));
    }, 10000);
    windowAudioRequests.set(id, { resolve, reject, timeout, worker });
    try { worker.postMessage({ ...message, id }); } catch (error) {
      clearTimeout(timeout);
      windowAudioRequests.delete(id);
      reject(error);
    }
  });
}

async function getVisibleProcessWindows() {
  try {
    const result = await requestWindowAudio({ type: "list-windows" });
    return result.ok ? result.windows || [] : [];
  } catch (error) {
    desktopLog("warn", "window_audio_list_error", { error });
    return [];
  }
}

const SYSTEM_AUDIO_CHUNK_BYTES = 4096 * 4;

function flushSystemAudioMix() {
  if (!systemAudioCaptureActive || !systemAudioWorkers.size) return;
  const processIds = [...systemAudioWorkers.keys()];
  const availableBytes = Math.min(...processIds.map((processId) => systemAudioMixBuffers.get(processId)?.length || 0));
  if (availableBytes < SYSTEM_AUDIO_CHUNK_BYTES) return;
  const mixed = Buffer.alloc(SYSTEM_AUDIO_CHUNK_BYTES);
  for (let offset = 0; offset < SYSTEM_AUDIO_CHUNK_BYTES; offset += 2) {
    let sample = 0;
    for (const processId of processIds) sample += systemAudioMixBuffers.get(processId).readInt16LE(offset);
    mixed.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), offset);
  }
  for (const processId of processIds) systemAudioMixBuffers.set(processId, systemAudioMixBuffers.get(processId).subarray(SYSTEM_AUDIO_CHUNK_BYTES));
  sendToMainWindow("window-audio-chunk", mixed);
}

function removeSystemAudioWorker(processId, worker, status = "ended") {
  if (systemAudioWorkers.get(processId) !== worker) return;
  systemAudioWorkers.delete(processId);
  systemAudioMixBuffers.delete(processId);
  for (const [id, request] of systemAudioRequests.entries()) {
    if (request.worker !== worker) continue;
    clearTimeout(request.timeout);
    request.reject(new Error("O capturador de áudio do aplicativo foi encerrado."));
    systemAudioRequests.delete(id);
  }
  if (systemAudioCaptureActive && !systemAudioWorkers.size) {
    systemAudioCaptureActive = false;
    if (systemAudioMixTimer) clearInterval(systemAudioMixTimer);
    systemAudioMixTimer = null;
    sendToMainWindow("window-audio-status", { status });
  }
}

function createSystemAudioWorker(processId) {
  const workerPath = path.join(__dirname, "window-audio-worker.cjs");
  const worker = utilityProcess.fork(workerPath, [], { serviceName: `Telai System Audio ${processId}`, stdio: "ignore" });
  systemAudioWorkers.set(processId, worker);
  systemAudioMixBuffers.set(processId, Buffer.alloc(0));
  worker.on("message", (message) => {
    if (message?.type === "chunk") {
      if (!systemAudioCaptureActive || systemAudioWorkers.get(processId) !== worker) return;
      const current = systemAudioMixBuffers.get(processId) || Buffer.alloc(0);
      const chunk = Buffer.from(message.chunk || []);
      if (!chunk.length) return;
      const combined = Buffer.concat([current, chunk]);
      systemAudioMixBuffers.set(processId, combined.length > 48000 * 4 ? combined.subarray(combined.length - 48000 * 4) : combined);
      return;
    }
    if (message?.type === "status") {
      removeSystemAudioWorker(processId, worker, message.status || "ended");
      return;
    }
    if (message?.type !== "response") return;
    const request = systemAudioRequests.get(message.id);
    if (!request || request.worker !== worker) return;
    systemAudioRequests.delete(message.id);
    clearTimeout(request.timeout);
    request.resolve(message);
  });
  worker.on("error", (error) => {
    desktopLog("error", "system_audio_worker_error", { processId, error });
    removeSystemAudioWorker(processId, worker, "error");
  });
  worker.on("exit", (code) => {
    desktopLog(code ? "error" : "info", "system_audio_worker_exit", { processId, code });
    removeSystemAudioWorker(processId, worker, code ? "error" : "ended");
  });
  return worker;
}

function requestSystemAudio(worker, message) {
  if (!worker?.pid) return Promise.resolve({ ok: false, message: "Capturador de áudio indisponível." });
  const id = ++systemAudioRequestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      systemAudioRequests.delete(id);
      reject(new Error("O capturador de áudio não respondeu a tempo."));
    }, 10000);
    systemAudioRequests.set(id, { resolve, reject, timeout, worker });
    try { worker.postMessage({ ...message, id }); } catch (error) {
      clearTimeout(timeout);
      systemAudioRequests.delete(id);
      reject(error);
    }
  });
}

async function stopSystemAudioCapture() {
  systemAudioCaptureActive = false;
  if (systemAudioMixTimer) clearInterval(systemAudioMixTimer);
  systemAudioMixTimer = null;
  const workers = [...systemAudioWorkers.entries()];
  systemAudioWorkers.clear();
  systemAudioMixBuffers.clear();
  await Promise.all(workers.map(async ([, worker]) => {
    try { await requestSystemAudio(worker, { type: "stop" }); } catch {}
    try { worker.kill(); } catch (error) { desktopLog("warn", "system_audio_worker_kill_error", { error }); }
  }));
  for (const [id, request] of systemAudioRequests.entries()) {
    clearTimeout(request.timeout);
    request.reject(new Error("Captura de áudio encerrada."));
    systemAudioRequests.delete(id);
  }
}

async function startSystemAudioCapture() {
  if (process.platform !== "win32") return { ok: false, message: "Áudio filtrado por aplicativo só está disponível no Windows." };
  await stopSystemAudioCapture();
  const visibleWindows = await getVisibleProcessWindows();
  const processIds = [...new Set(visibleWindows
    .filter((window) => Number(window.processId) > 0)
    .filter((window) => Number(window.processId) !== Number(process.pid))
    .filter((window) => !/(discord|telai|mirante)/i.test(`${window.processName || ""} ${window.title || ""}`))
    .map((window) => Number(window.processId)))];
  if (!processIds.length) return { ok: false, message: "Não encontrei aplicativos para incluir no áudio filtrado." };
  const started = [];
  for (const processId of processIds) {
    const worker = createSystemAudioWorker(processId);
    try {
      const result = await requestSystemAudio(worker, { type: "start", processId });
      if (result?.ok) started.push(processId);
      else removeSystemAudioWorker(processId, worker, "error");
    } catch (error) {
      desktopLog("warn", "system_audio_process_start_error", { processId, error });
      removeSystemAudioWorker(processId, worker, "error");
    }
  }
  if (!started.length) {
    await stopSystemAudioCapture();
    return { ok: false, message: "Não foi possível iniciar o áudio filtrado dos aplicativos." };
  }
  systemAudioCaptureActive = true;
  systemAudioMixTimer = setInterval(flushSystemAudioMix, 10);
  desktopLog("info", "system_audio_capture_started", { processCount: started.length, excluded: ["Telai", "Discord"] });
  return { ok: true, processCount: started.length, excluded: ["Telai", "Discord"] };
}

async function collectDisplaySources() {
  sourcesById.clear();
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
  });
  const visibleProcessWindows = await getVisibleProcessWindows();
  sourcesById = new Map(sources.map((source) => [source.id, source]));
  return sources.map((source) => {
    const processId = resolveSourceProcessId(source.name, visibleProcessWindows);
    const process = visibleProcessWindows.find((window) => Number(window.processId) === Number(processId));
    return {
      id: source.id,
      name: source.name,
      kind: source.id.startsWith("window:") ? "window" : "screen",
      thumbnail: source.thumbnail.toDataURL(),
      processId,
      processName: process?.processName || "",
    };
  });
}

async function stopWindowAudioCapture() {
  windowAudioCaptureActive = false;
  await stopSystemAudioCapture();
  try {
    if (windowAudioWorker?.pid) await requestWindowAudio({ type: "stop" });
  } catch (error) {
    desktopLog("warn", "window_audio_stop_error", { error });
  } finally {
    terminateWindowAudioWorker();
  }
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });
}

function showMainWindow() {
  desktopLog("debug", "window_show_requested", { hasWindow: Boolean(mainWindow) });
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function supportsLaunchAtLogin() {
  return process.platform === "win32" || process.platform === "darwin";
}

function launchAtLoginPreferencesPath() {
  return path.join(app.getPath("userData"), "desktop-preferences.json");
}

function readDesktopPreferences() {
  try {
    const contents = fs.readFileSync(launchAtLoginPreferencesPath(), "utf8");
    const preferences = JSON.parse(contents);
    return preferences && typeof preferences === "object" ? preferences : {};
  } catch {
    return {};
  }
}

function writeDesktopPreferences(preferences) {
  const preferencesPath = launchAtLoginPreferencesPath();
  fs.mkdirSync(path.dirname(preferencesPath), { recursive: true });
  fs.writeFileSync(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
}

function loginItemArgs() {
  return app.isPackaged ? ["--hidden"] : [app.getAppPath(), "--hidden"];
}

function getLaunchAtLoginSetting() {
  if (!supportsLaunchAtLogin()) return false;
  try {
    return Boolean(app.getLoginItemSettings().openAtLogin);
  } catch (error) {
    desktopLog("warn", "launch_at_login_read_error", { error });
    return false;
  }
}

function applyLaunchAtLoginSetting(enabled) {
  const nextValue = Boolean(enabled);
  if (supportsLaunchAtLogin()) {
    app.setLoginItemSettings({
      openAtLogin: nextValue,
      path: process.execPath,
      args: loginItemArgs(),
    });
  }
  writeDesktopPreferences({ ...readDesktopPreferences(), launchAtLogin: nextValue });
  return nextValue;
}

function ensureLaunchAtLoginDefault() {
  const preferences = readDesktopPreferences();
  const enabled = typeof preferences.launchAtLogin === "boolean"
    ? preferences.launchAtLogin
    : supportsLaunchAtLogin();
  applyLaunchAtLoginSetting(enabled);
  return enabled;
}

function trayIconForStatus(status = {}) {
  const state = trayStateForStatus(status);
  const iconPath = path.join(__dirname, "assets", "tray", `${state}.png`);
  return nativeImage.createFromPath(iconPath);
}

function trayTooltipForStatus(status = {}) {
  const labels = [];
  if (status.connected && !status.live && !status.voice) labels.push("Conta conectada");
  if (status.live) labels.push(status.sharing ? "Compartilhando tela" : status.camera ? "Câmera ao vivo" : "Ao vivo");
  if (status.voice) labels.push(status.deafened ? "Áudio desativado" : status.muted ? "Microfone silenciado" : "Voz conectada");
  return `Telai${labels.length ? ` · ${labels.join(" · ")}` : ""}`;
}

function sendTrayAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) showMainWindow();
  const contents = mainWindow?.webContents;
  if (!contents || contents.isDestroyed()) return false;
  const deliver = () => sendToMainWindow("app-tray-action", action);
  if (contents.isLoading()) {
    contents.once("did-finish-load", deliver);
    return true;
  }
  return deliver();
}

function showTrayAcknowledgements() {
  try {
    void dialog.showMessageBox({
      type: "info",
      title: "Reconhecimentos — Telai",
      message: "Telai",
      detail: `Versão ${app.getVersion()}\nAplicativo desktop baseado em Electron.`,
    });
  } catch (error) {
    desktopLog("warn", "tray_acknowledgements_error", { error });
  }
}

function restartApplication() {
  if (isQuitting) return;
  isQuitting = true;
  try {
    app.relaunch();
    app.exit(0);
  } catch (error) {
    isQuitting = false;
    desktopLog("error", "app_restart_failed", { error });
  }
}

function trayContextMenuForStatus(status = {}) {
  const voiceConnected = Boolean(status.voice);
  return Menu.buildFromTemplate([
    { label: "Abrir Telai", click: showMainWindow },
    { label: "Reiniciar Telai", click: restartApplication },
    { type: "separator" },
    {
      label: status.muted ? "Ativar microfone" : "Silenciar microfone",
      type: "checkbox",
      checked: Boolean(status.muted),
      enabled: voiceConnected,
      click: () => sendTrayAction("toggle-mute"),
    },
    {
      label: status.deafened ? "Ativar áudio" : "Desativar áudio",
      type: "checkbox",
      checked: Boolean(status.deafened),
      enabled: voiceConnected,
      click: () => sendTrayAction("toggle-deafen"),
    },
    { type: "separator" },
    { label: "Verificar atualizações…", click: () => { showMainWindow(); void checkForUpdatesInBackground(); } },
    { label: "Reconhecimentos", click: showTrayAcknowledgements },
    { type: "separator" },
    { label: "Sair do Telai", click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function updateTrayStatus(status = {}) {
  if (!tray) return;
  status = status && typeof status === "object" ? status : {};
  const normalized = {
    connected: Boolean(status.connected),
    live: Boolean(status.live),
    sharing: Boolean(status.sharing),
    camera: Boolean(status.camera),
    voice: Boolean(status.voice),
    muted: Boolean(status.muted),
    deafened: Boolean(status.deafened),
  };
  const nextKey = JSON.stringify(normalized);
  if (nextKey === trayStatusKey) return;
  const previousKey = trayStatusKey;
  trayStatusKey = nextKey;
  try {
    const icon = trayIconForStatus(normalized);
    if (!icon.isEmpty()) tray.setImage(icon);
    tray.setToolTip(trayTooltipForStatus(normalized));
    tray.setContextMenu(trayContextMenuForStatus(normalized));
    desktopLog("debug", "tray_status_updated", { previousKey, status: normalized, iconLoaded: !icon.isEmpty() });
  } catch (error) {
    desktopLog("error", "tray_status_update_failed", { status: normalized, error });
  }
}

function createTray() {
  // Keep the initial icon on the same rendering path used by later status
  // updates. The official PNG remains a safe fallback if SVG rasterization is
  // unavailable in a particular Electron/Windows build.
  const iconPath = path.join(__dirname, "..", "public", "telai-logo-dark.png");
  const logo = nativeImage.createFromPath(iconPath);
  const fallbackIcon = logo.isEmpty()
    ? logo
    : logo.crop({ x: 0, y: 0, width: 500, height: 453 }).resize({ width: 32, height: 32 });
  const dynamicIcon = trayIconForStatus({});
  const icon = dynamicIcon.isEmpty() ? fallbackIcon : dynamicIcon;
  if (icon.isEmpty()) throw new Error(`Não foi possível carregar o ícone do Telai: ${iconPath}`);
  tray = new Tray(icon);
  desktopLog("info", "tray_created", { iconLoaded: !icon.isEmpty() });
  trayStatusKey = "";
  updateTrayStatus({});
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
}

function sendUpdateStatus(status, extra = {}) {
  desktopLog(status === "error" ? "warn" : "debug", "update_status", { status, ...extra });
  sendToMainWindow("app-update-status", { status, ...extra });
}

async function checkForUpdatesInBackground() {
  if (!app.isPackaged || process.platform !== "win32" || updateCheckInFlight) return;
  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // electron-updater emits the user-facing error status.
  } finally {
    updateCheckInFlight = false;
  }
}

function applyWindowTheme(theme = "dark") {
  const isLight = theme === "light";
  mainWindow?.setBackgroundColor(isLight ? "#f7f8fc" : "#070b16");
  if (mainWindow && process.platform === "win32") {
    mainWindow.setTitleBarOverlay({
      color: isLight ? "#eef2f8" : "#101a2d",
      symbolColor: isLight ? "#14203a" : "#eef2ff",
      height: 36,
    });
  }
}

function acceleratorForPushToTalkCode(code) {
  const aliases = { Space: "Space", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-", Equal: "=" };
  if (aliases[code]) return aliases[code];
  if (/^Key[A-Z]$/.test(code || "")) return code.slice(3);
  if (/^Digit[0-9]$/.test(code || "")) return code.slice(5);
  if (/^F(?:[1-9]|1[0-2])$/.test(code || "")) return code;
  return null;
}

function configurePushToTalk(code = "") {
  if (pushToTalkAccelerator) globalShortcut.unregister(pushToTalkAccelerator);
  pushToTalkAccelerator = null;
  pushToTalkActive = false;
  const accelerator = acceleratorForPushToTalkCode(String(code || ""));
  if (!accelerator) return { ok: true, global: false };
  const registered = globalShortcut.register(accelerator, () => {
    pushToTalkActive = !pushToTalkActive;
    sendToMainWindow("app-push-to-talk", { active: pushToTalkActive });
  });
  if (!registered) return { ok: false, global: false, message: "Essa tecla já está sendo usada pelo Windows ou por outro programa." };
  pushToTalkAccelerator = accelerator;
  return { ok: true, global: true };
}

function configureMuteShortcut(code = "") {
  if (muteShortcutAccelerator) globalShortcut.unregister(muteShortcutAccelerator);
  muteShortcutAccelerator = null;
  const accelerator = acceleratorForPushToTalkCode(String(code || ""));
  if (!accelerator) return { ok: true, global: false };
  const registered = globalShortcut.register(accelerator, () => {
    sendToMainWindow("app-mute-shortcut");
  });
  if (!registered) return { ok: false, global: false, message: "Esse atalho já está sendo usado pelo Windows ou por outro programa." };
  muteShortcutAccelerator = accelerator;
  return { ok: true, global: true };
}

function configureAutoUpdater() {
  ipcMain.handle("app-get-version", () => app.getVersion());
  ipcMain.handle("clipboard-write-text", (_event, value) => {
    try {
      clipboard.writeText(String(value ?? ""));
      return { ok: true };
    } catch (error) {
      desktopLog("warn", "clipboard_write_error", { error });
      return { ok: false, message: error?.message || "Não foi possível copiar o texto." };
    }
  });
  ipcMain.handle("app-get-launch-at-login", () => ({
    ok: true,
    supported: supportsLaunchAtLogin(),
    enabled: getLaunchAtLoginSetting(),
  }));
  ipcMain.handle("app-set-launch-at-login", (_event, enabled) => {
    if (!supportsLaunchAtLogin()) {
      return { ok: false, supported: false, enabled: false, message: "Essa configuração só está disponível no Windows e no macOS." };
    }
    try {
      const nextValue = applyLaunchAtLoginSetting(enabled);
      return { ok: true, supported: true, enabled: nextValue };
    } catch (error) {
      return { ok: false, supported: true, enabled: getLaunchAtLoginSetting(), message: error?.message || "Não foi possível alterar a inicialização do Telai." };
    }
  });
  ipcMain.handle("app-get-hardware-acceleration", () => ({
    ok: true,
    mode: hardwareAccelerationMode,
    enabled: hardwareAccelerationMode !== "disabled",
    restartRequired: true,
  }));
  ipcMain.handle("app-set-hardware-acceleration", (_event, mode) => {
    const nextMode = mode === "disabled" ? "disabled" : mode === "auto" ? "auto" : null;
    if (!nextMode) return { ok: false, mode: hardwareAccelerationMode, message: "Modo de aceleração inválido." };
    try {
      writeDesktopPreferences({ ...readDesktopPreferences(), hardwareAcceleration: nextMode });
      return { ok: true, mode: nextMode, enabled: nextMode !== "disabled", restartRequired: nextMode !== hardwareAccelerationMode };
    } catch (error) {
      desktopLog("warn", "hardware_acceleration_preference_write_error", { error });
      return { ok: false, mode: hardwareAccelerationMode, message: "Não foi possível salvar o modo de compatibilidade." };
    }
  });
  ipcMain.on("app-set-theme", (_event, theme) => applyWindowTheme(theme));
  ipcMain.handle("window-toggle-fullscreen", (_event, active) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, active: false, message: "A janela do Telai não está disponível." };
    const nextActive = typeof active === "boolean" ? active : !mainWindow.isFullScreen();
    mainWindow.setFullScreen(nextActive);
    return { ok: true, active: nextActive };
  });
  ipcMain.on("app-set-tray-status", (_event, status) => updateTrayStatus(status));
  ipcMain.handle("app-set-push-to-talk-key", (_event, code) => configurePushToTalk(code));
  ipcMain.handle("app-set-mute-shortcut", (_event, code) => configureMuteShortcut(code));
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => sendUpdateStatus("checking"));
  autoUpdater.on("update-available", (info) => sendUpdateStatus("available", { version: info.version }));
  autoUpdater.on("update-not-available", (info) => sendUpdateStatus("current", { version: info.version }));
  autoUpdater.on("download-progress", (progress) => sendUpdateStatus("downloading", { percent: Math.round(progress.percent) }));
  autoUpdater.on("update-downloaded", (info) => sendUpdateStatus("downloaded", { version: info.version }));
  autoUpdater.on("error", (error) => sendUpdateStatus("error", { message: error?.message || "Não foi possível verificar atualizações." }));

  ipcMain.handle("app-check-for-updates", async () => {
    if (!app.isPackaged) return { status: "dev" };
    if (process.platform !== "win32") return { status: "unsupported" };
    if (updateCheckInFlight) return { status: "checking" };
    updateCheckInFlight = true;
    try {
      const result = await autoUpdater.checkForUpdates();
      return { status: "checking", version: result?.updateInfo?.version || null };
    } catch (error) {
      sendUpdateStatus("error", { message: error?.message || "Não foi possível verificar atualizações." });
      return { status: "error", message: error?.message || "Não foi possível verificar atualizações." };
    } finally {
      updateCheckInFlight = false;
    }
  });
  ipcMain.handle("app-download-update", async () => {
    if (!app.isPackaged || process.platform !== "win32") return { status: "unsupported" };
    try {
      await autoUpdater.downloadUpdate();
      return { status: "downloading" };
    } catch (error) {
      sendUpdateStatus("error", { message: error?.message || "Não foi possível baixar a atualização." });
      return { status: "error", message: error?.message || "Não foi possível baixar a atualização." };
    }
  });
  ipcMain.handle("app-install-update", () => {
    if (!app.isPackaged || process.platform !== "win32") return { status: "unsupported" };
    autoUpdater.quitAndInstall();
    return { status: "installing" };
  });

  ipcMain.handle("window-audio-start", async (_event, processId) => {
    if (process.platform !== "win32") {
      return { ok: false, message: "Áudio isolado por janela só está disponível no Windows." };
    }
    const targetProcessId = Number(processId);
    if (!Number.isInteger(targetProcessId) || targetProcessId <= 0) {
      return { ok: false, message: "Não foi possível identificar o processo da janela escolhida." };
    }
    try {
      await stopWindowAudioCapture();
      const result = await requestWindowAudio({ type: "start", processId: targetProcessId });
      if (result.ok) windowAudioCaptureActive = true;
      return result;
    } catch (error) {
      windowAudioCaptureActive = false;
      return { ok: false, message: error?.message || "Não foi possível capturar o áudio da janela." };
    }
  });

  ipcMain.handle("system-audio-start", async () => {
    try {
      return await startSystemAudioCapture();
    } catch (error) {
      await stopSystemAudioCapture();
      return { ok: false, message: error?.message || "Não foi possível preparar o áudio filtrado do computador." };
    }
  });

  ipcMain.handle("window-audio-stop", async () => {
    await stopWindowAudioCapture();
    return { ok: true };
  });
}

function detectZeroTierIPv4() {
  for (const [interfaceName, addresses] of Object.entries(os.networkInterfaces())) {
    if (!/zerotier/i.test(interfaceName)) continue;
    const address = addresses?.find((candidate) => ["IPv4", 4].includes(candidate.family) && !candidate.internal);
    if (address?.address) return address.address;
  }
  return null;
}

async function startEmbeddedServer() {
  if (!runtimeConfig.startLocalServer || !runtimeConfig.appUrl.startsWith("http://localhost")) return;
  process.env.MEDIA_MODE = runtimeConfig.mediaMode === "relay" ? "relay" : "p2p";
  process.env.REQUIRE_LOGIN = "true";
  // O app.asar é somente leitura. O servidor embutido precisa manter o banco
  // e os arquivos de dados na pasta gravável do usuário do Electron.
  if (!process.env.MIRANTE_DB_PATH) {
    process.env.MIRANTE_DB_PATH = path.join(app.getPath("userData"), "data", "mirante-tv.sqlite");
  }
  const serverModule = path.join(__dirname, "..", "server.mjs");
  const { startServer } = await import(pathToFileURL(serverModule).href);
  const appUrl = new URL(runtimeConfig.appUrl);
  const port = Number(appUrl.port || 8787);
  const zeroTierIp = ["auto", "zerotier"].includes(runtimeConfig.networkMode) ? detectZeroTierIPv4() : null;
  const publicBaseUrl = runtimeConfig.publicBaseUrl || (zeroTierIp ? `http://${zeroTierIp}:${port}` : "");
  if (publicBaseUrl) process.env.PUBLIC_BASE_URL = publicBaseUrl;
  const host = zeroTierIp ? "0.0.0.0" : (runtimeConfig.localServerHost || "127.0.0.1");
  embeddedServer = await startServer({ host, port });
  desktopLog("info", "embedded_server_started", { host, port, mediaMode: process.env.MEDIA_MODE });
}

function createWindow() {
  desktopLog("info", "window_create_started", { appUrl: runtimeConfig.appUrl.split("?")[0], packaged: app.isPackaged });
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    show: false,
    title: runtimeConfig.windowTitle,
    icon: path.join(__dirname, "..", "public", "telai-app-icon.png"),
    backgroundColor: "#070b16",
    ...(process.platform === "win32" ? {
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#101a2d", symbolColor: "#eef2ff", height: 36 },
    } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => {
    desktopLog("info", "window_ready_to_show", { hiddenAtLogin: launchedAtLogin });
    if (!launchedAtLogin) mainWindow.show();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    rendererRecoveryAttempts = 0;
    desktopLog("info", "renderer_ready");
  });
  mainWindow.on("unresponsive", () => desktopLog("error", "window_unresponsive"));
  mainWindow.on("responsive", () => desktopLog("info", "window_responsive"));
  mainWindow.on("enter-full-screen", () => sendToMainWindow("window-fullscreen-changed", { active: true }));
  mainWindow.on("leave-full-screen", () => sendToMainWindow("window-fullscreen-changed", { active: false }));
  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    desktopLog("warn", "window_closed", { quitting: isQuitting });
    mainWindow = null;
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    desktopLog("error", "window_load_failed", { errorCode, errorDescription, url: String(validatedURL || "").split("?")[0], isMainFrame });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    desktopLog("error", "render_process_gone", { reason: details?.reason, exitCode: details?.exitCode, crashed: details?.reason === "crashed" });
    scheduleRendererRecovery(details);
  });
  void mainWindow.loadURL(runtimeConfig.appUrl).catch((error) => {
    desktopLog("error", "window_load_promise_rejected", { error, url: runtimeConfig.appUrl.split("?")[0] });
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAppNavigation(url)) return { action: "allow" };
    openSafeExternalUrl(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  desktopLog("info", "app_ready", { version: app.getVersion(), debug: desktopDebugEnabled, logPath: desktopLogPath });
  // O AUMID precisa ser o mesmo appId do instalador para o Windows resolver
  // o atalho, a busca e as notificações usando a identidade atual do Telai.
  app.setAppUserModelId("com.mirante.share");
  ensureLaunchAtLoginDefault();
  configureAutoUpdater();
  createTray();
  await startEmbeddedServer();
  configureMediaPermissionHandler();
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      pendingDisplayRequest = callback;
      const sources = await collectDisplaySources();
      desktopLog("debug", "display_media_sources_ready", { count: sources.length, videoRequested: request.videoRequested });

      // A cancel can arrive while the operating system is enumerating sources.
      if (pendingDisplayRequest !== callback) return;
      if (!request.videoRequested || !sources.length) {
        return finishDisplayMediaRequest(callback);
      }
      sendToMainWindow("display-media-sources", sources);
    } catch (error) {
      desktopLog("error", "display_media_sources_error", { error });
      finishDisplayMediaRequest(callback);
    }
  });

  ipcMain.handle("display-media-sources", async () => {
    try {
      const sources = await collectDisplaySources();
      desktopLog("debug", "display_media_sources_ipc", { count: sources.length });
      return sources;
    } catch (error) {
      desktopLog("error", "display_media_sources_ipc_error", { error });
      return [];
    }
  });

  ipcMain.on("display-media-select", (_event, sourceId, options = {}) => {
    const callback = pendingDisplayRequest;
    const source = sourcesById.get(sourceId);
    if (callback && source) {
      desktopLog("debug", "display_media_selected", { kind: source.id.startsWith("window:") ? "window" : "screen", audioMode: options.audioMode || "none" });
      const streams = { video: source };
      // O áudio filtrado do app Windows é montado pelo bridge WASAPI em workers
      // separados. Só peça o loopback bruto quando o renderer realmente optar
      // por ele; caso contrário, a trilha de áudio será criada pelo bridge.
      if (options.audioMode === "system") streams.audio = "loopback";
      finishDisplayMediaRequest(callback, streams);
      return;
    }
    finishDisplayMediaRequest(callback);
  });

  ipcMain.on("display-media-cancel", () => {
    desktopLog("debug", "display_media_cancelled", { pending: Boolean(pendingDisplayRequest) });
    finishDisplayMediaRequest(pendingDisplayRequest);
  });

  createWindow();
  if (app.isPackaged && process.platform === "win32") {
    setTimeout(() => checkForUpdatesInBackground(), 10000);
    updateCheckTimer = setInterval(() => checkForUpdatesInBackground(), 30 * 60 * 1000);
  }
  app.on("activate", () => {
    desktopLog("debug", "app_activated");
    showMainWindow();
  });
}).catch((error) => {
  desktopLog("error", "app_ready_failed", { error });
  isQuitting = true;
  app.quit();
});

app.on("window-all-closed", () => {
  // O Telai continua na bandeja até o usuário escolher "Sair" no menu.
});

app.on("before-quit", () => {
  desktopLog("info", "app_before_quit");
  isQuitting = true;
});

app.on("render-process-gone", (_event, webContents, details) => {
  desktopLog("error", "app_render_process_gone", {
    reason: details?.reason,
    exitCode: details?.exitCode,
    url: String(webContents?.getURL?.() || "").split("?")[0],
  });
  if (webContents === mainWindow?.webContents) scheduleRendererRecovery(details);
});

app.on("child-process-gone", (_event, details) => {
  desktopLog(details?.type === "GPU" ? "error" : "warn", "child_process_gone", {
    type: details?.type,
    name: details?.name,
    reason: details?.reason,
    exitCode: details?.exitCode,
  });
});

app.on("will-quit", () => {
  desktopLog("info", "app_will_quit");
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (rendererRecoveryTimer) clearTimeout(rendererRecoveryTimer);
  globalShortcut.unregisterAll();
  void stopWindowAudioCapture();
  tray?.destroy();
  embeddedServer?.close();
});
