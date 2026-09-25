import assert from "node:assert/strict";
import { createNavigationStateStore, NAVIGATION_STATE_DEFAULTS } from "../frontend/src/features/shell/navigation-state.js";

const updates = [];
const store = createNavigationStateStore({ view: "groups", showMobileMembers: true });
const unsubscribe = store.subscribe((state) => updates.push({ ...state }));

assert.equal(store.getState().view, "groups");
assert.equal(store.getState().showMobileMembers, true);
store.setState({ view: "settings", compactViewport: true });
assert.equal(store.getState().view, "settings");
assert.equal(store.getState().compactViewport, true);

store.setState((state) => ({ view: state.view === "settings" ? "home" : "groups" }));
assert.equal(store.getState().view, "home");
unsubscribe();
store.setState({ view: "broadcast" });
assert.equal(updates.length, 3);
assert.equal(store.getState().view, "broadcast");

store.reset();
assert.deepEqual(store.getState(), NAVIGATION_STATE_DEFAULTS);
assert.equal(updates.at(-1).view, "home");
console.log(JSON.stringify({ ok: true, checks: 10, updates: updates.length }));
