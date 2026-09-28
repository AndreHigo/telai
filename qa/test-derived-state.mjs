import assert from "node:assert/strict";
import { deriveAppState } from "../frontend/src/app/derived-state.js";

const now = Date.parse("2026-09-28T12:00:00Z");
const state = deriveAppState({
  groups: [
    { id: "group-1", name: "Alpha", slug: "alpha", role: "owner" },
    { id: "group-2", name: "Beta", slug: "beta", role: "member" },
  ],
  selectedGroupId: "group-1",
  groupPickerQuery: " alp ",
  displaySources: [
    { id: "screen-1", kind: "screen", name: "Monitor" },
    { id: "window-1", kind: "window", name: "Editor", processId: 7 },
    { id: "tab-1", kind: "browser-tab", name: "Docs" },
  ],
  displaySourceFilter: "all",
  broadcastSelectionKind: "app",
  broadcastAudioSources: [
    { id: "audio-1", kind: "window", processId: 1, processName: "Game.exe", name: "Game" },
    { id: "audio-2", kind: "window", processId: 2, processName: "Discord.exe", name: "Discord" },
  ],
  groupOverview: {
    rooms: [
      { id: "text-1", kind: "text" },
      { id: "voice-1", kind: "voice", participants: [{ userId: "user-1" }] },
    ],
    streams: [{ id: "stream-1", visibility: "private", voiceRoomId: "voice-1", createdBy: "user-2" }],
    members: [
      { id: "user-1", role: "owner" },
      { id: "user-2", displayName: "Moderador", username: "moderador", role: "member", roleId: "role-1", roleName: "Moderador", roleColor: "#f00", roleSortOrder: 1 },
    ],
    messages: [
      { id: "message-1", roomId: "voice-1" },
      { id: "message-2", roomId: "text-1" },
    ],
  },
  selectedRoomId: "voice-1",
  watchingGroupLiveStreamId: "stream-1",
  user: { id: "user-1" },
  voiceRoomId: "voice-1",
  voiceState: "idle",
  streams: [{ id: "public-1", visibility: "public" }, { id: "private-1", visibility: "private" }],
  groupRoles: [{ id: "role-1", name: "Moderador", sortOrder: 1 }],
  selectedRoleId: "role-1",
  roleMemberSearchQuery: "@mod",
  groupInvites: [
    { id: "active", expiresAt: new Date(now + 60_000).toISOString(), uses: 0, maxUses: 1 },
    { id: "expired", expiresAt: new Date(now - 60_000).toISOString(), uses: 0, maxUses: 1 },
  ],
  hideReadNotifications: true,
  notifications: [
    { id: "unread-direct", unread: true, type: "direct_message", directConversationId: "dm-1" },
    { id: "read", unread: false, type: "system" },
  ],
  theme: "light",
  now,
  visibleVoiceParticipants: (room) => room.participants || [],
});

assert.equal(state.selectedGroup.id, "group-1");
assert.deepEqual(state.groupPickerGroups.map((group) => group.id), ["group-1"]);
assert.deepEqual(state.displayPickerAvailability, { screen: true, window: true, tab: true });
assert.equal(state.displaySourceGroups[0].sources.length, 1);
assert.equal(state.displaySourceGroups[1].label, "Aplicativos");
assert.deepEqual(state.broadcastAudioSourceCandidates.map((source) => source.id), ["audio-1"]);
assert.equal(state.rooms.length, 2);
assert.equal(state.textRooms.length, 1);
assert.equal(state.voiceRooms.length, 1);
assert.equal(state.selectedRoom.id, "voice-1");
assert.equal(state.selectedRoomLiveStream.id, "stream-1");
assert.equal(state.watchedSelectedRoomLive.id, "stream-1");
assert.equal(state.selectedRoomRemoteVoice, true);
assert.equal(state.voiceLobbyParticipants.length, 1);
assert.equal(state.homeLiveStreams.length, 1);
assert.equal(state.filteredRoleMembers.length, 1);
assert.equal(state.activeGroupInvites.length, 1);
assert.equal(state.memberRoleGroups[0].name, "Dono");
assert.equal(state.memberRoleGroups[1].name, "Moderador");
assert.equal(state.visibleNotifications.length, 1);
assert.equal(state.readNotificationCount, 1);
assert.equal(state.unreadDirectNotification.id, "unread-direct");
assert.equal(state.isDark, false);
assert.equal(state.roomMessages.length, 1);

console.log(JSON.stringify({ ok: true, checks: 25, derivedState: true }));
