export function createVoiceReconnectController({
  getState,
  setState,
  isOnline = () => globalThis.navigator?.onLine !== false,
  setGroupsView,
  loadGroup,
  getGroupOverview,
  setGroupState,
  tick,
  joinVoiceRoom,
  leaveVoiceRoom,
  writeReconnectSession,
  reportClientError,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  const state = () => getState?.() || {};

  function schedule(delayMs = 1_500) {
    const current = state();
    if (current.voiceReconnectTimer || current.voiceReconnectBusy || !current.voiceReconnectSession || !current.user || !isOnline()) return;
    const timer = setTimeoutFn(() => {
      setState?.({ voiceReconnectTimer: null });
      void reconnect({ automatic: true });
    }, delayMs);
    setState?.({ voiceReconnectTimer: timer });
  }

  async function reconnect({ automatic = false } = {}) {
    const current = state();
    if (current.voiceReconnectBusy || !current.voiceReconnectSession || !current.user || !isOnline()) return false;
    const saved = current.voiceReconnectSession;
    setState?.({ voiceReconnectBusy: true, voiceReconnectVisible: true });
    setGroupsView?.();
    try {
      await loadGroup?.(saved.groupId);
      const room = getGroupOverview?.()?.rooms?.find((candidate) => candidate.id === saved.voiceRoomId && candidate.kind === "voice");
      if (!room) throw new Error("A sala de voz salva não está mais disponível neste grupo.");
      setGroupState?.({ selectedGroupId: saved.groupId, selectedRoomId: room.id });
      await tick?.();
      const joined = await joinVoiceRoom?.({ reconnecting: true });
      if (!joined) throw new Error(state().voiceError || "Não foi possível reconectar à sala de voz.");
      return true;
    } catch (error) {
      reportClientError?.("voice_reconnect_error", error, { automatic, groupId: saved.groupId, voiceRoomId: saved.voiceRoomId, online: isOnline() });
      setState?.({ voiceError: error.message || "Não foi possível reconectar à sala de voz.", voiceReconnectVisible: true });
      if (automatic && isOnline()) schedule(5_000);
      return false;
    } finally {
      setState?.({ voiceReconnectBusy: false });
    }
  }

  function handleOffline() {
    const current = state();
    if (!current.voiceRoomId || !["connected", "connecting"].includes(current.voiceState)) return;
    writeReconnectSession?.({
      groupId: current.selectedGroupId,
      voiceRoomId: current.voiceRoomId,
      groupName: current.selectedGroup?.name,
      roomName: current.activeVoiceRoom?.name || current.selectedRoom?.name,
    });
    setState?.({ voiceError: "Sem conexão com a internet. O Telai tentará reconectar quando ela voltar." });
    leaveVoiceRoom?.({ preserveLocalStream: true, preserveReconnect: true, silent: true });
  }

  function handleOnline() {
    if (state().voiceReconnectSession && state().user) schedule(800);
  }

  function clearTimer() {
    const timer = state().voiceReconnectTimer;
    if (timer) clearTimeoutFn(timer);
    setState?.({ voiceReconnectTimer: null });
  }

  return { schedule, reconnect, handleOffline, handleOnline, clearTimer };
}
