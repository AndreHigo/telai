import assert from "node:assert/strict";
import { createNavigationController } from "../frontend/src/features/shell/navigation-controller.js";

const state = {
  compactViewport: false,
  globalSidebarCollapsed: false,
  groupPickerQuery: "grupo",
  groupsWorkspaceOpen: true,
  multistreamOpen: true,
  showGlobalSidebar: true,
  showMobileChannels: true,
  showMobileMembers: true,
  view: "home",
};
const calls = [];
const setState = (next) => Object.assign(state, next);
const asyncCall = (name) => async (...args) => { calls.push([name, ...args]); };
const controller = createNavigationController({
  getState: () => state,
  setState,
  loadGroups: asyncCall("groups"),
  loadStreams: asyncCall("streams"),
  loadNotifications: asyncCall("notifications"),
  loadDirectConversations: asyncCall("direct"),
  loadSocial: asyncCall("social"),
  loadGroup: asyncCall("group"),
  setNotice: (message) => calls.push(["notice", message]),
  setNotificationsError: (message) => calls.push(["notifications-error", message]),
  setDirectConversationError: (message) => calls.push(["direct-error", message]),
  setSocialError: (message) => calls.push(["social-error", message]),
});

controller.selectView("live");
await Promise.resolve();
assert.equal(state.view, "live");
assert.equal(state.multistreamOpen, false);
assert.ok(calls.some(([name]) => name === "streams"));

controller.setGroupsView({ openWorkspace: false });
assert.equal(state.view, "groups");
assert.equal(state.groupsWorkspaceOpen, false);
assert.equal(state.globalSidebarCollapsed, true);
assert.equal(state.groupPickerQuery, "");
assert.equal(state.showMobileChannels, false);
assert.equal(state.showMobileMembers, false);

state.compactViewport = true;
controller.toggleGlobalNavigation();
assert.equal(state.showGlobalSidebar, true);
controller.toggleGlobalNavigation();
assert.equal(state.showGlobalSidebar, false);

await controller.openGroupWorkspace("group-1");
await Promise.resolve();
assert.equal(state.groupsWorkspaceOpen, true);
assert.ok(calls.some(([name, id]) => name === "group" && id === "group-1"));

console.log(JSON.stringify({ ok: true, checks: 12 }));
