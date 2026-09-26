import assert from "node:assert/strict";
import { createBroadcastSetupController } from "../frontend/src/features/broadcast/setup-controller.js";

const updates = [];
const navigation = [];
const notices = [];
const state = {
  broadcastState: "idle",
  broadcastTitle: "",
  broadcastCameraDeviceId: "camera-1",
  selectedQuality: "high",
  user: { displayName: "Ana" },
  view: "home",
  selectedRoom: null,
  selectedGroupId: null,
  pendingBroadcastSourceType: "screen",
  publicBroadcastTitle: "Live de teste",
  publicBroadcastSourceKind: "screen",
  publicBroadcastMicrophoneEnabled: true,
  publicBroadcastCameraEnabled: true,
  publicBroadcastCameraDeviceId: "camera-2",
  publicBroadcastQuality: "balanced",
  publicBroadcastReviewSelection: null,
};
const controller = createBroadcastSetupController({
  beginBroadcast: async (options) => updates.push(["begin", options]),
  getState: () => state,
  publicBroadcastSourceLabel: (kind) => kind === "screen" ? "Tela inteira" : "Janela",
  setAudioMode: (value) => updates.push(["audio", value]),
  setNavigationState: (value) => navigation.push(value),
  setNotice: (value) => notices.push(value),
  setSelectedQuality: (value) => updates.push(["quality", value]),
  setState: (value) => { Object.assign(state, value); updates.push(value); },
});

controller.requestBroadcastStart("screen");
assert.equal(state.showPublicBroadcastSetup, true);
assert.equal(state.publicBroadcastQuality, "balanced");
await controller.confirmPublicBroadcastSetup();
assert.deepEqual(updates.filter((item) => Array.isArray(item)).slice(-3), [["quality", "balanced"], ["audio", "system"], ["begin", { sourceType: "screen", visibility: "public", title: "Transmissão de Ana" }]]);
assert.deepEqual(navigation.at(-1), { view: "broadcast" });
assert.match(notices.at(-1), /tela inteira/);

const review = controller.waitForPublicBroadcastReview();
assert.equal(state.showPublicBroadcastReview, true);
controller.confirmPublicBroadcastReview();
assert.equal(await review, true);

console.log(JSON.stringify({ ok: true, checks: 8 }));
