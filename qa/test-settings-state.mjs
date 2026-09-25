import assert from "node:assert/strict";
import { createSettingsStateStore } from "../frontend/src/features/settings/settings-state.js";

const store = createSettingsStateStore();
const updates = [];
const unsubscribe = store.subscribe((state) => updates.push(state));

assert.equal(store.getState().settingsTab, "user");
assert.equal(store.getState().settingsSection, "profile");
assert.deepEqual(store.getState().channelGames, []);

store.setState({ settingsSection: "channel", channelGames: ["RPG"] });
assert.equal(store.getState().settingsSection, "channel");
assert.deepEqual(store.getState().channelGames, ["RPG"]);

store.setState((state) => ({
  settingsTab: state.settingsTab === "user" ? "group" : "user",
  settingsBusy: true,
}));
assert.equal(store.getState().settingsTab, "group");
assert.equal(store.getState().settingsBusy, true);

store.reset();
assert.equal(store.getState().settingsTab, "user");
assert.equal(store.getState().settingsSection, "profile");
assert.deepEqual(store.getState().channelGames, []);
assert.ok(updates.length >= 4);

unsubscribe();
console.log(JSON.stringify({ ok: true, checks: 10, updates: updates.length }));
