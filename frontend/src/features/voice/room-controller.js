export function createVoiceRoomController({
  getState,
  setState,
  refreshIceConfiguration,
  connectSocket,
  closeSocket,
  getVoiceSoundContext,
  captureVoiceInputStream,
  inputStreamMatchesSelectedDevice,
  stopVoiceInputStream,
  bindVoiceLocalTrack,
  sendVoice,
  upsertVoiceRoomParticipant,
  removeVoiceRoomParticipant,
  closeVoicePeer,
  clearPeerRecovery,
  clearVoiceActivityAnalyzer,
  resetVoiceActivity,
  clearVoicePeerHealth,
  clearVoicePeerRelayRecovery,
  clearVoiceSignalingQueues,
  clearVoicePendingSignals,
  stopVoicePeerHealthTimer,
  clearReconnectSession,
  clearSpeakingPublishTimer,
  releasePushToTalk,
  resumeVoiceRemoteAudio,
  isLocallyMuted,
  voicePreferenceTargetId,
  playVoiceSound,
  openSettings,
  loadAudioDevices,
  reportClientError,
} = {}) {
  const state = () => getState?.() || {};

  function voiceMicrophoneJoinMessage(error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      return "Você entrou sem microfone porque o acesso foi bloqueado. Permita o microfone nas configurações do navegador e tente selecionar novamente.";
    }
    if (error?.voiceInputFallbackAttempted) {
      return "Você entrou sem microfone porque o microfone padrão também não está disponível. Verifique as permissões do Windows e escolha outro dispositivo em Áudio e voz.";
    }
    if (["NotFoundError", "OverconstrainedError"].includes(error?.name)) {
      return "Você entrou sem microfone porque o dispositivo escolhido não está disponível. Abra Áudio e voz, atualize os dispositivos e tente novamente.";
    }
    if (error?.name === "NotReadableError") {
      return "Você entrou sem microfone porque o dispositivo está sendo usado por outro aplicativo. Feche o outro uso e tente novamente.";
    }
    return "Você entrou sem microfone. Abra Áudio e voz para testar ou escolher outro dispositivo.";
  }

  async function joinVoiceRoom({ reconnecting = false } = {}) {
    const current = state();
    if (!current.selectedRoom || current.selectedRoom.kind !== "voice" || !current.selectedGroupId) return;
    if (current.voiceRoomId === current.selectedRoom.id || current.voiceState === "connecting") return;
    const targetRoomId = current.selectedRoom.id;
    const targetGroupId = current.selectedGroupId;
    await leaveVoiceRoom({ preserveLocalStream: true, preserveReconnect: true, silent: true });
    getVoiceSoundContext?.();
    const pendingParticipant = {
      id: "local-pending",
      userId: current.user?.id || null,
      displayName: current.user?.displayName || "Você",
      username: current.user?.username || "você",
      avatarData: current.user?.avatarData || null,
      isLocal: true,
      muted: current.voiceMuted,
      deafened: current.voiceDeafened,
      connecting: true,
    };
    setState?.({
      voiceState: "connecting",
      voiceError: "",
      voiceRoomId: targetRoomId,
      voiceParticipants: new Map([["local-pending", pendingParticipant]]),
    });
    upsertVoiceRoomParticipant?.(targetRoomId, pendingParticipant);
    try {
      await refreshIceConfiguration?.();
      await connectSocket?.();
      let microphoneJoinError = null;
      try {
        let localStream = state().voiceLocalStream;
        const existingTrack = localStream?.getAudioTracks?.().find((track) => track.readyState === "live");
        if (!existingTrack || !inputStreamMatchesSelectedDevice?.(localStream)) {
          stopVoiceInputStream?.(localStream);
          localStream = await captureVoiceInputStream?.();
          setState?.({ voiceLocalStream: localStream });
        }
        const liveTrack = localStream?.getAudioTracks?.().find((track) => track.readyState === "live");
        if (!liveTrack) throw new Error("O microfone não ficou disponível para a sala de voz.");
        liveTrack.enabled = true;
        bindVoiceLocalTrack?.(liveTrack);
        setState?.({ voiceMuted: false, voiceMutedByCaptureFailure: false });
      } catch (error) {
        microphoneJoinError = error;
        reportClientError?.("voice_microphone_unavailable_on_join", error, { roomId: targetRoomId, deviceSelected: Boolean(state().selectedInputDeviceId) });
        stopVoiceInputStream?.(state().voiceLocalStream);
        setState?.({ voiceLocalStream: null, voiceMuted: true, voiceMutedByCaptureFailure: true });
      }
      sendVoice?.({ type: "voice-join", voiceRoomId: targetRoomId, groupId: targetGroupId });
      if (microphoneJoinError) setState?.({ voiceError: voiceMicrophoneJoinMessage(microphoneJoinError) });
      return true;
    } catch (error) {
      reportClientError?.("voice_join_error", error, { roomId: targetRoomId, groupId: targetGroupId });
      setState?.({ voiceError: error.name === "NotAllowedError" ? "Permita o microfone para entrar nesta sala." : error.message });
      await leaveVoiceRoom({ preserveLocalStream: reconnecting, preserveReconnect: reconnecting, silent: true });
      return false;
    }
  }

  async function leaveVoiceRoom({ preserveLocalStream = false, preserveReconnect = false, silent = false } = {}) {
    const current = state();
    const wasInVoice = current.voiceState === "connected" || current.voiceState === "connecting";
    releasePushToTalk?.();
    clearSpeakingPublishTimer?.();
    const previousVoiceRoomId = current.voiceRoomId;
    const previousVoiceClientId = current.voiceClientId;
    if (previousVoiceRoomId) {
      removeVoiceRoomParticipant?.(previousVoiceRoomId, previousVoiceClientId, current.user?.id || null);
      sendVoice?.({ type: "voice-leave" });
    }
    for (const participantId of current.voicePeerConnections?.keys?.() || []) closeVoicePeer?.(participantId);
    clearPeerRecovery?.();
    clearVoiceActivityAnalyzer?.(previousVoiceClientId);
    if (!preserveLocalStream) {
      stopVoiceInputStream?.(current.voiceLocalStream);
    }
    closeSocket?.();
    resetVoiceActivity?.();
    clearVoicePeerHealth?.();
    clearVoicePeerRelayRecovery?.();
    clearVoiceSignalingQueues?.();
    clearVoicePendingSignals?.();
    stopVoicePeerHealthTimer?.();
    setState?.({
      voiceLocalStream: preserveLocalStream ? current.voiceLocalStream : null,
      voiceRoomId: null,
      voiceClientId: null,
      voiceParticipants: new Map(),
      voicePlaybackBlocked: false,
      speakingVoiceParticipantIds: new Set(),
      voiceSpeakingSignalKnownParticipantIds: new Set(),
      voiceState: "idle",
      voiceMuted: false,
      voiceMutedByCaptureFailure: false,
      voiceServerMuted: false,
      voiceDeafened: false,
    });
    if (!preserveReconnect) clearReconnectSession?.();
    if (wasInVoice && !silent) playVoiceSound?.("leave");
  }

  function toggleVoiceMute() {
    return setVoiceMuted(!state().voiceMuted);
  }

  function setVoiceMuted(nextMuted) {
    const current = state();
    const track = current.voiceLocalStream?.getAudioTracks?.()[0];
    if (!track || !current.voiceClientId) return false;
    const local = current.voiceParticipants?.get(current.voiceClientId);
    if (!nextMuted && (current.voiceServerMuted || local?.serverMuted)) return false;
    const muted = Boolean(nextMuted);
    track.enabled = !(muted || current.voiceServerMuted);
    if (local) {
      const updated = { ...local, muted: muted || Boolean(local.serverMuted) };
      setState?.({ voiceMuted: muted, voiceParticipants: new Map(current.voiceParticipants).set(current.voiceClientId, updated) });
      upsertVoiceRoomParticipant?.(current.voiceRoomId, updated);
    } else {
      setState?.({ voiceMuted: muted });
    }
    sendVoice?.({ type: "voice-mute-state", muted });
    playVoiceSound?.(muted ? "mute" : "unmute");
    return true;
  }

  function toggleVoiceDeafen() {
    const current = state();
    const deafened = !current.voiceDeafened;
    for (const [participantId, audio] of current.voiceRemoteAudio || []) {
      audio.muted = deafened || isLocallyMuted?.(voicePreferenceTargetId?.(participantId));
    }
    if (!deafened) resumeVoiceRemoteAudio?.();
    const local = current.voiceParticipants?.get(current.voiceClientId);
    if (local) {
      const updated = { ...local, deafened };
      setState?.({ voiceDeafened: deafened, voiceParticipants: new Map(current.voiceParticipants).set(current.voiceClientId, updated) });
      upsertVoiceRoomParticipant?.(current.voiceRoomId, updated);
    } else {
      setState?.({ voiceDeafened: deafened });
    }
    sendVoice?.({ type: "voice-deafen-state", deafened });
    playVoiceSound?.(deafened ? "deafen" : "undeafen");
  }

  function openVoiceSettings() {
    void openSettings?.("user", "groups").then(() => loadAudioDevices?.(true));
    setState?.({ settingsSection: "voice" });
  }

  return {
    joinVoiceRoom,
    leaveVoiceRoom,
    toggleVoiceMute,
    setVoiceMuted,
    toggleVoiceDeafen,
    openVoiceSettings,
  };
}
