import assert from "node:assert/strict";
import { createGroupRuntime } from "../server/domain/groups/runtime.mjs";

const sent = [];
const left = [];
const disconnects = [];
const published = [];
const groupPresence = new Map([["group-1:user-1", Date.now()]]);
const matchingParticipant = { user: { id: "user-1" }, readyState: 1 };
const otherParticipant = { user: { id: "user-2" }, readyState: 1 };
const voiceRooms = new Map([
  ["voice-1", { groupId: "group-1", participants: new Map([["one", matchingParticipant], ["two", otherParticipant]]) }],
  ["voice-2", { groupId: "group-2", participants: new Map([["three", { user: { id: "user-1" } }]]) }],
]);
const runtime = createGroupRuntime({
  voiceRooms,
  groupPresence,
  send: (participant, message) => sent.push({ participant, message }),
  leaveVoiceRoom: (participant) => left.push(participant),
  disconnectUserFromGroup: (...args) => disconnects.push(args),
  publishGroupPresence: async (...args) => published.push(args),
});

await runtime.disconnectGroupUser("group-1", "user-1", "ban");
assert.equal(sent.length, 1);
assert.deepEqual(sent[0].message, { type: "voice-disconnected", reason: "ban", message: "Você foi banido deste grupo." });
assert.deepEqual(left, [matchingParticipant]);
assert.equal(groupPresence.has("group-1:user-1"), false);
assert.deepEqual(disconnects, [["group-1", "user-1", "ban"]]);
assert.deepEqual(published, [["group-1"]]);
assert.equal(voiceRooms.get("voice-2").participants.size, 1);

console.log(JSON.stringify({ ok: true, voiceIsolation: true, presenceRemoved: true, eventsPublished: true }));
