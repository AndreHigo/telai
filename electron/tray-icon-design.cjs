const TRAY_STATES = Object.freeze(["idle", "connected", "live", "camera", "sharing", "voice", "muted", "deafened"]);

function trayStateForStatus(status = {}) {
  const connected = Boolean(status.connected);
  const sharing = Boolean(status.sharing);
  const live = Boolean(status.live);
  const camera = Boolean(status.camera);
  const voice = Boolean(status.voice);
  const muted = Boolean(status.muted);
  const deafened = Boolean(status.deafened);
  return deafened ? "deafened" : muted ? "muted" : voice ? "voice" : sharing ? "sharing" : live && camera ? "camera" : live ? "live" : connected ? "connected" : "idle";
}

function trayIconSvgForState(state = "idle") {
  const safeState = TRAY_STATES.includes(state) ? state : "idle";
  const accent = {
    deafened: "#bd8cff",
    muted: "#ff6657",
    voice: "#35dc9a",
    sharing: "#ffc247",
    camera: "#42d6ed",
    live: "#ff5368",
    connected: "#42dda0",
    idle: "#8393ae",
  }[safeState];
  const screen = "#091426";
  const mark = safeState === "sharing"
    ? `<path d="M32 39V23m0 0-7 7m7-7 7 7M21 40h22" fill="none" stroke="${accent}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>`
    : safeState === "camera"
      ? `<path d="M20 27h7l2.5-3.5H37v16H20z" fill="${accent}" stroke="${accent}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="29.5" cy="31.5" r="4.2" fill="${screen}"/><path d="m37 28 5-3v13l-5-3" fill="${accent}" stroke="${accent}" stroke-width="1.5" stroke-linejoin="round"/>`
      : safeState === "voice"
        ? `<rect x="27" y="22" width="10" height="19" rx="5" fill="${accent}"/><path d="M23 32v1a9 9 0 0 0 18 0v-1M32 42v4m-6 0h12" fill="none" stroke="${accent}" stroke-width="3.8" stroke-linecap="round"/>`
        : safeState === "muted"
          ? `<rect x="27" y="22" width="10" height="19" rx="5" fill="${accent}"/><path d="M23 32v1a9 9 0 0 0 18 0v-1M32 42v4m-6 0h12M21 23l22 21" fill="none" stroke="#fff0ed" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
          : safeState === "deafened"
            ? `<path d="M20 28h6l10-7v22l-10-7h-6z" fill="${accent}" stroke="${accent}" stroke-width="1.5" stroke-linejoin="round"/><path d="m38 27 7 10m0-10-7 10" fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round"/>`
            : safeState === "live"
              ? `<path d="M23 23v17l16-8.5z" fill="#fff"/><circle cx="18.5" cy="23" r="3.3" fill="${accent}"/>`
              : `<path d="M23 23v17l16-8.5z" fill="${safeState === "idle" ? "#9aabc6" : "#4b7cff"}"/>`;
  const signalColor = safeState === "idle" ? "#7586a2" : accent;
  const screenOutline = safeState === "idle" ? "#8292ad" : "#edf4ff";
  const statusPip = safeState === "idle" ? "" : `<circle cx="51" cy="47" r="5.7" fill="${accent}" stroke="#091426" stroke-width="2.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect x="4.5" y="14" width="48" height="35" rx="6" fill="#07101f" stroke="${screenOutline}" stroke-width="4.5"/><rect x="10" y="19.5" width="37" height="24" rx="2.5" fill="${screen}"/>${mark}<path d="M29 50v5m-11 4h28" fill="none" stroke="${screenOutline}" stroke-width="4.5" stroke-linecap="round"/><circle cx="50" cy="10.5" r="3.2" fill="#ff744a"/><path d="M52 9a8.5 8.5 0 0 1 8.5 8.5M52 5a12 12 0 0 1 12 12" fill="none" stroke="${signalColor}" stroke-width="3.6" stroke-linecap="round"/>${statusPip}</svg>`;
}

module.exports = { TRAY_STATES, trayStateForStatus, trayIconSvgForState };
