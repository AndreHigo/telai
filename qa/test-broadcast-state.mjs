import assert from "node:assert/strict";
import { BROADCAST_STATE_DEFAULTS, createBroadcastStateStore } from "../frontend/src/features/broadcast/broadcast-state.js";

const store = createBroadcastStateStore({
  broadcastState: "starting",
  broadcastTitle: "Minha live",
  publicBroadcastCameraEnabled: true,
  broadcastDisplaySurface: "screen",
});

assert.equal(store.getState().broadcastState, "starting");
assert.equal(store.getState().broadcastTitle, "Minha live");
assert.equal(store.getState().publicBroadcastCameraEnabled, true);
assert.equal(store.getState().broadcastDisplaySurface, "screen");

store.setState({ broadcastState: "live", broadcastStreamId: "stream-1", showPublicBroadcastSetup: false });
assert.equal(store.getState().broadcastState, "live");
assert.equal(store.getState().broadcastStreamId, "stream-1");
assert.equal(store.getState().showPublicBroadcastSetup, false);

store.reset();
assert.deepEqual(store.getState(), BROADCAST_STATE_DEFAULTS);

console.log(JSON.stringify({ ok: true, checks: 8, reset: true, isolated: true }));
