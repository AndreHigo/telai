export function createContextMenuController({
  getVoiceRoomId,
  getActiveVoiceRoom,
  getSelectedRoom,
  getVoiceParticipants,
  getVoiceRooms,
  getTextRooms,
  getGroupMembers,
  visibleVoiceParticipants,
  voiceParticipantDisplayName,
  openVoiceContextMenu,
  openRoomContextMenu,
  openUserContextMenu,
} = {}) {
  function participantByDisplayName(displayName) {
    const direct = [...(getVoiceParticipants?.()?.values?.() || [])];
    const visible = (getVoiceRooms?.() || []).flatMap((room) => visibleVoiceParticipants?.(room) || []);
    return [...direct, ...visible].find((item) => voiceParticipantDisplayName?.(item) === displayName) || null;
  }

  function handleVoiceContextMenu(event) {
    const target = event?.target?.closest?.(".channel-voice-member, .voice-chip");
    if (!target || !getVoiceRoomId?.()) return;
    const participantName = target.querySelector?.("b")?.textContent?.trim()
      || target.childNodes?.[0]?.textContent?.trim()
      || target.textContent?.trim()?.split("silencioso")[0]?.trim();
    const participant = participantByDisplayName(participantName);
    if (participant) openVoiceContextMenu?.(event, getActiveVoiceRoom?.() || getSelectedRoom?.(), participant);
  }

  function handleRoomContextMenu(event) {
    const target = event?.target?.closest?.(".channel-item");
    const icon = target?.querySelector?.(".channel-icon")?.textContent?.trim();
    if (!target || !["#", "⌁"].includes(icon)) return;
    const roomName = target.children?.[1]?.textContent?.trim();
    const roomList = icon === "⌁" ? getVoiceRooms?.() || [] : getTextRooms?.() || [];
    const room = roomList.find((candidate) => candidate.name === roomName);
    if (room) openRoomContextMenu?.(event, room);
  }

  function handleUserClick(event) {
    const target = event?.target?.closest?.(".member-item, .channel-voice-member, .voice-chip");
    if (!target) return;
    const voiceTarget = target.matches?.(".channel-voice-member, .voice-chip");
    const displayName = voiceTarget
      ? target.querySelector?.("b")?.textContent?.trim() || target.textContent?.trim()?.split("silencioso")[0]?.trim()
      : target.querySelector?.("strong")?.textContent?.trim();
    if (!displayName) return;
    if (voiceTarget) {
      const participant = participantByDisplayName(displayName);
      if (participant) openVoiceContextMenu?.(event, getActiveVoiceRoom?.() || getSelectedRoom?.(), participant);
      return;
    }
    const member = (getGroupMembers?.() || []).find((item) => item.displayName === displayName);
    if (member) openUserContextMenu?.(event, member);
  }

  return { handleVoiceContextMenu, handleRoomContextMenu, handleUserClick };
}
