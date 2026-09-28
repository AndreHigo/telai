import assert from "node:assert/strict";
import { createVoiceReconnectController } from "../frontend/src/features/voice/reconnect-controller.js";

let state = {
  voiceReconnectTimer: null,
  voiceReconnectBusy: false,
  voiceReconnectSession: { groupId: "group-1", voiceRoomId: "room-1" },
  voiceReconnectVisible: false,
  voiceState: "connected",
  voiceRoomId: "room-1",
  voiceError: "",
  user: { id: "user-1" },
  selectedGroupId: "group-1",
  selectedGroup: { name: "Grupo" },
  selectedRoom: { name: "Sala" },
  activeVoiceRoom: { name: "Voz" },
  groupOverview: { rooms: [{ id: "room-1", kind: "voice" }] },
};
const updates = [];
const calls = [];
const controller = createVoiceReconnectController({
  getState: () => state,
  setState: (next) => { state = { ...state, ...next }; updates.push(next); },
  isOnline: () => true,
  setGroupsView: () => calls.push("groups"),
  loadGroup: async (groupId) => calls.push(["load", groupId]),
  getGroupOverview: () => state.groupOverview,
  setGroupState: (next) => calls.push(["group-state", next]),
  tick: async () => calls.push("tick"),
  joinVoiceRoom: async (options) => { calls.push(["join", options]); return true; },
  leaveVoiceRoom: (options) => calls.push(["leave", options]),
  writeReconnectSession: (session) => calls.push(["persist", session]),
  reportClientError: (...args) => calls.push(["error", ...args]),
});

assert.equal(await controller.reconnect(), true);
assert.deepEqual(calls.slice(0, 4), ["groups", ["load", "group-1"], ["group-state", { selectedGroupId: "group-1", selectedRoomId: "room-1" }], "tick"]);
assert.equal(state.voiceReconnectBusy, false);

controller.handleOffline();
assert.equal(calls.at(-2)[0], "persist");
assert.equal(calls.at(-1)[0], "leave");
assert.match(state.voiceError, /Sem conexão/);

console.log("voice reconnect controller: ok");
