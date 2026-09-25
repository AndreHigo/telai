export function createApplicationCommandController({ api, setNotice }) {
  let loadSequence = 0;

  async function loadForGroup(groupId) {
    const sequence = ++loadSequence;
    if (!groupId) return [];
    const result = await api(`/api/groups/${encodeURIComponent(groupId)}/applications/commands`);
    if (sequence !== loadSequence) return null;
    return result.applications || [];
  }

  async function invoke({ groupId, roomId, applicationId, commandName, options }) {
    const result = await api(`/api/groups/${encodeURIComponent(groupId)}/applications/${encodeURIComponent(applicationId)}/interactions`, {
      method: "POST",
      body: JSON.stringify({ roomId, commandName, options }),
    });
    setNotice?.("Comando enviado ao bot.");
    return result.interaction;
  }

  return { invoke, loadForGroup };
}
