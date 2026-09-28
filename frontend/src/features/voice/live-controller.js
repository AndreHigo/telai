export function createVoiceLiveController({
  getStreams,
  getUserId,
  setWatchingStream,
} = {}) {
  function watchSelectedRoomLive(streamId) {
    const streams = getStreams?.() || [];
    const stream = streams.find((candidate) => candidate.id === streamId);
    if (!stream || stream.createdBy === getUserId?.()) return;
    setWatchingStream?.(stream.id);
  }

  function closeSelectedRoomLive() {
    setWatchingStream?.("");
  }

  function privateLiveForParticipant(participant, roomId) {
    if (!participant?.userId || !roomId) return null;
    return (getStreams?.() || []).find((stream) => (
      stream.visibility === "private"
      && stream.voiceRoomId === roomId
      && stream.createdBy === participant.userId
    )) || null;
  }

  return { watchSelectedRoomLive, closeSelectedRoomLive, privateLiveForParticipant };
}
