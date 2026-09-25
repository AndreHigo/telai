export function createGroupEventHandler({
  getSelectedGroupId,
  getGroupOverview,
  setGroupOverview,
  getUser,
  getRooms,
  getSelectedRoomId,
  getActiveGroupThread,
  setActiveGroupThread,
  getGroupThreadMessages,
  setGroupThreadMessages,
  getKnownGroupMessageIds,
  setKnownGroupMessageIds,
  shouldKeepGroupMessagesAtBottom,
  markGroupRoomRead,
  messageBelongsToRoom,
  incrementGroupRoomUnread,
  playVoiceSound,
  scrollGroupMessagesToBottom,
}) {
  function applyGroupEventPresence(groupId, members) {
    if (getSelectedGroupId() !== groupId || !getGroupOverview() || !Array.isArray(members)) return;
    const onlineById = new Map(members.map((member) => [member.id, Boolean(member.online)]));
    const overview = getGroupOverview();
    setGroupOverview({
      ...overview,
      members: (overview.members || []).map((member) => (
        onlineById.has(member.id) ? { ...member, online: onlineById.get(member.id) } : member
      )),
    });
  }

  function handleGroupEvent(message) {
    if (!message?.groupId || message.groupId !== getSelectedGroupId()) return;
    if (message.type === "group-subscribed" || message.type === "group-presence") {
      applyGroupEventPresence(message.groupId, message.members);
      return;
    }
    const overview = getGroupOverview();
    if (message.type === "group-message-updated" && message.message && overview) {
      if (message.message.parentMessageId && getActiveGroupThread()?.id === message.message.parentMessageId) {
        setGroupThreadMessages(getGroupThreadMessages().map((item) => item.id === message.message.id ? message.message : item));
        return;
      }
      setGroupOverview({ ...overview, messages: (overview.messages || []).map((item) => item.id === message.message.id ? message.message : item) });
      return;
    }
    if (message.type === "group-message-deleted" && message.messageId && overview) {
      setKnownGroupMessageIds(new Set([...getKnownGroupMessageIds()].filter((id) => id !== message.messageId)));
      if (message.parentMessageId) {
        if (getActiveGroupThread()?.id === message.parentMessageId) setGroupThreadMessages(getGroupThreadMessages().filter((item) => item.id !== message.messageId));
        setGroupOverview({
          ...overview,
          messages: (overview.messages || []).map((item) => item.id === message.parentMessageId ? { ...item, threadCount: Math.max(0, (item.threadCount || 0) - 1) } : item),
        });
        return;
      }
      if (getActiveGroupThread()?.id === message.messageId) {
        setActiveGroupThread(null);
        setGroupThreadMessages([]);
      }
      setGroupOverview({ ...overview, messages: (overview.messages || []).filter((item) => item.id !== message.messageId) });
      return;
    }
    if (message.type !== "group-message" || !message.message || !overview) return;
    const incoming = message.message;
    if (!incoming.id || getKnownGroupMessageIds().has(incoming.id)) return;
    const messageList = document.querySelector(".chat-workspace .message-list");
    const keepAtBottom = shouldKeepGroupMessagesAtBottom(messageList);
    setKnownGroupMessageIds(new Set([...getKnownGroupMessageIds(), incoming.id]));
    const incomingIsUnread = incoming.userId !== getUser()?.id;
    if (incoming.parentMessageId) {
      setGroupOverview({
        ...overview,
        messages: (overview.messages || []).map((item) => item.id === incoming.parentMessageId ? { ...item, threadCount: (item.threadCount || 0) + 1 } : item),
      });
      if (getActiveGroupThread()?.id === incoming.parentMessageId) {
        setGroupThreadMessages([...getGroupThreadMessages(), incoming].slice(-100));
      }
      if (incomingIsUnread) {
        const currentRoom = getRooms().find((room) => room.id === getSelectedRoomId());
        if (keepAtBottom && messageBelongsToRoom(incoming, currentRoom)) void markGroupRoomRead(currentRoom);
        else incrementGroupRoomUnread(incoming);
        playVoiceSound("message");
      }
      return;
    }
    setGroupOverview({ ...overview, messages: [...(overview.messages || []), incoming].slice(-80) });
    if (incomingIsUnread) {
      const currentRoom = getRooms().find((room) => room.id === getSelectedRoomId());
      if (keepAtBottom && messageBelongsToRoom(incoming, currentRoom)) void markGroupRoomRead(currentRoom);
      else incrementGroupRoomUnread(incoming);
      playVoiceSound("message");
    }
    if (keepAtBottom) void scrollGroupMessagesToBottom({ force: true });
  }

  return handleGroupEvent;
}
