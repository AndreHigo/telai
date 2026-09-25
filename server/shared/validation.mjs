export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function safePreferenceColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
}

export function normalizePreferenceVolume(value, fallback = 1) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(1, Math.max(0, numericValue)) : fallback;
}

export function normalizePreferenceDeviceId(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim().slice(0, 256);
  return normalized || null;
}

export function parseChannelGames(value) {
  let games = [];
  try { games = Array.isArray(value) ? value : JSON.parse(String(value || "[]")); } catch { games = []; }
  return [...new Set(games.map((game) => String(game || "").trim().slice(0, 32)).filter(Boolean))].slice(0, 8);
}
