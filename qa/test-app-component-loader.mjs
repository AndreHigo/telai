import assert from "node:assert/strict";
import { createAppComponentLoaders } from "../frontend/src/app/component-loader-registry.js";

const assigned = [];
const errors = [];
const loaders = createAppComponentLoaders({
  setComponent: (name, component) => assigned.push({ name, component }),
  reportClientError: (kind, error) => errors.push({ kind, message: error.message }),
});

const expected = [
  "loadGroupTextWorkspace",
  "loadGroupVoiceWorkspace",
  "loadGroupMessageSearchDialog",
  "loadGroupThreadDialog",
  "loadGroupChannelPermissionsSettings",
  "loadGroupAuditLogSettings",
  "loadSettingsPage",
  "loadMultistreamPage",
  "loadContextMenus",
  "loadGroupDialogs",
  "loadBroadcastDialogs",
  "loadProfileSettingsExtras",
  "loadVoiceSettingsPanel",
];

assert.deepEqual(Object.keys(loaders), expected);
for (const loader of Object.values(loaders)) assert.equal(typeof loader, "function");
assert.throws(() => createAppComponentLoaders(), /setComponent/);
assert.equal(assigned.length, 0);
assert.equal(errors.length, 0);

console.log(JSON.stringify({ ok: true, loaders: expected.length }));
