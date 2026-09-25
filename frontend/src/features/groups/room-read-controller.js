export function createGroupRoomReadController({
  api,
  getSelectedGroupId,
  getGroupOverview,
  setGroupOverview,
  getUser,
}) {
  const requests = new Map();

  function markGroupRoomRead(room) {
    const groupId = getSelectedGroupId();
    if (!groupId || room?.kind !== "text") return Promise.resolve();
    const key = `${groupId}:${room.id}`;
    if (requests.has(key)) return requests.get(key);
    const request = Promise.resolve(api(`/api/groups/${encodeURIComponent(groupId)}/rooms/${encodeURIComponent(room.id)}/read`, { method: "POST" }))
      .then(() => {
        const overview = getGroupOverview();
        if (getSelectedGroupId() !== groupId || overview?.group?.id !== groupId) return;
        setGroupOverview({
          ...overview,
          rooms: (overview.rooms || []).map((candidate) => candidate.id === room.id ? { ...candidate, unreadCount: 0 } : candidate),
        });
      })
      .catch(() => {})
      .finally(() => requests.delete(key));
    requests.set(key, request);
    return request;
  }

  function messageBelongsToRoom(message, room) {
    if (!message || !room || room.kind !== "text") return false;
    return message.roomId ? message.roomId === room.id : room.slug === "geral";
  }

  function incrementGroupRoomUnread(message) {
    const overview = getGroupOverview();
    if (!overview || !message || message.userId === getUser?.()?.id) return;
    setGroupOverview({
      ...overview,
      rooms: (overview.rooms || []).map((room) => messageBelongsToRoom(message, room) ? { ...room, unreadCount: (room.unreadCount || 0) + 1 } : room),
    });
  }

  return { markGroupRoomRead, messageBelongsToRoom, incrementGroupRoomUnread };
}
