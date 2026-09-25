export function createVoiceInputLifecycleController({
  getState,
  setState,
  captureInputStream,
  stopInputStream,
  syncLocalTrackToPeers,
  attachVoiceActivityStream,
  clearVoiceActivityAnalyzer,
  ensureVoiceActivityTimer,
  applyInputDevice,
  getVoiceTestRunning,
  stopVoiceTest,
  startVoiceTest,
  upsertVoiceRoomParticipant,
  sendVoiceMuteState,
  reportClientError,
}) {
  let recoveryInFlight = false;
  const boundTracks = new WeakSet();

  function state() {
    return getState?.() || {};
  }

  function isVoiceActive(current = state()) {
    return ["connected", "connecting"].includes(current.voiceState);
  }

  function bindLocalTrack(track) {
    if (!track || boundTracks.has(track)) return;
    boundTracks.add(track);
    track.addEventListener?.("ended", () => {
      const current = state();
      if (current.voiceLocalStream?.getAudioTracks?.()[0] !== track || !isVoiceActive(current)) return;
      void recover("track_ended");
    }, { once: true });
  }

  async function recover(reason = "track_unavailable") {
    const current = state();
    if (recoveryInFlight || !isVoiceActive(current)) return false;
    recoveryInFlight = true;
    const previousStream = current.voiceLocalStream;
    try {
      const nextStream = await captureInputStream();
      const afterCapture = state();
      if (!isVoiceActive(afterCapture)) {
        nextStream.getTracks?.().forEach((track) => track.stop());
        return false;
      }
      const nextTrack = nextStream.getAudioTracks?.()[0];
      if (!nextTrack) throw new Error("Nenhum microfone foi encontrado.");
      const shouldRestoreAfterCaptureFailure = Boolean(
        afterCapture.voiceMutedByCaptureFailure
        || String(afterCapture.voiceError || "").startsWith("Você entrou sem microfone"),
      );
      setState?.({
        voiceLocalStream: nextStream,
        ...(shouldRestoreAfterCaptureFailure ? { voiceMuted: false, voiceMutedByCaptureFailure: false } : {}),
      });
      const latest = state();
      nextTrack.enabled = !(latest.voiceMuted || latest.voiceServerMuted);
      bindLocalTrack(nextTrack);
      await syncLocalTrackToPeers();
      stopInputStream?.(previousStream);
      clearVoiceActivityAnalyzer?.(latest.voiceClientId);
      void attachVoiceActivityStream?.(latest.voiceClientId, nextStream);
      ensureVoiceActivityTimer?.();
      if (shouldRestoreAfterCaptureFailure) {
        const local = latest.voiceParticipants?.get?.(latest.voiceClientId);
        if (local) {
          const updated = { ...local, muted: latest.voiceMuted || latest.voiceServerMuted, serverMuted: latest.voiceServerMuted };
          setState?.({ voiceParticipants: new Map(latest.voiceParticipants).set(latest.voiceClientId, updated) });
          upsertVoiceRoomParticipant?.(latest.voiceRoomId, updated);
        }
        sendVoiceMuteState?.(latest.voiceMuted);
        setState?.({ voiceError: "" });
      }
      reportClientError?.("voice_input_track_recovered", new Error("A captura do microfone foi recuperada automaticamente."), {
        reason,
        deviceSelected: Boolean(latest.selectedInputDeviceId),
      });
      return true;
    } catch (error) {
      const latest = state();
      reportClientError?.("voice_input_track_recovery_error", error, {
        reason,
        deviceSelected: Boolean(latest.selectedInputDeviceId),
      });
      setState?.({
        voiceError: error?.name === "NotAllowedError"
          ? "Permita o microfone para continuar falando."
          : "O microfone ficou indisponível. Verifique o dispositivo de entrada.",
      });
      return false;
    } finally {
      recoveryInFlight = false;
    }
  }

  async function reapplySettings() {
    if (getVoiceTestRunning?.()) {
      stopVoiceTest?.();
      await startVoiceTest?.();
    }
    const current = state();
    if (current.voiceState === "connected") await applyInputDevice?.(current.selectedInputDeviceId);
  }

  return {
    bindLocalTrack,
    isRecoveryInFlight: () => recoveryInFlight,
    recover,
    reapplySettings,
  };
}
