import {
  audioDeviceDisplayLabel,
  normalizeAudioDeviceLabel,
  rawAudioDeviceLabel,
} from "./voice-device-utils.js";

function storageSet(storage, key, value, reportClientError, kind) {
  try { storage?.setItem(key, value); }
  catch (error) { reportClientError(kind, error); }
}

function storageRemove(storage, key, reportClientError, kind) {
  try { storage?.removeItem(key); }
  catch (error) { reportClientError(kind, error); }
}

export function createVoiceDeviceController({
  getState,
  setState,
  getUserMedia,
  enumerateDevices,
  getVoiceAudioConstraints,
  getSelectedVoiceAudioConstraints,
  persistPreferredInputDeviceId,
  clearUnavailableInputDevice,
  reportClientError,
  storage = globalThis.localStorage,
  captureInputStream,
  stopInputStream,
  stopVoiceTest,
  getRemoteAudio,
  playRemoteAudio,
  bindLocalTrack,
  syncLocalTrackToPeers,
  attachVoiceActivityStream,
  clearVoiceActivityAnalyzer,
  ensureVoiceActivityTimer,
  upsertVoiceRoomParticipant,
  sendVoiceMuteState,
} = {}) {
  if (typeof getState !== "function" || typeof setState !== "function") throw new TypeError("getState e setState são obrigatórios");
  if (typeof reportClientError !== "function") throw new TypeError("reportClientError precisa ser uma função");

  async function loadAudioDevices(requestPermission = false) {
    if (typeof enumerateDevices !== "function") {
      setState({ voiceDevicesError: "Este navegador não permite escolher dispositivos de áudio." });
      return;
    }
    const current = getState();
    const requestRevision = (current.audioDevicesRequestRevision || 0) + 1;
    const requestedInputDeviceId = current.selectedInputDeviceId;
    setState({ audioDevicesRequestRevision: requestRevision, voiceDevicesBusy: true, voiceDevicesError: "" });
    let permissionStream;
    try {
      if (requestPermission) {
        try {
          permissionStream = await getUserMedia({ audio: getSelectedVoiceAudioConstraints(), video: false });
        } catch (error) {
          const canRefreshWithDefault = Boolean(current.selectedInputDeviceId)
            && ["NotFoundError", "OverconstrainedError"].includes(error?.name);
          if (!canRefreshWithDefault) throw error;
          reportClientError("voice_device_permission_refresh", error, { requestedDeviceId: current.selectedInputDeviceId });
          permissionStream = await getUserMedia({ audio: getVoiceAudioConstraints(), video: false });
        }
      }
      const devices = await enumerateDevices();
      if (getState().audioDevicesRequestRevision !== requestRevision) return;
      const allAudioInputDevices = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: String(device.deviceId || ""),
          kind: device.kind,
          groupId: String(device.groupId || ""),
          rawLabel: String(device.label || "").replace(/\s+/g, " ").trim(),
          label: audioDeviceDisplayLabel(device, index, "input"),
        }));
      setState({
        allAudioInputDevices,
        audioInputDevices: allAudioInputDevices,
        cameraInputDevices: devices
          .filter((device) => device.kind === "videoinput")
          .map((device, index) => ({
            deviceId: String(device.deviceId || ""),
            kind: device.kind,
            groupId: String(device.groupId || ""),
            label: audioDeviceDisplayLabel(device, index, "camera"),
          })),
        audioOutputDevices: devices
          .filter((device) => device.kind === "audiooutput")
          .map((device, index) => ({
            deviceId: String(device.deviceId || ""),
            kind: device.kind,
            groupId: String(device.groupId || ""),
            label: audioDeviceDisplayLabel(device, index, "output"),
          })),
      });

      const next = getState();
      if (next.selectedInputDeviceId) {
        const selectedDevice = next.allAudioInputDevices.find((device) => device.deviceId === next.selectedInputDeviceId);
        const matchingDevice = selectedDevice || (next.selectedInputDeviceLabel
          ? next.allAudioInputDevices.find((device) => normalizeAudioDeviceLabel(rawAudioDeviceLabel(device)) === normalizeAudioDeviceLabel(next.selectedInputDeviceLabel))
          : null);
        if (matchingDevice) {
          const currentLabel = rawAudioDeviceLabel(matchingDevice);
          setState({ selectedInputDeviceId: matchingDevice.deviceId, ...(currentLabel ? { selectedInputDeviceLabel: currentLabel } : {}) });
          storageSet(storage, "mirante-voice-input", matchingDevice.deviceId, reportClientError, "voice_input_device_persist_error");
          if (currentLabel) storageSet(storage, "mirante-voice-input-label", currentLabel, reportClientError, "voice_input_device_persist_error");
          if (matchingDevice.deviceId !== requestedInputDeviceId) persistPreferredInputDeviceId(matchingDevice.deviceId);
        }
      }
      const refreshed = getState();
      if (refreshed.selectedInputDeviceId && !refreshed.allAudioInputDevices.some((device) => device.deviceId === refreshed.selectedInputDeviceId)) {
        clearUnavailableInputDevice(refreshed.selectedInputDeviceId);
      }
      if (requestPermission && getState().selectedInputDeviceId && getState().selectedInputDeviceId !== requestedInputDeviceId) {
        try {
          const remappedPermissionStream = await getUserMedia({ audio: getSelectedVoiceAudioConstraints(), video: false });
          remappedPermissionStream?.getTracks?.().forEach((track) => track.stop());
        } catch (error) {
          reportClientError("voice_device_remapped_capture", error, { requestedDeviceId: getState().selectedInputDeviceId });
        }
      }
    } catch (error) {
      setState({ voiceDevicesError: error.name === "NotAllowedError" ? "Permita o microfone para listar seus dispositivos." : "Não foi possível listar os dispositivos de áudio." });
    } finally {
      permissionStream?.getTracks?.().forEach((track) => track.stop());
      if (getState().audioDevicesRequestRevision === requestRevision) setState({ voiceDevicesBusy: false });
    }
  }

  async function applyVoiceOutputDevice(deviceId = getState().selectedOutputDeviceId) {
    const selectedOutputDeviceId = deviceId || "";
    setState({ selectedOutputDeviceId, voiceDevicesError: "" });
    if (selectedOutputDeviceId) storageSet(storage, "mirante-voice-output", selectedOutputDeviceId, reportClientError, "voice_output_device_persist_error");
    else storageRemove(storage, "mirante-voice-output", reportClientError, "voice_output_device_persist_error");
    const current = getState();
    if (current.user) current.persistOutputPreference?.(selectedOutputDeviceId);
    for (const [participantId, audio] of getRemoteAudio()) {
      if (typeof audio.setSinkId !== "function") {
        if (selectedOutputDeviceId) setState({ voiceDevicesError: "A saída de áudio personalizada não é compatível neste navegador." });
        continue;
      }
      try {
        await audio.setSinkId(selectedOutputDeviceId || "default");
      } catch (error) {
        reportClientError("voice_output_device_fallback", error, { deviceSelected: Boolean(selectedOutputDeviceId) });
        setState({ selectedOutputDeviceId: "", voiceDevicesError: "A saída escolhida não está disponível; voltamos para a saída padrão." });
        storageRemove(storage, "mirante-voice-output", reportClientError, "voice_output_device_persist_error");
        await audio.setSinkId("default").catch(() => {});
      }
      void playRemoteAudio(participantId, audio).catch(() => {});
    }
  }

  async function applyVoiceInputDevice(deviceId = getState().selectedInputDeviceId) {
    const current = getState();
    const selectedInputDeviceId = deviceId || "";
    const selectionRevision = (current.voiceInputSelectionRevision || 0) + 1;
    const selectedDevice = current.allAudioInputDevices.find((device) => device.deviceId === selectedInputDeviceId);
    const selectedInputDeviceLabel = selectedDevice ? rawAudioDeviceLabel(selectedDevice) : current.selectedInputDeviceLabel;
    setState({ selectedInputDeviceId, selectedInputDeviceLabel, voiceInputSelectionRevision: selectionRevision, voiceDevicesError: "" });
    if (selectedInputDeviceId) {
      storageSet(storage, "mirante-voice-input", selectedInputDeviceId, reportClientError, "voice_input_device_persist_error");
      if (selectedInputDeviceLabel) storageSet(storage, "mirante-voice-input-label", selectedInputDeviceLabel, reportClientError, "voice_input_device_persist_error");
    } else {
      storageRemove(storage, "mirante-voice-input", reportClientError, "voice_input_device_persist_error");
      storageRemove(storage, "mirante-voice-input-label", reportClientError, "voice_input_device_persist_error");
      setState({ selectedInputDeviceLabel: "" });
    }
    persistPreferredInputDeviceId(selectedInputDeviceId);
    if (getState().voiceState !== "connected") return;
    try {
      if (getState().voiceTestRunning) stopVoiceTest();
      const nextStream = await captureInputStream({ expectedDeviceId: selectedInputDeviceId, selectionRevision });
      const usedDefaultFallback = getState().isFallbackStream(nextStream);
      getState().deleteFallbackStream(nextStream);
      const latest = getState();
      if (selectionRevision !== latest.voiceInputSelectionRevision || (selectedInputDeviceId !== latest.selectedInputDeviceId && !usedDefaultFallback)) {
        stopInputStream(nextStream);
        return;
      }
      const nextTrack = nextStream.getAudioTracks()[0];
      const previousStream = latest.voiceLocalStream;
      const shouldRestoreAfterCaptureFailure = latest.voiceMutedByCaptureFailure || latest.voiceError.startsWith("Você entrou sem microfone");
      if (shouldRestoreAfterCaptureFailure) setState({ voiceMuted: false, voiceMutedByCaptureFailure: false });
      nextTrack.enabled = !(latest.voiceMuted || latest.voiceServerMuted);
      setState({ voiceLocalStream: nextStream });
      bindLocalTrack(nextTrack);
      if (!await syncLocalTrackToPeers()) throw new Error("Não foi possível publicar o microfone escolhido para todos os participantes.");
      stopInputStream(previousStream);
      clearVoiceActivityAnalyzer(latest.voiceClientId);
      void attachVoiceActivityStream(latest.voiceClientId, nextStream);
      ensureVoiceActivityTimer();
      if (shouldRestoreAfterCaptureFailure) {
        const local = latest.voiceParticipants.get(latest.voiceClientId);
        if (local) {
          const updated = { ...local, muted: getState().voiceMuted || latest.voiceServerMuted, serverMuted: latest.voiceServerMuted };
          setState({ voiceParticipants: new Map(getState().voiceParticipants).set(latest.voiceClientId, updated) });
          upsertVoiceRoomParticipant(latest.voiceRoomId, updated);
        }
        sendVoiceMuteState(getState().voiceMuted);
        setState({ voiceError: "" });
      }
    } catch (error) {
      if (error?.name === "SelectedDeviceCaptureSupersededError") return;
      reportClientError("voice_input_device_apply_error", error, { deviceSelected: Boolean(getState().selectedInputDeviceId) });
      setState({ voiceDevicesError: error.name === "NotAllowedError"
        ? "Permita o microfone para trocar de dispositivo."
        : ["NotFoundError", "OverconstrainedError"].includes(error?.name)
          ? "O microfone escolhido não está disponível. Atualize os dispositivos e tente novamente."
          : error.name === "SelectedDeviceMismatchError"
            ? "O navegador não entregou o microfone escolhido. A seleção foi preservada; atualize os dispositivos e tente novamente."
            : "Não foi possível trocar o microfone." });
    }
  }

  return { loadAudioDevices, applyVoiceInputDevice, applyVoiceOutputDevice };
}
