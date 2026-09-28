import assert from "node:assert/strict";
import { createVoiceContextMenuRuntime } from "../frontend/src/features/voice/context-menu-runtime.js";

let state = {
  voiceRoomId: "voice-1",
  activeVoiceRoom: { id: "voice-1" },
  selectedRoom: { id: "voice-1" },
  voiceParticipants: new Map([["user-1", { id: "user-1", displayName: "Ana" }]]),
  voiceRooms: [{ id: "voice-1", participants: [{ id: "user-1", displayName: "Ana" }] }],
  textRooms: [{ id: "text-1" }],
  groupMembers: [{ id: "user-1", displayName: "Ana" }],
  messageDraft: "oi",
  canMoveVoiceMembers: true,
  voiceContextMenu: null,
  profilePreview: null,
  draggedVoiceParticipantId: "",
  voiceDropRoomId: "",
};
const messages = [];
const groupPatches = [];
const sent = [];
const focused = [];
const documentRef = {
  querySelector(selector) {
    return { focus: () => focused.push(selector) };
  },
};

const runtime = createVoiceContextMenuRuntime({
  getState: () => state,
  setState: (next) => { state = { ...state, ...next }; },
  setGroupState: (next) => groupPatches.push(next),
  setMessageState: (next) => messages.push(next),
  visibleVoiceParticipants: (room) => room.participants || [],
  voiceParticipantDisplayName: (participant) => participant.displayName,
  openRoomContextMenu: () => {},
  setVoiceVolumePreference: () => {},
  isVoiceParticipantLocallyMutedPreference: () => false,
  toggleVoiceParticipantLocalMutePreference: () => true,
  toggleVoiceMute: () => sent.push({ type: "toggle-mute" }),
  leaveVoiceRoom: () => sent.push({ type: "leave" }),
  sendVoice: (message) => sent.push(message),
  tick: async () => {},
  windowRef: { innerWidth: 1000, innerHeight: 700 },
  documentRef,
});

runtime.openUserContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 980, clientY: 690 }, { id: "user-1", displayName: "Ana" });
assert.equal(state.voiceContextMenu.x, 744);
assert.equal(state.voiceContextMenu.y, 266);
await Promise.resolve();
assert.equal(focused[0], ".voice-context-menu");

await runtime.mentionVoiceParticipant({ username: "ana" });
assert.deepEqual(groupPatches, [{ selectedRoomId: "text-1" }]);
assert.equal(messages[0].messageDraft, "oi @ana ");
assert.equal(state.voiceContextMenu, null);

runtime.openUserContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 20, clientY: 20 }, { id: "user-1", displayName: "Ana" }, { id: "voice-1" });
runtime.moveContextParticipant("voice-2");
assert.deepEqual(sent.at(-1), { type: "voice-move", participantId: "user-1", targetRoomId: "voice-2" });

const dataTransfer = {
  effectAllowed: "",
  dropEffect: "",
  value: "user-1",
  setData() {},
  getData: () => dataTransfer.value,
};
runtime.handleVoiceDragStart({ preventDefault() {}, dataTransfer }, { id: "user-1" });
assert.equal(state.draggedVoiceParticipantId, "user-1");
runtime.handleVoiceDrop({ preventDefault() {}, dataTransfer }, { id: "voice-2" });
assert.equal(state.draggedVoiceParticipantId, "");
assert.deepEqual(sent.at(-1), { type: "voice-move", participantId: "user-1", targetRoomId: "voice-2" });

console.log(JSON.stringify({ ok: true, checks: 10, contextMenuRuntime: true }));
