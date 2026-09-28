import assert from "node:assert/strict";
import { createVoiceParticipantStateController } from "../frontend/src/features/voice/participant-state.js";

let state = {
  groupOverview: {
    rooms: [
      { id: "room-1", participants: [{ id: "remote-old", userId: "user-1", connecting: true }] },
      { id: "room-2", participants: [] },
    ],
  },
  voiceRoomId: "room-1",
  voiceState: "connected",
  voiceParticipants: new Map([
    ["peer-local", { id: "peer-local", userId: "local", isLocal: true }],
    ["peer-2", { id: "peer-2", userId: "user-2", connecting: false }],
  ]),
  currentUserId: "local",
};
const updates = [];
const controller = createVoiceParticipantStateController({
  getState: () => state,
  setGroupState: (next) => {
    updates.push(next);
    state = { ...state, ...next };
  },
});

assert.deepEqual(controller.uniqueParticipants([
  { id: "remote-1", userId: "user-1", connecting: true },
  { id: "remote-2", userId: "user-1", connecting: false },
  { id: "local-1", userId: "user-2", isLocal: false },
  { id: "local-2", userId: "user-2", isLocal: true },
  { userId: "without-id" },
]), [
  { id: "remote-2", userId: "user-1", connecting: false },
  { id: "local-2", userId: "user-2", isLocal: true },
]);

controller.upsertRoomParticipant("room-1", { id: "remote-new", userId: "user-3", connecting: false });
assert.equal(updates.length, 1);
assert.deepEqual(state.groupOverview.rooms[0].participants, [
  { id: "remote-old", userId: "user-1", connecting: true },
  { id: "remote-new", userId: "user-3", connecting: false },
]);

controller.replaceRoomSnapshot("room-1", [
  { id: "duplicate-a", userId: "user-4", connecting: true },
  { id: "duplicate-b", userId: "user-4", connecting: false },
]);
assert.deepEqual(state.groupOverview.rooms[0].participants, [
  { id: "duplicate-b", userId: "user-4", connecting: false },
]);

controller.removeRoomParticipant("room-1", "missing", "user-4");
assert.deepEqual(state.groupOverview.rooms[0].participants, []);
controller.upsertRoomParticipant("room-1", { id: "local-pending", userId: "local", isLocal: true });
controller.upsertRoomParticipant("room-1", { id: "peer-live", userId: "user-5" });
controller.removeRoomParticipant("room-1", "peer-live");
assert.deepEqual(state.groupOverview.rooms[0].participants, []);

const merged = controller.mergeActivePresence({
  rooms: [
    { id: "room-1", participants: [{ id: "overview-local", userId: "local" }, { id: "overview-other", userId: "user-6" }] },
    { id: "room-2", participants: [{ id: "other-room", userId: "user-7" }] },
  ],
});
assert.deepEqual(merged.rooms[0].participants, [
  { id: "overview-other", userId: "user-6" },
  { id: "peer-local", userId: "local", isLocal: true },
  { id: "peer-2", userId: "user-2", connecting: false },
]);
assert.deepEqual(merged.rooms[1].participants, [{ id: "other-room", userId: "user-7" }]);

state = { ...state, voiceState: "idle" };
const unchanged = { rooms: [{ id: "room-1", participants: [{ id: "stale" }] }] };
assert.strictEqual(controller.mergeActivePresence(unchanged), unchanged);

console.log("voice participant state controller: ok");
