const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("miranteDesktop", {
  isDesktop: true,
  getVersion() {
    return ipcRenderer.invoke("app-get-version");
  },
  copyText(value) {
    return ipcRenderer.invoke("clipboard-write-text", String(value ?? ""));
  },
  getLaunchAtLogin() {
    return ipcRenderer.invoke("app-get-launch-at-login");
  },
  setLaunchAtLogin(enabled) {
    return ipcRenderer.invoke("app-set-launch-at-login", Boolean(enabled));
  },
  getHardwareAcceleration() {
    return ipcRenderer.invoke("app-get-hardware-acceleration");
  },
  setHardwareAcceleration(mode) {
    return ipcRenderer.invoke("app-set-hardware-acceleration", mode);
  },
  setTheme(theme) {
    ipcRenderer.send("app-set-theme", theme);
  },
  toggleWindowFullscreen(active) {
    return ipcRenderer.invoke("window-toggle-fullscreen", typeof active === "boolean" ? active : null);
  },
  onWindowFullscreen(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("window-fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("window-fullscreen-changed", listener);
  },
  setTrayStatus(status = {}) {
    ipcRenderer.send("app-set-tray-status", status);
  },
  setPushToTalkKey(code) {
    return ipcRenderer.invoke("app-set-push-to-talk-key", code);
  },
  setMuteShortcut(shortcut) {
    return ipcRenderer.invoke("app-set-mute-shortcut", shortcut);
  },
  onPushToTalk(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app-push-to-talk", listener);
    return () => ipcRenderer.removeListener("app-push-to-talk", listener);
  },
  onMuteShortcut(callback) {
    const listener = () => callback();
    ipcRenderer.on("app-mute-shortcut", listener);
    return () => ipcRenderer.removeListener("app-mute-shortcut", listener);
  },
  onTrayAction(callback) {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("app-tray-action", listener);
    return () => ipcRenderer.removeListener("app-tray-action", listener);
  },
  checkForUpdates() {
    return ipcRenderer.invoke("app-check-for-updates");
  },
  downloadUpdate() {
    return ipcRenderer.invoke("app-download-update");
  },
  installUpdate() {
    return ipcRenderer.invoke("app-install-update");
  },
  onUpdateStatus(callback) {
    ipcRenderer.on("app-update-status", (_event, status) => callback(status));
  },
  onDisplayMediaSources(callback) {
    ipcRenderer.on("display-media-sources", (_event, sources) => callback(sources));
  },
  getDisplayMediaSources() {
    return ipcRenderer.invoke("display-media-sources");
  },
  selectDisplaySource(sourceId, options = {}) {
    ipcRenderer.send("display-media-select", sourceId, options);
  },
  cancelDisplaySource() {
    ipcRenderer.send("display-media-cancel");
  },
  startWindowAudio(processId) {
    return ipcRenderer.invoke("window-audio-start", processId);
  },
  startSystemAudio() {
    return ipcRenderer.invoke("system-audio-start");
  },
  stopWindowAudio() {
    return ipcRenderer.invoke("window-audio-stop");
  },
  onWindowAudioChunk(callback) {
    const listener = (_event, chunk) => callback(chunk);
    ipcRenderer.on("window-audio-chunk", listener);
    return () => ipcRenderer.removeListener("window-audio-chunk", listener);
  },
  onWindowAudioStatus(callback) {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("window-audio-status", listener);
    return () => ipcRenderer.removeListener("window-audio-status", listener);
  },
});
