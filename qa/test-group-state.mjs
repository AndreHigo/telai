import assert from "node:assert/strict";
import { createGroupStateStore, GROUP_STATE_DEFAULTS } from "../frontend/src/features/groups/group-state.js";

const updates = [];
const store = createGroupStateStore({ selectedGroupId: "group-1", groups: [{ id: "group-1" }] });
const unsubscribe = store.subscribe((state) => updates.push(state));

assert.equal(store.getState().selectedGroupId, "group-1");
assert.deepEqual(store.getState().groups, [{ id: "group-1" }]);
store.setState({ groupLoading: true, selectedRoomId: "room-1" });
assert.equal(store.getState().groupLoading, true);
assert.equal(store.getState().selectedRoomId, "room-1");
store.setState((state) => ({ groupLoadSequence: state.groupLoadSequence + 1 }));
assert.equal(store.getState().groupLoadSequence, 1);

unsubscribe();
store.setState({ selectedGroupId: "group-2" });
assert.equal(updates.length, 3);
assert.equal(store.getState().selectedGroupId, "group-2");
store.reset();
assert.equal(store.getState().selectedGroupId, GROUP_STATE_DEFAULTS.selectedGroupId);
assert.deepEqual(store.getState().groups, []);
assert.notEqual(store.getState().knownGroupMessageIds, GROUP_STATE_DEFAULTS.knownGroupMessageIds);

console.log(JSON.stringify({ ok: true, checks: 11, updates: updates.length }));
