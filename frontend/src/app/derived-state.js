import { visualStyleFromState } from "../features/settings/visual-state.js";

const DISPLAY_SOURCE_EXCLUDED_KINDS = ["screen", "tab", "browser-tab"];

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function deriveMemberRoleGroups(groupMembers, groupRoles) {
  const groupsByRole = new Map();

  for (const member of groupMembers) {
    const isOwner = member.role === "owner";
    const key = isOwner ? "owner" : member.roleId || member.roleName || "default";
    const current = groupsByRole.get(key) || {
      roleId: isOwner ? "" : member.roleId || "",
      name: isOwner ? "Dono" : member.roleName || "Membro",
      color: isOwner ? "#62d994" : member.roleColor || "#5865f2",
      sortOrder: isOwner ? -1 : member.roleSortOrder ?? Number.MAX_SAFE_INTEGER,
      members: [],
    };

    current.members.push(member);
    groupsByRole.set(key, current);
  }

  const roleOrder = new Map(groupRoles.map((role, index) => [role.id, role.sortOrder ?? index]));
  return [...groupsByRole.values()].sort((left, right) => {
    const leftOrder = left.name === "Dono" ? -1 : roleOrder.get(left.roleId) ?? left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.name === "Dono" ? -1 : roleOrder.get(right.roleId) ?? right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.name.localeCompare(right.name, "pt-BR");
  });
}

