import assert from "node:assert/strict";
import { createLiveStateStore, LIVE_STATE_DEFAULTS } from "../frontend/src/features/live/live-state.js";

const store = createLiveStateStore({
  streams: [{ id: "stream-1" }],
  followingOnly: true,
  liveNotificationScopes: ["all", "related"],
  selectedStreams: new Set(["stream-1"]),
});

assert.equal(store.getState().streams[0].id, "stream-1");
assert.equal(store.getState().followingOnly, true);
assert.deepEqual(store.getState().liveNotificationScopes, ["all", "related"]);
assert.equal(store.getState().selectedStreams.has("stream-1"), true);

store.setState({ liveNotificationScope: "all", streamsRefreshInFlight: true });
assert.equal(store.getState().liveNotificationScope, "all");
assert.equal(store.getState().streamsRefreshInFlight, true);

store.reset();
assert.deepEqual(store.getState(), LIVE_STATE_DEFAULTS);
assert.notEqual(store.getState().liveNotificationScopes, LIVE_STATE_DEFAULTS.liveNotificationScopes);
assert.notEqual(store.getState().selectedStreams, LIVE_STATE_DEFAULTS.selectedStreams);

console.log(JSON.stringify({ ok: true, checks: 9, reset: true, isolated: true }));
