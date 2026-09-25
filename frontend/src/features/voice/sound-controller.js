export const SOUND_PREFERENCE_DEFAULTS = Object.freeze({
  enabled: true,
  volume: 0.55,
  enter: true,
  leave: true,
  mute: true,
  unmute: true,
  message: true,
  notification: true,
});

const SOUND_PATTERNS = Object.freeze({
  enter: [{ frequency: 520, duration: 0.1, offset: 0 }, { frequency: 740, duration: 0.13, offset: 0.08 }],
  leave: [{ frequency: 660, duration: 0.1, offset: 0 }, { frequency: 440, duration: 0.15, offset: 0.08 }],
  mute: [{ frequency: 300, duration: 0.12, offset: 0 }],
  unmute: [{ frequency: 560, duration: 0.12, offset: 0 }],
  deafen: [{ frequency: 260, duration: 0.12, offset: 0 }],
  undeafen: [{ frequency: 520, duration: 0.12, offset: 0 }],
  message: [{ frequency: 880, duration: 0.08, offset: 0 }, { frequency: 1040, duration: 0.1, offset: 0.08 }],
  notification: [{ frequency: 740, duration: 0.09, offset: 0 }, { frequency: 988, duration: 0.12, offset: 0.09 }],
});

function clampVolume(value, fallback = SOUND_PREFERENCE_DEFAULTS.volume) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

function getStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; } catch { return null; }
}

export function readSoundPreferences(storage) {
  const targetStorage = getStorage(storage);
  try {
    const parsed = JSON.parse(targetStorage?.getItem?.("mirante-sound-preferences") || "null");
    if (!parsed || typeof parsed !== "object") throw new Error("invalid sound preferences");
    return { ...SOUND_PREFERENCE_DEFAULTS, ...parsed, volume: clampVolume(parsed.volume) };
  } catch {
    return { ...SOUND_PREFERENCE_DEFAULTS, enabled: targetStorage?.getItem?.("mirante-voice-sounds") !== "false" };
  }
}

export function createVoiceSoundController({
  getState = () => ({}),
  setState = () => {},
  storage,
  windowRef = globalThis.window,
} = {}) {
  let audioContext = null;
  let pendingNotificationSound = false;

  function currentPreferences() {
    return { ...SOUND_PREFERENCE_DEFAULTS, ...(getState()?.soundPreferences || {}) };
  }

  function getAudioContext() {
    const AudioContextConstructor = windowRef?.AudioContext || windowRef?.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    audioContext ||= new AudioContextConstructor();
    if (audioContext.state === "suspended") void audioContext.resume?.().catch(() => {});
    return audioContext;
  }

  function getCurrentAudioContext() {
    return audioContext;
  }

  function soundEnabled(kind) {
    const state = getState() || {};
    const preferences = currentPreferences();
    return Boolean(preferences.enabled && preferences[kind] !== false && !state.voiceDeafened);
  }

  function updateSoundPreference(key, value) {
    const next = { ...currentPreferences(), [key]: key === "volume" ? clampVolume(value) : value };
    setState({ soundPreferences: next, voiceSoundEffects: Boolean(next.enabled) });
    const targetStorage = getStorage(storage);
    targetStorage?.setItem?.("mirante-sound-preferences", JSON.stringify(next));
    targetStorage?.setItem?.("mirante-voice-sounds", String(next.enabled));
  }

  function playVoiceSound(kind) {
    if (!soundEnabled(kind)) return;
    const context = getAudioContext();
    if (!context) return;
    if (kind === "notification" && context.state === "suspended") {
      pendingNotificationSound = true;
      return;
    }
    if (kind === "notification") pendingNotificationSound = false;
    const state = getState() || {};
    const preferences = currentPreferences();
    const outputVolume = clampVolume(state.voiceOutputVolume, 1);
    const now = context.currentTime;
    for (const tone of SOUND_PATTERNS[kind] || []) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.offset);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(180, tone.frequency * 0.92), now + tone.offset + tone.duration);
      gain.gain.setValueAtTime(0.0001, now + tone.offset);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.055 * preferences.volume * outputVolume), now + tone.offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.offset + tone.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + tone.offset);
      oscillator.stop(now + tone.offset + tone.duration + 0.02);
    }
  }

  function resumePendingNotificationSound() {
    if (!pendingNotificationSound) return;
    const context = getAudioContext();
    if (!context?.resume) return;
    void context.resume().then(() => {
      if (!pendingNotificationSound) return;
      if (soundEnabled("notification")) {
        pendingNotificationSound = false;
        playVoiceSound("notification");
      } else {
        pendingNotificationSound = false;
      }
    }).catch(() => {});
  }

  function previewVoiceSound(kind) {
    const previous = currentPreferences();
    const previewPreferences = { ...previous, enabled: true, [kind]: true };
    const playPreview = () => {
      setState({ soundPreferences: previewPreferences, voiceSoundEffects: true });
      try { playVoiceSound(kind); }
      finally { setState({ soundPreferences: previous, voiceSoundEffects: Boolean(previous.enabled) }); }
    };
    const context = getAudioContext();
    if (context?.state === "suspended") void context.resume().then(playPreview).catch(() => {});
    else playPreview();
  }

  return {
    getAudioContext,
    getCurrentAudioContext,
    soundEnabled,
    updateSoundPreference,
    playVoiceSound,
    previewVoiceSound,
    resumePendingNotificationSound,
  };
}

