import assert from "node:assert/strict";
import { createGroupController } from "../frontend/src/features/groups/controller.js";

const state = {
  groups: [],
  selectedGroupId: null,
  selectedRoomId: null,
  groupLoadSequence: 0,
  groupLoading: false,
  groupOverview: null,
  groupOverviewRefreshInFlight: false,
  groupOverviewRetryAt: 0,
  groupPresenceRefreshInFlight: false,
  knownGroupMessageIds: new Set(),
  pendingGroupOverviewRequests: new Map(),
  watchingGroupLiveStreamId: "",
  broadcastState: "idle",
  showMobileChannels: true,
  mentionSuggestions: ["old"],
  mentionStartIndex: 4,
};
const calls = [];
const controller = createGroupController({
  getState: () => state,
  setState: (next) => Object.assign(state, next),
  api: async (path) => path === "/api/groups"
    ? { groups: [{ id: "group-1", name: "Colmeia" }] }
    : { group: { id: "group-1" }, rooms: [{ id: "room-1", kind: "text" }, { id: "room-2", kind: "voice" }], messages: [{ id: "message-1" }], members: [] },
  mergeActiveVoicePresence: (value) => value,
  shouldKeepGroupMessagesAtBottom: () => true,
  scrollGroupMessagesToBottom: async () => {},
  playVoiceSound: (kind) => calls.push(["sound", kind]),
  setNotice: (message) => calls.push(["notice", message]),
  getUser: () => ({ id: "user-1" }),
  getIsViewer: () => false,
  subscribeGroup: (groupId) => calls.push(["subscribe", groupId]),
  getSelectedRoomId: () => state.selectedRoomId,
  markGroupRoomRead: (room) => calls.push(["read", room.id]),
  getVoiceSoundContext: () => calls.push(["voice-context"]),
  getMessageComposerInput: () => ({ focus: () => calls.push(["focus"]) }),
  tick: async () => {},
  joinVoiceRoom: async () => calls.push(["join-voice"]),
});

await controller.loadGroups();
assert.equal(state.groups[0].id, "group-1");
assert.equal(state.selectedGroupId, "group-1");

const result = await controller.loadGroup("group-1");
assert.equal(result.group.id, "group-1");
assert.equal(state.groupOverview.group.id, "group-1");
assert.equal(state.selectedRoomId, "room-1");
assert.equal(state.groupLoading, false);
assert.ok(calls.some(([name, id]) => name === "subscribe" && id === "group-1"));
assert.ok(calls.some(([name, id]) => name === "read" && id === "room-1"));

await controller.selectRoom("room-2");
assert.equal(state.selectedRoomId, "room-2");
assert.equal(state.showMobileChannels, false);
assert.ok(calls.some(([name]) => name === "voice-context"));
assert.ok(calls.some(([name]) => name === "join-voice"));

await controller.selectRoom("room-1");
assert.equal(state.selectedRoomId, "room-1");
assert.deepEqual(state.mentionSuggestions, []);
assert.equal(state.mentionStartIndex, -1);
assert.ok(calls.some(([name]) => name === "focus"));

console.log(JSON.stringify({ ok: true, checks: 18 }));
