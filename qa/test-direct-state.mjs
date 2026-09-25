import assert from "node:assert/strict";
import { createDirectStateStore, DIRECT_STATE_DEFAULTS } from "../frontend/src/features/direct/direct-state.js";

const updates = [];
const store = createDirectStateStore({ directConversationId: "conversation-1", directMessages: [{ id: "message-1" }] });
const unsubscribe = store.subscribe((state) => updates.push({ ...state }));

assert.equal(store.getState().directConversationId, "conversation-1");
assert.deepEqual(store.getState().directMessages, [{ id: "message-1" }]);
store.setState({ directMessageDraft: "oi", directConversationSending: true });
assert.equal(store.getState().directMessageDraft, "oi");
assert.equal(store.getState().directConversationSending, true);
unsubscribe();
store.setState({ directConversationError: "falhou" });
assert.equal(updates.length, 2);
store.reset();
assert.equal(store.getState().directConversationId, DIRECT_STATE_DEFAULTS.directConversationId);
assert.deepEqual(store.getState().directMessages, []);

console.log(JSON.stringify({ ok: true, checks: 8, updates: updates.length }));
