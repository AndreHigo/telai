export function audioDeviceDisplayLabel(device, index, kind = "input") {
  const fallback = kind === "input" ? `Microfone ${index + 1}` : kind === "camera" ? `Câmera ${index + 1}` : `Saída de áudio ${index + 1}`;
  const rawLabel = String(device?.label || "").replace(/\s+/g, " ").trim();
  const role = /^(default)\s*[-:]\s*/i.test(rawLabel)
    ? "padrão"
    : /^communications?\s*[-:]\s*/i.test(rawLabel)
      ? "comunicações"
      : "";
  const cleanLabel = rawLabel.replace(/^(default|communications?)\s*[-:]\s*/i, "").trim() || fallback;
  return role ? `${cleanLabel} · ${role}` : cleanLabel;
}

export function normalizeAudioDeviceLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function rawAudioDeviceLabel(device) {
  return String(device?.rawLabel || device?.label || "").replace(/\s+/g, " ").trim();
}

export function readStoredVoiceDeviceId(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

export function readStoredVoiceDeviceLabel(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

export function isUnavailableVoiceInputError(error) {
  return ["NotFoundError", "OverconstrainedError"].includes(error?.name);
}

export function normalizeAudioVolume(value, fallback = 1) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(1, Math.max(0, numericValue)) : fallback;
}
