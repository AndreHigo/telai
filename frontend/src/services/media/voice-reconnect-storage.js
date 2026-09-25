const DEFAULT_STORAGE_KEY = "mirante-voice-reconnect";
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function defaultStorage() {
  return typeof globalThis !== "undefined" && globalThis.localStorage ? globalThis.localStorage : null;
}

function normalizeSession(session, savedAt) {
  if (!session?.groupId || !session.voiceRoomId) return null;
  return {
    groupId: String(session.groupId).slice(0, 64),
    voiceRoomId: String(session.voiceRoomId).slice(0, 64),
    groupName: String(session.groupName || "grupo").slice(0, 80),
    roomName: String(session.roomName || "sala de voz").slice(0, 80),
    savedAt,
  };
}

export function createVoiceReconnectStorage({
  storage = defaultStorage(),
  key = DEFAULT_STORAGE_KEY,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  now = () => Date.now(),
  onError,
} = {}) {
  function read() {
    if (!storage) return null;
    try {
      const saved = JSON.parse(storage.getItem(key) || "null");
      if (!saved || typeof saved !== "object" || !saved.groupId || !saved.voiceRoomId) return null;
      const savedAt = Number(saved.savedAt || 0);
      if (!Number.isFinite(savedAt) || now() - savedAt > maxAgeMs) {
        storage.removeItem(key);
        return null;
      }
      return normalizeSession(saved, savedAt);
    } catch {
      storage.removeItem(key);
      return null;
    }
  }

  function write(session) {
    const next = normalizeSession(session, now());
    if (!next || !storage) return next;
    try {
      storage.setItem(key, JSON.stringify(next));
    } catch (error) {
      onError?.("voice_reconnect_persist_error", error);
    }
    return next;
  }

  function clear() {
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch (error) {
      onError?.("voice_reconnect_clear_error", error);
    }
  }

  return { clear, read, write };
}
