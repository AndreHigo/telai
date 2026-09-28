import { createContextMenuController } from "../shell/context-menu-controller.js";

export function createVoiceContextMenuRuntime({
  getState,
  setState,
  setGroupState,
  setMessageState,
  visibleVoiceParticipants,
  voiceParticipantDisplayName,
  openRoomContextMenu,
  setVoiceVolumePreference,
  isVoiceParticipantLocallyMutedPreference,
  toggleVoiceParticipantLocalMutePreference,
  toggleVoiceMute,
  leaveVoiceRoom,
  sendVoice,
  tick = async () => {},
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  const read = () => getState?.() || {};
  const patchState = (next) => setState?.(next);

  function closeVoiceContextMenu() {
    patchState({ voiceContextMenu: null });
  }

  function openUserContextMenu(event, userLike, room = null) {
    event.preventDefault();
    event.stopPropagation();
    const width = 248;
    const height = 426;
    const participant = {
      ...userLike,
      id: userLike?.id || userLike?.userId,
      userId: userLike?.userId || userLike?.id,
    };
    patchState({
      voiceContextMenu: {
        x: Math.min(event.clientX, Math.max(8, windowRef.innerWidth - width - 8)),
        y: Math.min(event.clientY, Math.max(8, windowRef.innerHeight - height - 8)),
        roomId: room?.id || null,
        participant,
      },
    });
    void tick().then(() => documentRef.querySelector(".voice-context-menu")?.focus());
  }

  function openVoiceContextMenu(event, room, participant) {
    openUserContextMenu(event, participant, room);
  }

  function handleVoiceContextMenuKeydown(event) {
    if (event.key === "Escape") closeVoiceContextMenu();
  }

  const contextMenuController = createContextMenuController({
    getVoiceRoomId: () => read().voiceRoomId,
    getActiveVoiceRoom: () => read().activeVoiceRoom,
    getSelectedRoom: () => read().selectedRoom,
    getVoiceParticipants: () => read().voiceParticipants,
    getVoiceRooms: () => read().voiceRooms,
    getTextRooms: () => read().textRooms,
    getGroupMembers: () => read().groupMembers,
    visibleVoiceParticipants,
    voiceParticipantDisplayName,
    openVoiceContextMenu,
    openRoomContextMenu,
    openUserContextMenu,
  });

  function showVoiceProfile(participant) {
    patchState({ profilePreview: participant });
    closeVoiceContextMenu();
  }

  async function mentionVoiceParticipant(participant) {
    const textRoom = read().textRooms?.[0];
    if (!textRoom) return;
    setGroupState({ selectedRoomId: textRoom.id });
    const messageDraft = read().messageDraft || "";
    setMessageState({ messageDraft: `${messageDraft.trim()}${messageDraft.trim() ? " " : ""}@${participant.username || participant.displayName || "usuario"} ` });
    closeVoiceContextMenu();
    await tick();
    documentRef.querySelector(".message-composer textarea")?.focus();
  }

  const setVoiceVolume = (participantId, value) => setVoiceVolumePreference(participantId, value);
  const isVoiceParticipantLocallyMuted = (participantId) => isVoiceParticipantLocallyMutedPreference(participantId);

  function toggleVoiceParticipantLocalMute(participantId) {
    if (toggleVoiceParticipantLocalMutePreference(participantId)) closeVoiceContextMenu();
  }

  function toggleContextParticipantServerMute() {
    const context = read().voiceContextMenu;
    if (!context) return;
    const participant = context.participant;
    if (participant.isLocal) {
      toggleVoiceMute();
    } else if (read().canMoveVoiceMembers && context.roomId === read().voiceRoomId) {
      sendVoice({ type: "voice-mute", participantId: participant.id, muted: !participant.serverMuted });
    }
    closeVoiceContextMenu();
  }

  function disconnectContextParticipant() {
    const context = read().voiceContextMenu;
    if (!context) return;
    if (context.participant.isLocal) leaveVoiceRoom();
    else if (read().canMoveVoiceMembers && context.roomId === read().voiceRoomId) sendVoice({ type: "voice-disconnect", participantId: context.participant.id });
    closeVoiceContextMenu();
  }

  function moveContextParticipant(targetRoomId) {
    const context = read().voiceContextMenu;
    if (!context || !read().canMoveVoiceMembers || context.roomId !== read().voiceRoomId || targetRoomId === context.roomId) return;
    sendVoice({ type: "voice-move", participantId: context.participant.id, targetRoomId });
    closeVoiceContextMenu();
  }

  function handleVoiceDragStart(event, participant) {
    if (!read().canMoveVoiceMembers) {
      event.preventDefault();
      return;
    }
    patchState({ draggedVoiceParticipantId: participant.id });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", participant.id);
  }

  function handleVoiceDragEnd() {
    patchState({ draggedVoiceParticipantId: "", voiceDropRoomId: "" });
  }

  function handleVoiceDragOver(event, room) {
    if (!read().canMoveVoiceMembers || !read().draggedVoiceParticipantId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    patchState({ voiceDropRoomId: room.id });
  }

  function handleVoiceDragLeave(event, room) {
    if (event.currentTarget === event.target && read().voiceDropRoomId === room.id) patchState({ voiceDropRoomId: "" });
  }

  function handleVoiceDrop(event, room) {
    if (!read().canMoveVoiceMembers) return;
    event.preventDefault();
    const participantId = event.dataTransfer.getData("text/plain") || read().draggedVoiceParticipantId;
    patchState({ draggedVoiceParticipantId: "", voiceDropRoomId: "" });
    if (!participantId || room.id === read().voiceRoomId) return;
    sendVoice({ type: "voice-move", participantId, targetRoomId: room.id });
  }

  return {
    openUserContextMenu,
    openVoiceContextMenu,
    closeVoiceContextMenu,
    handleVoiceContextMenuKeydown,
    handleGlobalVoiceContextMenu: contextMenuController.handleVoiceContextMenu,
    handleGlobalRoomContextMenu: contextMenuController.handleRoomContextMenu,
    handleGlobalUserClick: contextMenuController.handleUserClick,
    showVoiceProfile,
    mentionVoiceParticipant,
    setVoiceVolume,
    isVoiceParticipantLocallyMuted,
    toggleVoiceParticipantLocalMute,
    toggleContextParticipantServerMute,
    disconnectContextParticipant,
    moveContextParticipant,
    handleVoiceDragStart,
    handleVoiceDragEnd,
    handleVoiceDragOver,
    handleVoiceDragLeave,
    handleVoiceDrop,
  };
}
