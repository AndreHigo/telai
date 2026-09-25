import assert from "node:assert/strict";
import { createSettingsNavigationController } from "../frontend/src/features/settings/navigation-controller.js";

const state = {
  view: "groups",
  user: { displayName: "Andre", avatarData: "avatar" },
  selectedGroup: { name: "Colmeia" },
  selectedGroupId: "group-1",
  selectedInputDeviceId: "",
  selectedInputDeviceLabel: "",
  selectedOutputDeviceId: "output-1",
};
const calls = [];
const controller = createSettingsNavigationController({
  getState: () => state,
  setState: (next) => Object.assign(state, next),
  api: async (path) => { calls.push(["api", path]); return { channel: { displayName: "Canal", avatarData: "channel-avatar", games: ["Valorant"] } }; },
  readStoredVoiceDeviceId: (key) => key.includes("input") ? "input-1" : "output-stored",
  readStoredVoiceDeviceLabel: () => "Microfone principal",
  loadGroupAdministration: async () => calls.push(["group-admin"]),
  loadAudioDevices: async (permission) => calls.push(["devices", permission]),
  tick: async () => {},
  getSettingsPageElement: () => ({ scrollTo: (options) => calls.push(["scroll", options.top]) }),
});

await controller.openSettings("group");
assert.equal(state.view, "settings");
assert.equal(state.settingsTab, "group");
assert.equal(state.settingsSection, "group");
assert.equal(state.settingsReturnView, "groups");
assert.equal(state.settingsDisplayName, "Andre");
assert.equal(state.channelDisplayName, "Canal");
assert.deepEqual(state.channelGames, ["Valorant"]);
assert.equal(state.selectedInputDeviceId, "input-1");
assert.ok(calls.some(([name]) => name === "group-admin"));
assert.ok(calls.some(([name, permission]) => name === "devices" && permission === false));

controller.selectSettingsSection("voice", "user");
await Promise.resolve();
assert.equal(state.settingsSection, "voice");
assert.equal(state.settingsTab, "user");
assert.ok(calls.some(([name]) => name === "scroll"));

console.log(JSON.stringify({ ok: true, checks: 14 }));
