import assert from "node:assert/strict";
import {
  createVoiceShortcutController,
  isEditableElement,
  isReservedSystemShortcut,
  pushToTalkLabel,
  shortcutLabel,
} from "../frontend/src/features/voice/shortcut-controller.js";

assert.equal(pushToTalkLabel("Space"), "Espaço");
assert.equal(pushToTalkLabel("KeyM"), "M");
assert.equal(shortcutLabel("mouse:4"), "Botão lateral 2");
assert.equal(isEditableElement({ matches: (selector) => selector.includes("textarea") }), true);
assert.equal(isReservedSystemShortcut({ code: "KeyA", altKey: true }), true);

const storageValues = new Map();
const storage = {
  setItem(key, value) { storageValues.set(key, String(value)); },
  removeItem(key) { storageValues.delete(key); },
};
const desktopCalls = [];
const desktop = {
  async setPushToTalkKey(value) { desktopCalls.push(["ptt", value]); return { ok: true, global: true }; },
  async setMuteShortcut(value) { desktopCalls.push(["mute", value]); return { ok: true, global: true }; },
};
const state = {
  isDesktop: true,
  voiceState: "connected",
  pushToTalkEnabled: true,
  pushToTalkKey: "KeyV",
  pushToTalkActive: false,
  pushToTalkCapturing: false,
  desktopPushToTalkGlobal: false,
  muteShortcut: "",
  muteShortcutCapturing: false,
  desktopMuteShortcutGlobal: false,
  settingsError: "",
};
const patches = [];
const muted = [];
let toggles = 0;
const controller = createVoiceShortcutController({
  getState: () => state,
  setState: (patch) => { Object.assign(state, patch); patches.push(patch); },
  setVoiceMuted: (value) => { muted.push(value); return true; },
  toggleVoiceMute: () => { toggles += 1; },
  desktop,
  storage,
});

controller.startPushToTalkCapture();
assert.equal(state.pushToTalkCapturing, true);
controller.handlePushToTalkKeyDown({ code: "KeyX", preventDefault() {} });
assert.equal(state.pushToTalkKey, "KeyX");
assert.equal(storageValues.get("mirante-push-to-talk"), "KeyX");

state.desktopPushToTalkGlobal = false;
state.pushToTalkKey = "KeyV";
controller.handlePushToTalkKeyDown({ code: "KeyV", repeat: false, target: null, preventDefault() {} });
assert.equal(state.pushToTalkActive, true);
assert.deepEqual(muted.at(-1), false);
controller.handlePushToTalkKeyUp({ code: "KeyV", altKey: false, metaKey: false, preventDefault() {} });
assert.equal(state.pushToTalkActive, false);
assert.deepEqual(muted.at(-1), true);

controller.startMuteShortcutCapture();
controller.handleMuteShortcutMouseDown({ button: 4, target: null, preventDefault() {}, stopPropagation() {} });
assert.equal(state.muteShortcut, "mouse:4");
assert.equal(shortcutLabel(state.muteShortcut), "Botão lateral 2");
controller.handleMuteShortcutMouseDown({ button: 4, target: null, preventDefault() {} });
assert.equal(toggles, 1);

await controller.syncDesktopShortcuts();
assert.deepEqual(desktopCalls.at(-2), ["ptt", "KeyV"]);
assert.deepEqual(desktopCalls.at(-1), ["mute", "mouse:4"]);
assert.equal(state.desktopPushToTalkGlobal, true);
assert.equal(state.desktopMuteShortcutGlobal, true);

controller.clearMuteShortcut();
assert.equal(state.muteShortcut, "");
assert.equal(storageValues.has("mirante-mute-shortcut"), false);

console.log(JSON.stringify({ ok: true, checks: 23 }));
