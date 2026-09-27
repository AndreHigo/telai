import assert from "node:assert/strict";
import { createAccountController } from "../frontend/src/features/shell/account-controller.js";

const state = { menuVisible: true, settingsSection: "profile", opened: [] };
let scrollOptions = null;
let tickCount = 0;
const documentObject = {
  querySelector(selector) {
    assert.equal(selector, ".settings-layout .settings-content > form:nth-of-type(2)");
    return { scrollIntoView(options) { scrollOptions = options; } };
  },
};
const controller = createAccountController({
  openSettings: async (tab) => state.opened.push(tab),
  setSettingsState: (next) => Object.assign(state, next),
  setUserMenuVisible: (value) => { state.menuVisible = value; },
  tick: async () => { tickCount += 1; },
  documentObject,
});

await controller.openDestination("channel");
assert.deepEqual(state.opened, ["user"]);
assert.equal(state.settingsSection, "channel");
assert.equal(state.menuVisible, false);

state.menuVisible = true;
await controller.openDestination("preferences");
assert.equal(tickCount, 1);
assert.deepEqual(scrollOptions, { behavior: "smooth", block: "start" });
assert.equal(state.menuVisible, false);

controller.handleGlobalClick({ target: { closest: () => null } });
assert.equal(state.menuVisible, false);
state.menuVisible = true;
controller.handleGlobalClick({ target: { closest: () => ({}) } });
assert.equal(state.menuVisible, true);

console.log(JSON.stringify({ ok: true, checks: 8 }));