export function deriveAppState({
  groups = [],
  selectedGroupId = "",
  groupPickerQuery = "",
  displaySources = [],
  displaySourceFilter = "all",
  broadcastSelectionKind = "window",
  broadcastAudioSources = [],
  groupOverview = null,
  selectedRoomId = "",
  watchingGroupLiveStreamId = "",
  user = null,
  voiceRoomId = "",
  voiceState = "idle",
  streams = [],
  groupRoles = [],
  selectedRoleId = "",
  roleMemberSearchQuery = "",
  groupInvites = [],
  hideReadNotifications = false,
  notifications = [],
  buttonColor,
  inputBackgroundColor,
  backgroundColor,
  theme = "dark",
  visibleVoiceParticipants = () => [],
  now = Date.now(),
} = {}) {
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const normalizedGroupPickerQuery = normalize(groupPickerQuery);
  const groupPickerGroups = groups.filter((group) => {
    if (!normalizedGroupPickerQuery) return true;
    return `${group.name || ""} ${group.slug || ""}`.toLocaleLowerCase().includes(normalizedGroupPickerQuery);
  });

  const displayPickerAvailability = {
    screen: displaySources.some((source) => source.kind === "screen"),
    window: displaySources.some((source) => !DISPLAY_SOURCE_EXCLUDED_KINDS.includes(source.kind)),
    tab: displaySources.some((source) => ["tab", "browser-tab"].includes(source.kind)),
  };

  const displaySourceGroups = [
    {
      id: "screen",
      icon: "computerScreen",
      label: "Telas inteiras",
      description: "Compartilha tudo que aparece em um monitor.",
      sources: displaySources.filter((source) => source.kind === "screen"),
    },
    {
      id: "window",
      icon: "appWindow",
      label: broadcastSelectionKind === "app" ? "Aplicativos" : "Janelas de aplicativos",
      description: broadcastSelectionKind === "app" ? "Compartilha somente o aplicativo escolhido." : "Compartilha somente uma janela específica.",
      sources: displaySources.filter((source) => !DISPLAY_SOURCE_EXCLUDED_KINDS.includes(source.kind)),
    },
  ]
    .filter((group) => displaySourceFilter === "all" || group.id === displaySourceFilter)
    .filter((group) => group.sources.length);

  const broadcastAudioSourceCandidates = broadcastAudioSources.filter(
    (source) => source?.kind === "window" && source?.processId && !/(discord|telai|mirante)/i.test(`${source.processName || ""} ${source.name || ""}`),
  );

  const rooms = groupOverview?.rooms || [];
  const textRooms = rooms.filter((room) => room.kind === "text");
  const voiceRooms = rooms.filter((room) => room.kind === "voice");
  const groupLiveStreams = groupOverview?.streams || [];
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || rooms[0] || null;
  const selectedRoomLiveStreams = selectedRoom?.kind === "voice"
    ? groupLiveStreams.filter((stream) => stream.visibility === "private" && stream.voiceRoomId === selectedRoom.id)
    : [];
  const selectedRoomLiveStream = selectedRoomLiveStreams[0] || null;
  const watchedSelectedRoomLive = selectedRoomLiveStreams.find(
    (stream) => stream.id === watchingGroupLiveStreamId && stream.createdBy !== user?.id,
  ) || null;
  const watchingSelectedRoomLive = Boolean(watchedSelectedRoomLive);
  const activeVoiceRoom = voiceRooms.find((room) => room.id === voiceRoomId) || null;
  const selectedRoomRemoteVoice = Boolean(
    selectedRoom?.kind === "voice" &&
    voiceState === "idle" &&
    (selectedRoom.participants || []).some((participant) => participant.userId === user?.id),
  );

  const groupMembers = groupOverview?.members || [];
  const voiceLobbyParticipants = selectedRoom?.kind === "voice" ? visibleVoiceParticipants(selectedRoom) : [];
  const homeLiveStreams = streams.filter((stream) => stream.visibility === "public").slice(0, 3);
  const homeCommunityGroups = groups.slice(0, 4);
  const selectedRole = groupRoles.find((role) => role.id === selectedRoleId) || groupRoles[0] || null;
  const currentGroupMember = groupMembers.find((member) => member.id === user?.id) || null;
  const normalizedRoleMemberSearch = normalize(roleMemberSearchQuery);
  const filteredRoleMembers = groupMembers
    .filter((member) => member.role !== "owner")
    .filter((member) => {
      if (!normalizedRoleMemberSearch) return true;
      return `${member.displayName || ""} ${member.username || ""}`
        .toLocaleLowerCase()
        .includes(normalizedRoleMemberSearch.replace(/^@/, ""));
    });
  const activeGroupInvites = groupInvites.filter((invite) => new Date(invite.expiresAt).getTime() > now && invite.uses < invite.maxUses);
  const canMoveVoiceMembers = selectedGroup?.role === "owner" || Boolean(currentGroupMember?.canMoveMembers);
  const memberRoleGroups = deriveMemberRoleGroups(groupMembers, groupRoles);
  const isDark = theme === "dark";
  const visibleNotifications = hideReadNotifications ? notifications.filter((notification) => notification.unread) : notifications;
  const readNotificationCount = notifications.filter((notification) => !notification.unread).length;
  const unreadDirectNotification = notifications.find(
    (notification) => notification.unread && notification.type === "direct_message" && notification.directConversationId,
  ) || null;
  const visualStyle = visualStyleFromState({ buttonColor, inputBackgroundColor, backgroundColor });
  const roomMessages = (groupOverview?.messages || []).filter(
    (message) => !selectedRoom || !message.roomId || message.roomId === selectedRoom.id,
  );

  return {
    selectedGroup,
    normalizedGroupPickerQuery,
    groupPickerGroups,
    displayPickerAvailability,
    displaySourceGroups,
    broadcastAudioSourceCandidates,
    rooms,
    textRooms,
    voiceRooms,
    groupLiveStreams,
    selectedRoomLiveStreams,
    selectedRoomLiveStream,
    watchedSelectedRoomLive,
    watchingSelectedRoomLive,
    activeVoiceRoom,
    selectedRoom,
    selectedRoomRemoteVoice,
    groupMembers,
    voiceLobbyParticipants,
    homeLiveStreams,
    homeCommunityGroups,
    selectedRole,
    currentGroupMember,
    normalizedRoleMemberSearch,
    filteredRoleMembers,
    activeGroupInvites,
    canMoveVoiceMembers,
    memberRoleGroups,
    isDark,
    visibleNotifications,
    readNotificationCount,
    unreadDirectNotification,
    visualStyle,
    roomMessages,
  };
}
