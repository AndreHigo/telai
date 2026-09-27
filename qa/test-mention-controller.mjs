import assert from "node:assert/strict";
import { createMentionController } from "../frontend/src/features/groups/mention-controller.js";

const state = { messageDraft: "Oi @al", mentionSuggestions: [], mentionStartIndex: -1, mentionActiveIndex: 0 };
const members = [
  { username: "alice", displayName: "Alice" },
  { username: "bob", displayName: "Bob" },
  { username: "alvaro", displayName: "Álvaro" },
];
const input = {
  value: state.messageDraft,
  selectionStart: state.messageDraft.length,
  focusCalled: false,
  focus() { this.focusCalled = true; },
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
};
const controller = createMentionController({
  getState: () => state,
  setState: (patch) => Object.assign(state, patch),
  getMembers: () => members,
  getInput: () => input,
  tick: async () => {},
});

controller.updateSuggestions({ currentTarget: input });
assert.deepEqual(state.mentionSuggestions.map((member) => member.username), ["alice", "alvaro"]);
assert.equal(state.mentionStartIndex, 3);

const arrow = { key: "ArrowDown", preventDefault() { this.prevented = true; } };
controller.handleKeydown(arrow);
assert.equal(arrow.prevented, true);
assert.equal(state.mentionActiveIndex, 1);

const enter = { key: "Enter", shiftKey: false, preventDefault() { this.prevented = true; }, currentTarget: input };
controller.handleKeydown(enter);
await Promise.resolve();
assert.equal(enter.prevented, true);
assert.equal(state.messageDraft, "Oi @alvaro ");
assert.equal(input.focusCalled, true);
assert.equal(state.mentionSuggestions.length, 0);

const submit = { key: "Enter", shiftKey: false, preventDefault() { this.prevented = true; }, currentTarget: { form: { requestSubmit() { this.submitted = true; } } } };
controller.handleKeydown(submit);
assert.equal(submit.currentTarget.form.submitted, true);

console.log(JSON.stringify({ ok: true, checks: 10 }));
