import assert from "node:assert/strict";
import { createReleaseNotesController } from "../frontend/src/features/shell/release-notes-controller.js";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};

const state = {
  desktopVersion: "0.2.68",
  isDesktop: true,
  releaseNotes: null,
  showReleaseNotes: false,
  showUserMenu: true,
  user: { id: "user-1" },
};
const notices = [];
const controller = createReleaseNotesController({
  getState: () => state,
  setState: (next) => Object.assign(state, next),
  setNotice: (message) => notices.push(message),
  webVersion: "2026-09-22",
});

controller.openReleaseNotes();
assert.equal(state.showReleaseNotes, true);
assert.equal(state.showUserMenu, false);
assert.equal(state.releaseNotes.platformLabel, "app desktop");

controller.dismissReleaseNotes();
assert.equal(state.showReleaseNotes, false);
assert.equal(storage.get("mirante-release-notes-seen:desktop:user-1"), "0.2.68");

controller.maybeShowReleaseNotes(state.user);
assert.equal(state.showReleaseNotes, false);
assert.deepEqual(notices, []);

console.log(JSON.stringify({ ok: true, checks: 8 }));
