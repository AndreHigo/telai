export function createApplicationCommandController({ api, getState, setState, setNotice }) {
  let loadSequence = 0;

  async function loadForGroup(groupId) {
    const sequence = ++loadSequence;
    const normalizedGroupId = groupId || null;
    setState({ groupId: normalizedGroupId, commands: [], loading: Boolean(normalizedGroupId), error: "" });
    if (!normalizedGroupId) return [];
    try {
      const result = await api(`/api/groups/${encodeURIComponent(normalizedGroupId)}/applications/commands`);
      if (sequence !== loadSequence || getState().groupId !== normalizedGroupId) return null;
      const commands = result.applications || [];
      setState({ commands, loading: false });
      return commands;
    } catch (error) {
      if (sequence !== loadSequence || getState().groupId !== normalizedGroupId) return null;
      setState({ commands: [], loading: false, error: error?.message || "Não foi possível carregar os comandos dos bots." });
      setNotice?.(error?.message || "Não foi possível carregar os comandos dos bots.");
      return null;
    }
  }

  async function invoke({ groupId, roomId, applicationId, commandName, options }) {
    const result = await api(`/api/groups/${encodeURIComponent(groupId)}/applications/${encodeURIComponent(applicationId)}/interactions`, {
      method: "POST",
      body: JSON.stringify({ roomId, commandName, options }),
    });
    setNotice?.("Comando enviado ao bot.");
    return result;
  }

  async function submitComponent({ interactionId, customId, values = [] }) {
    const result = await api(`/api/interactions/${encodeURIComponent(interactionId)}/components`, {
      method: "POST",
      body: JSON.stringify({ customId, values }),
    });
    return result;
  }

  async function submitModal({ interactionId, customId, fields = {} }) {
    const result = await api(`/api/interactions/${encodeURIComponent(interactionId)}/modal`, {
      method: "POST",
      body: JSON.stringify({ customId, fields }),
    });
    return result;
  }

  return { invoke, loadForGroup, submitComponent, submitModal };
}
