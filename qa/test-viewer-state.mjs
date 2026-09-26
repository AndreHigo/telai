import assert from "node:assert/strict";
import { createViewerStateStore, VIEWER_STATE_DEFAULTS } from "../frontend/src/features/shell/viewer-state.js";

const store = createViewerStateStore({ isViewer: true, viewerRoomId: "room-1" });
assert.equal(store.getState().isViewer, true);
assert.equal(store.getState().viewerRoomId, "room-1");
assert.equal(store.getState().viewerStreamPath, "");

store.setState({ viewerStreamPath: "/public/live", viewerParentFullscreen: true });
assert.equal(store.getState().viewerStreamPath, "/public/live");
assert.equal(store.getState().viewerParentFullscreen, true);
store.reset();
assert.deepEqual(store.getState(), VIEWER_STATE_DEFAULTS);

console.log(JSON.stringify({ ok: true, checks: 6, routeState: true, reset: true }));
