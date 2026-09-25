import assert from "node:assert/strict";
import { createMessageStateStore, MESSAGE_STATE_DEFAULTS } from "../frontend/src/features/groups/message-state.js";

const updates = [];
const store = createMessageStateStore({ messageDraft: "oi", activeGroupThread: { id: "thread-1" } });
const unsubscribe = store.subscribe((state) => updates.push({ ...state }));

assert.equal(store.getState().messageDraft, "oi");
assert.deepEqual(store.getState().activeGroupThread, { id: "thread-1" });
store.setState({ editingMessageId: "message-1", mentionActiveIndex: 2 });
assert.equal(store.getState().editingMessageId, "message-1");
assert.equal(store.getState().mentionActiveIndex, 2);
store.setState((state) => ({ messageDraft: `${state.messageDraft}!`, groupThreadBusy: true }));
assert.equal(store.getState().messageDraft, "oi!");
assert.equal(store.getState().groupThreadBusy, true);

unsubscribe();
store.setState({ groupMessageSearchQuery: "hello" });
assert.equal(updates.length, 3);
assert.equal(store.getState().groupMessageSearchQuery, "hello");
store.reset();
assert.deepEqual(store.getState().messageDraft, MESSAGE_STATE_DEFAULTS.messageDraft);
assert.deepEqual(store.getState().messageAttachments, []);
assert.notEqual(store.getState().messageAttachments, MESSAGE_STATE_DEFAULTS.messageAttachments);

console.log(JSON.stringify({ ok: true, checks: 11, updates: updates.length }));
