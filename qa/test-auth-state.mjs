import assert from "node:assert/strict";
import { createAuthStateStore } from "../frontend/src/features/auth/auth-state.js";

const store = createAuthStateStore();
const updates = [];
const unsubscribe = store.subscribe((state) => updates.push(state));

assert.deepEqual(store.getState().providers, { google: false, discord: false });
assert.equal(store.getState().authMode, "login");
assert.equal(store.getState().registerLegalAccepted, false);

store.setState({ authMode: "register", registerUsername: "andre.higo", registerLegalAccepted: true });
assert.equal(store.getState().authMode, "register");
assert.equal(store.getState().registerUsername, "andre.higo");
assert.equal(store.getState().registerLegalAccepted, true);

store.setState((state) => ({ authBusy: !state.authBusy, authError: "Falha de teste" }));
assert.equal(store.getState().authBusy, true);
assert.equal(store.getState().authError, "Falha de teste");

store.reset();
assert.equal(store.getState().authMode, "login");
assert.equal(store.getState().registerUsername, "");
assert.deepEqual(store.getState().providers, { google: false, discord: false });
assert.ok(updates.length >= 4);

unsubscribe();
console.log(JSON.stringify({ ok: true, checks: 10, updates: updates.length }));
