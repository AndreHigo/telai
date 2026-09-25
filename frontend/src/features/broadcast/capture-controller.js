export function createBroadcastCaptureController({
  getDisplayMedia,
  getQualityProfiles,
  getSelectedVoiceAudioConstraints,
  getState,
  getUserMedia,
  getDesktopBridge,
  loadAudioDevices,
  processVoiceInputStream,
  rememberCapturedInputDevice,
  reportClientError,
  setState,
  stopVoiceInputStream,
}) {
  const state = () => getState();

  function captureVideoConstraints(profile, { display = false } = {}) {
    const constraints = {
      width: { ideal: profile.width, max: profile.width },
      height: { ideal: profile.height, max: profile.height },
      frameRate: { ideal: profile.maxFramerate, max: profile.maxFramerate },
    };
    if (display) constraints.resizeMode = { ideal: "crop-and-scale" };
    return constraints;
  }

  function captureSettingsExceedProfile(track, profile) {
    const settings = track?.getSettings?.() || {};
    return [
      [settings.width, profile.width],
      [settings.height, profile.height],
      [settings.frameRate, profile.maxFramerate],
    ].some(([actual, maximum]) => Number.isFinite(Number(actual)) && Number(actual) > maximum + 1);
  }

  async function constrainCapturedVideoTrack(track, profile) {
    if (!track) throw new Error("A fonte escolhida não forneceu vídeo.");
    if (typeof track.applyConstraints !== "function") {
      throw new Error("Seu navegador não permite limitar a captura desta janela. Atualize o navegador e tente novamente.");
    }
    const profiles = getQualityProfiles();
    const attempts = [profile, profile === profiles.economy ? null : profiles.economy].filter(Boolean);
    let lastError = null;
    for (const attempt of attempts) {
      try {
        await track.applyConstraints(captureVideoConstraints(attempt, { display: true }));
        if (!captureSettingsExceedProfile(track, attempt)) {
          if (attempt !== profile) setState({ notice: "A captura foi ajustada para o modo econômico para manter o navegador estável." });
          return attempt;
        }
        lastError = new Error("O navegador manteve a janela acima do limite solicitado.");
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(lastError?.name === "OverconstrainedError"
      ? "O navegador não conseguiu reduzir a resolução desta janela. Escolha Econômica ou feche outros jogos e tente novamente."
      : "Não foi possível preparar a captura desta janela com segurança. Tente novamente em qualidade Econômica.");
  }

  async function constrainCapturedStream(stream, profile) {
    try {
      await constrainCapturedVideoTrack(stream?.getVideoTracks?.()[0], profile);
      return stream;
    } catch (error) {
      stream?.getTracks?.().forEach((track) => track.stop());
      throw error;
    }
  }

  function displayMediaConstraints(profile) {
    const current = state();
    const desktopSystemAudio = Boolean(getDesktopBridge()?.isDesktop && current.audioMode === "system");
    return {
      video: captureVideoConstraints(profile, { display: true }),
      audio: current.audioMode === "none" || desktopSystemAudio
        ? false
        : { suppressLocalAudioPlayback: false },
      systemAudio: current.audioMode === "system" ? "include" : "exclude",
      windowAudio: current.audioMode === "system" ? "system" : "window",
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
    };
  }

  async function captureDisplayStream(profile) {
    const constraints = displayMediaConstraints(profile);
    const desktop = getDesktopBridge();
    try {
      const stream = await getDisplayMedia(constraints);
      return constrainCapturedStream(stream, profile);
    } catch (error) {
      const canUseLegacyDesktopCapture = desktop?.isDesktop
        && typeof desktop.getDisplayMediaSources === "function"
        && ["NotSupportedError", "NotReadableError", "TypeError"].includes(error?.name);
      if (!canUseLegacyDesktopCapture) throw error;
    }

    const sources = await desktop.getDisplayMediaSources();
    if (!sources?.length) throw new Error("Nenhuma tela ou janela disponível para compartilhar.");
    const source = await new Promise((resolve, reject) => {
      const current = state();
      setState({
        displaySources: sources,
        displaySourceFilter: current.broadcastSelectionKind === "screen" ? "screen" : "window",
        showDisplayPicker: true,
        displaySourceSelection: { resolve, reject },
      });
    });
    try {
      const current = state();
      const stream = await getUserMedia({
        audio: current.audioMode === "system" && !desktop?.isDesktop
          ? { mandatory: { chromeMediaSource: "desktop" } }
          : false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
            minWidth: profile.width,
            maxWidth: profile.width,
            minHeight: profile.height,
            maxHeight: profile.height,
            maxFrameRate: profile.maxFramerate,
          },
        },
      });
      return constrainCapturedStream(stream, profile);
    } catch (error) {
      if (!["NotSupportedError", "NotReadableError", "TrackStartError"].includes(error?.name)) throw error;
      throw new Error("O sistema não conseguiu iniciar a captura desta tela ou janela. Tente novamente ou atualize o aplicativo.");
    } finally {
      setState({ showDisplayPicker: false, displaySources: [], displaySourceFilter: "all" });
    }
  }

  async function refreshBroadcastDevices() {
    try {
      const permissionStream = await getUserMedia({ video: true, audio: false });
      permissionStream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      if (error?.name !== "NotAllowedError") reportClientError("broadcast_camera_permission_refresh", error);
    }
    await loadAudioDevices(true);
  }

  async function captureBroadcastMicrophoneStream() {
    const current = state();
    const requestedInputDeviceId = current.selectedInputDeviceId;
    const rawStream = await getUserMedia({ audio: getSelectedVoiceAudioConstraints(), video: false });
    const microphoneTrack = rawStream.getAudioTracks()[0];
    if (!microphoneTrack) {
      rawStream.getTracks().forEach((track) => track.stop());
      throw new Error("Nenhum microfone foi encontrado para a transmissão.");
    }
    try {
      rememberCapturedInputDevice(microphoneTrack, requestedInputDeviceId);
      const processedStream = await processVoiceInputStream(rawStream);
      setState({ broadcastMicrophoneStream: processedStream });
      return processedStream;
    } catch (error) {
      stopVoiceInputStream(rawStream);
      throw error;
    }
  }

  async function captureBroadcastCameraStream(profile) {
    const current = state();
    const video = captureVideoConstraints(profile);
    if (current.broadcastCameraDeviceId) video.deviceId = { exact: current.broadcastCameraDeviceId };
    const stream = await getUserMedia({ video, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error("A câmera escolhida não forneceu vídeo.");
    }
    return stream;
  }

  return {
    captureBroadcastCameraStream,
    captureBroadcastMicrophoneStream,
    captureDisplayStream,
    refreshBroadcastDevices,
  };
}
