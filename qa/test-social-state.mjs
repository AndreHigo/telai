import assert from "node:assert/strict";
import { createSocialStateStore } from "../frontend/src/features/social/social-state.js";

const store = createSocialStateStore();
const updates = [];
const unsubscribe = store.subscribe((state) => updates.push(state));

assert.deepEqual(store.getState().social.friends, []);
assert.equal(store.getState().socialSearchOpen, false);
assert.equal(store.getState().socialRefreshInFlight, false);

store.setState({
  social: { ...store.getState().social, friends: [{ id: "friend-1" }] },
  socialSearchOpen: true,
  socialSearchQuery: "andre",
});
assert.equal(store.getState().social.friends[0].id, "friend-1");
assert.equal(store.getState().socialSearchOpen, true);
assert.equal(store.getState().socialSearchQuery, "andre");

store.setState((state) => ({ socialActionId: `follow:${state.social.friends[0].id}`, socialRefreshInFlight: true }));
assert.equal(store.getState().socialActionId, "follow:friend-1");
assert.equal(store.getState().socialRefreshInFlight, true);

store.reset();
assert.deepEqual(store.getState().social, {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  following: [],
  blocked: [],
  counts: { friends: 0, incomingRequests: 0, following: 0, blocked: 0 },
});
assert.equal(store.getState().socialSearchQuery, "");
assert.ok(updates.length >= 4);

unsubscribe();
console.log(JSON.stringify({ ok: true, checks: 10, updates: updates.length }));
