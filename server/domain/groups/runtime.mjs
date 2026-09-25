export function createGroupRuntime({
  voiceRooms,
  groupPresence,
  send,
  leaveVoiceRoom,
  disconnectUserFromGroup,
  publishGroupPresence,
} = {}) {
  async function disconnectGroupUser(groupId, userId, reason) {
    for (const voiceRoom of voiceRooms.values()) {
      if (voiceRoom.groupId !== groupId) continue;
      for (const participant of [...voiceRoom.participants.values()]) {
        if (participant.user?.id !== userId) continue;
        send(participant, {
          type: "voice-disconnected",
          reason,
          message: reason === "ban" ? "Você foi banido deste grupo." : "Você foi expulso deste grupo.",
        });
        leaveVoiceRoom(participant);
      }
    }
    groupPresence.delete(`${groupId}:${userId}`);
    disconnectUserFromGroup?.(groupId, userId, reason);
    await publishGroupPresence?.(groupId);
  }

  return { disconnectGroupUser };
}
