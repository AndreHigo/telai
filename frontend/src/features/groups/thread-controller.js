export function createGroupThreadController({
  api,
  getSelectedGroupId,
  getSelectedRoom,
  getActiveThread,
  setActiveThread,
  getThreadMessages,
  setThreadMessages,
  getThreadDraft,
  setThreadDraft,
  setThreadBusy,
  setThreadError,
  getKnownMessageIds,
  setKnownMessageIds,
  getGroupOverview,
  setGroupOverview,
}) {
  async function openGroupThread(message) {
    if (!getSelectedGroupId() || !message?.id) return;
    const groupId = getSelectedGroupId();
    setActiveThread(message);
    setThreadMessages([]);
    setThreadDraft("");
    setThreadError("");
    try {
      const result = await api("/api/groups/" + encodeURIComponent(groupId) + "/messages/" + encodeURIComponent(message.id) + "/thread");
      if (getSelectedGroupId() === groupId && getActiveThread()?.id === message.id) {
        setActiveThread(result.parent || message);
        setThreadMessages(result.messages || []);
      }
    } catch (error) {
      if (getActiveThread()?.id === message.id) setThreadError(error.message);
    }
  }

  async function sendGroupThreadMessage() {
    const body = getThreadDraft().trim();
    const parent = getActiveThread();
    const groupId = getSelectedGroupId();
    if (getThreadBusy?.() || !body || !groupId || !parent || getSelectedRoom()?.kind !== "text") return;
    const parentMessageId = parent.id;
    setThreadBusy(true);
    setThreadError("");
    try {
      const result = await api("/api/groups/" + encodeURIComponent(groupId) + "/messages", {
        method: "POST",
        body: JSON.stringify({ body, roomId: getSelectedRoom().id, parentMessageId }),
      });
      const created = result.message;
      if (created && getSelectedGroupId() === groupId && getActiveThread()?.id === parentMessageId && !getKnownMessageIds().has(created.id)) {
        setKnownMessageIds(new Set([...getKnownMessageIds(), created.id]));
        setThreadMessages([...getThreadMessages(), created].slice(-100));
        const overview = getGroupOverview();
        setGroupOverview({
          ...overview,
          messages: (overview?.messages || []).map((item) => item.id === parentMessageId ? { ...item, threadCount: (item.threadCount || 0) + 1 } : item),
        });
      }
      setThreadDraft("");
    } catch (error) {
      setThreadError(error.message);
    } finally {
      setThreadBusy(false);
    }
  }

  return { openGroupThread, sendGroupThreadMessage };
}
