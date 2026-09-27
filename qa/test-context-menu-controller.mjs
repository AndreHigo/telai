import assert from "node:assert/strict";
import { createContextMenuController } from "../frontend/src/features/shell/context-menu-controller.js";

function target({ selector, icon = "#", name = "Alice", voice = false } = {}) {
  return {
    closest(value) { return value.includes(selector) ? this : null; },
    matches(value) { return voice && value === ".channel-voice-member, .voice-chip"; },
    querySelector(value) {
      if (value === ".channel-icon") return { textContent: icon };
      if (value === "b") return { textContent: name };
      if (value === "strong") return { textContent: name };
      return null;
    },
    children: [null, { textContent: name }],
    textContent: name,
    childNodes: [{ textContent: name }],
  };
}

const calls = [];
const voiceParticipant = { id: "voice-1", displayName: "Alice" };
const controller = createContextMenuController({
  getVoiceRoomId: () => "room-1",
  getActiveVoiceRoom: () => ({ id: "room-1" }),
  getSelectedRoom: () => ({ id: "room-2" }),
  getVoiceParticipants: () => new Map([[voiceParticipant.id, voiceParticipant]]),
  getVoiceRooms: () => [{ id: "room-1", name: "Voz" }],
  getTextRooms: () => [{ id: "room-2", name: "geral" }],
  getGroupMembers: () => [{ id: "member-1", displayName: "Bob" }],
  visibleVoiceParticipants: () => [],
  voiceParticipantDisplayName: (item) => item.displayName,
  openVoiceContextMenu: (_event, room, participant) => calls.push(["voice", room.id, participant.id]),
  openRoomContextMenu: (_event, room) => calls.push(["room", room.id]),
  openUserContextMenu: (_event, member) => calls.push(["user", member.id]),
});

controller.handleVoiceContextMenu({ target: target({ selector: ".channel-voice-member, .voice-chip", voice: true }) });
controller.handleRoomContextMenu({ target: target({ selector: ".channel-item", icon: "#", name: "geral" }) });
controller.handleUserClick({ target: target({ selector: ".member-item", name: "Bob" }) });
assert.deepEqual(calls, [["voice", "room-1", "voice-1"], ["room", "room-2"], ["user", "member-1"]]);

console.log(JSON.stringify({ ok: true, checks: 6 }));
