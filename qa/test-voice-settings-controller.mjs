import assert from "node:assert/strict";
import { createSettingsController } from "../frontend/src/features/settings/controller.js";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

let state = {
  voiceInputProfile: "isolation",
  voiceNoiseMode: "native",
  voiceNoiseSuppressionStatus: "idle",
  voiceSensitivityAuto: true,
  voiceSensitivity: 0.5,
  voiceAdvancedOpen: false,
  voiceAdvancedOptions: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};
let reapplyCount = 0;
let calibrationCount = 0;
const controller = createSettingsController({
  api: async () => ({}),
  getState: () => state,
  setState: (next) => { state = { ...state, ...next }; },
  qualityProfiles: { balanced: {} },
  visualDefaults: { dark: { button: "#000000", input: "#000000", background: "#000000" } },
  VoicePreferenceMap: Map,
  normalizeAudioVolume: (value, fallback = 1) => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : fallback,
  readStoredVoiceDeviceId: () => "",
  loadStreams: async () => {},
  syncDesktopShortcuts: async () => {},
  reapplyVoiceInputSettings: async () => { reapplyCount += 1; },
  resetVoiceActivityCalibration: () => { calibrationCount += 1; },
  effectiveVoiceOutputVolume: () => 1,
  voicePreferenceTargetId: (id) => id,
  soundPreferenceDefaults: { enabled: true, volume: 1 },
  reportClientError: () => {},
});

await controller.applyVoiceInputProfile("studio");
assert.equal(state.voiceInputProfile, "studio");
assert.equal(state.voiceNoiseMode, "off");
assert.equal(state.voiceNoiseSuppressionStatus, "off");
assert.equal(storage.get("mirante-voice-profile"), "studio");
assert.equal(reapplyCount, 1);

controller.updateVoiceAdvancedOption("noiseSuppression", { currentTarget: { checked: false } });
assert.equal(state.voiceInputProfile, "custom");
assert.equal(state.voiceAdvancedOptions.noiseSuppression, false);
assert.equal(state.voiceNoiseSuppressionStatus, "off");
assert.equal(storage.get("mirante-voice-advanced"), JSON.stringify(state.voiceAdvancedOptions));

await controller.applyVoiceNoiseMode("native");
assert.equal(state.voiceAdvancedOptions.noiseSuppression, true);
assert.equal(state.voiceNoiseSuppressionStatus, "idle");
assert.equal(reapplyCount, 3);

controller.updateVoiceSensitivityAuto({ currentTarget: { checked: false } });
controller.updateVoiceSensitivity({ currentTarget: { value: "75" } });
controller.updateVoiceSensitivity({ target: { value: "68" } });
controller.toggleVoiceAdvanced({ currentTarget: { checked: true } });
assert.equal(state.voiceSensitivityAuto, false);
assert.equal(state.voiceSensitivity, 0.68);
assert.equal(storage.get("mirante-voice-sensitivity"), "68");
assert.equal(state.voiceAdvancedOpen, true);
assert.equal(calibrationCount, 3);

const beforeUnknown = JSON.stringify(state.voiceAdvancedOptions);
controller.updateVoiceAdvancedOption("unknown", { currentTarget: { checked: true } });
assert.equal(JSON.stringify(state.voiceAdvancedOptions), beforeUnknown);

console.log("voice settings controller: ok");
