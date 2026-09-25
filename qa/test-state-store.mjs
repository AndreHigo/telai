import assert from "node:assert/strict";
import { createStateStore } from "../frontend/src/services/state-store.js";

const updates = [];
const store = createStateStore({ count: 0, label: "default" }, { count: 2 }, () => ({ count: 0, label: "reset" }));
const unsubscribe = store.subscribe((state) => updates.push({ ...state }));

assert.deepEqual(store.getState(), { count: 2, label: "default" });
store.setState((state) => ({ count: state.count + 1 }));
assert.equal(store.getState().count, 3);
unsubscribe();
store.setState({ label: "detached" });
assert.equal(updates.length, 2);
store.reset();
assert.deepEqual(store.getState(), { count: 0, label: "reset" });

console.log(JSON.stringify({ ok: true, checks: 7, updates: updates.length }));
