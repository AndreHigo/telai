export function createBroadcastStartController({
  api,
  attachBroadcastPreview,
  buildBroadcastOutputStream,
  captureBroadcastCameraStream,
  captureBroadcastMicrophoneStream,
  captureDisplayStream,
  connectBroadcastSocket,
  formatBroadcastCaptureError,
  formatBroadcastMissingAudio,
  getState,
  handleBroadcastVideoTrackEnded,
  loadGroup,
  loadStreams,
  randomRoom,
  reportClientError,
  requestBroadcastAudioSource,
  sendBroadcast,
  setGroupState,
  setNavigationState,
  setNotice,
  setState,
  startSystemAudioBridge,
  startWindowAudioBridge,
  stopBroadcastAudioMix,
  stopBroadcastVideoComposition,
  stopRelayRecorder,
  stopVoiceInputStream,
  stopWindowAudioBridge,
  startRelayRecorder,
  waitForPublicBroadcastReview,
}) {
  const state = () => getState?.() || {};

  async function begin(options = {}) {
    let sourceType = options.sourceType === "camera" ? "camera" : "screen";
    let visibility = options.visibility === "private" ? "private" : "public";
    let groupId = visibility === "private" ? options.groupId || null : null;
    let voiceRoomId = visibility === "private" ? options.voiceRoomId || null : null;
    const current = state();

    if (current.broadcastState === "live") {
      await current.returnToBroadcast?.();
      setNotice("Você já está transmitindo. Encerre a live atual antes de iniciar outra.");
      return;
    }
    if (current.broadcastState === "starting" || current.broadcastState === "stopping") {
      setNotice(current.broadcastState === "stopping"
        ? "A live anterior ainda está sendo encerrada. Aguarde um instante para iniciar outra."
        : "Sua transmissão ainda está sendo preparada. Aguarde um instante.");
      return;
    }

    const title = options.title ? String(options.title).trim().slice(0, 120) : current.broadcastTitle;
    setState({
      ...(options.title ? { broadcastTitle: title } : {}),
      pendingBroadcastContext: null,
      broadcastError: "",
      broadcastAudioWarning: "",
      broadcastChatMessages: [],
      broadcastChatMessageIds: new Set(),
      broadcastChatDraft: "",
      broadcastSourceType: sourceType,
      broadcastDisplaySurface: null,
      selectedDisplayProcessId: null,
      broadcastDisplayStream: null,
      broadcastCameraStream: null,
      broadcastSourceAudioTrack: null,
      broadcastAudioProcessId: null,
      broadcastAudioSourceName: "",
      broadcastMicrophoneStream: null,
      broadcastState: "starting",
    });
    setNavigationState({ view: "broadcast" });

    try {
      const latest = state();
      if (!globalThis.isSecureContext && !["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) {
        throw new Error("A captura de tela exige HTTPS ou localhost.");
      }
      const profile = latest.qualityProfiles?.[latest.selectedQuality];
      let sourceAudioTrack = null;
      let displaySurface = null;
      let displayStream = null;
      let cameraStream = null;

      if (sourceType === "camera") {
        cameraStream = await captureBroadcastCameraStream(profile);
        setState({ broadcastCameraStream: cameraStream });
      } else {
        displayStream = await captureDisplayStream(profile);
        setState({ broadcastDisplayStream: displayStream });
        displaySurface = displayStream.getVideoTracks?.()[0]?.getSettings?.().displaySurface || null;
        if (displaySurface === "monitor" || displaySurface === "screen") setState({ broadcastDisplaySurface: "screen" });
        else if (displaySurface) setState({ broadcastDisplaySurface: "window" });
        const capturedAudioTracks = displayStream.getAudioTracks();
        const currentAudioMode = state().audioMode;
        sourceAudioTrack = currentAudioMode === "none" ? null : capturedAudioTracks[0] || null;
        if (currentAudioMode === "system" && globalThis.miranteDesktop?.isDesktop) {
          capturedAudioTracks.forEach((track) => track.stop());
          try {
            sourceAudioTrack = await startSystemAudioBridge();
            if (!sourceAudioTrack) throw new Error("O Windows não encontrou aplicativos para incluir no áudio filtrado.");
          } catch (error) {
            setState({ audioMode: "none", broadcastAudioWarning: `${error.message || "Não foi possível preparar o áudio filtrado."} A transmissão continuará sem áudio do computador.` });
            sourceAudioTrack = null;
          }
        } else if (state().broadcastDisplaySurface === "screen" && currentAudioMode === "source" && globalThis.miranteDesktop?.isDesktop) {
          const selectedAudioSource = await requestBroadcastAudioSource();
          if (selectedAudioSource?.processId) {
            setState({ broadcastAudioProcessId: selectedAudioSource.processId, broadcastAudioSourceName: selectedAudioSource.name });
            sourceAudioTrack = await startWindowAudioBridge(selectedAudioSource.processId);
            capturedAudioTracks.forEach((track) => track.stop());
          } else {
            capturedAudioTracks.forEach((track) => track.stop());
            setState({ audioMode: "none", broadcastAudioWarning: "A transmissão seguirá sem áudio do computador. Escolha um aplicativo para incluir somente o áudio dele." });
            sourceAudioTrack = null;
          }
        }
        if (globalThis.miranteDesktop?.isDesktop && state().audioMode === "source" && state().broadcastDisplaySurface !== "screen") {
          if (state().selectedDisplayProcessId) {
            try {
              sourceAudioTrack = await startWindowAudioBridge(state().selectedDisplayProcessId);
              capturedAudioTracks.forEach((track) => track.stop());
            } catch (error) {
              capturedAudioTracks.forEach((track) => track.stop());
              sourceAudioTrack = null;
              setState({ broadcastAudioWarning: error.message || "Não foi possível isolar o áudio da janela escolhida." });
            }
          } else {
            capturedAudioTracks.forEach((track) => track.stop());
            sourceAudioTrack = null;
            setState({ broadcastAudioWarning: "Não foi possível identificar o processo da janela. A transmissão seguirá sem áudio da fonte para não capturar o computador inteiro." });
          }
        } else if (state().audioMode === "none") {
          capturedAudioTracks.forEach((track) => track.stop());
        }
      }

      const latestAfterCapture = state();
      if (sourceType === "screen" && globalThis.miranteDesktop?.isDesktop && latestAfterCapture.audioMode !== "none" && !sourceAudioTrack) {
        setState({ broadcastAudioWarning: latestAfterCapture.broadcastAudioWarning || "O Windows não entregou áudio para esta captura. Verifique o volume do jogo e tente escolher a janela novamente." });
      }
      if (sourceType === "screen" && state().audioMode !== "none" && !sourceAudioTrack && !latestAfterCapture.isDesktop) {
        throw new Error(formatBroadcastMissingAudio({ isDesktop: latestAfterCapture.isDesktop, displaySurface: latestAfterCapture.broadcastDisplaySurface, selectionKind: latestAfterCapture.broadcastSelectionKind }));
      }
      if (visibility === "public" && sourceType === "screen") await waitForPublicBroadcastReview();

      setState({ broadcastCameraEnabled: sourceType === "camera" || Boolean(state().broadcastCameraEnabled) });
      if (sourceType === "screen" && state().broadcastCameraEnabled) {
        try {
          cameraStream = await captureBroadcastCameraStream(profile);
          setState({ broadcastCameraStream: cameraStream });
        } catch (error) {
          setState({ broadcastAudioWarning: state().broadcastAudioWarning || "A câmera não pôde ser iniciada; a transmissão continuará somente com a tela." });
          reportClientError("broadcast_camera_capture_error", error, { deviceId: state().broadcastCameraDeviceId });
        }
      }
      if (state().broadcastMicrophoneEnabled) {
        try {
          await captureBroadcastMicrophoneStream();
        } catch (error) {
          if (sourceType === "camera") throw error;
          setState({ broadcastAudioWarning: state().broadcastAudioWarning || "O microfone não pôde ser iniciado; a transmissão continuará sem sua voz." });
          reportClientError("broadcast_microphone_capture_error", error, { requestedDeviceId: state().selectedInputDeviceId });
        }
      }

      const nextBroadcastStream = await buildBroadcastOutputStream({
        displayStream,
        cameraStream,
        sourceAudioTrack,
        microphoneStream: state().broadcastMicrophoneStream,
        profile,
      });
      setState({ broadcastStream: nextBroadcastStream, broadcastSourceAudioTrack: sourceAudioTrack });
      const videoTrack = nextBroadcastStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("A fonte escolhida não forneceu vídeo.");
      setState({ activeDisplayProcessId: state().selectedDisplayProcessId });
      displayStream?.getVideoTracks?.()[0]?.addEventListener("ended", () => { handleBroadcastVideoTrackEnded(displayStream?.getVideoTracks?.()[0]); }, { once: true });
      cameraStream?.getVideoTracks?.()[0]?.addEventListener("ended", () => { handleBroadcastVideoTrackEnded(cameraStream?.getVideoTracks?.()[0]); }, { once: true });
      if (videoTrack && "contentHint" in videoTrack) videoTrack.contentHint = "detail";
      videoTrack.addEventListener("ended", () => { handleBroadcastVideoTrackEnded(videoTrack); }, { once: true });

      const roomId = randomRoom();
      const streamResult = await api("/api/streams", { method: "POST", body: JSON.stringify({ roomName: roomId, title: state().broadcastTitle, visibility, groupId, voiceRoomId }) });
      setState({
        broadcastRoomId: roomId,
        broadcastStreamId: streamResult.stream.id,
        broadcastInvite: `${globalThis.location.origin}${streamResult.stream.publicPath || `/?room=${roomId}&mode=viewer`}`,
      });
      await connectBroadcastSocket();
      sendBroadcast({ type: "join", role: "host", roomId });
      if (state().mediaMode === "relay") await startRelayRecorder();
      setState({ broadcastState: "live" });
      await attachBroadcastPreview();
      await loadStreams();
      if (visibility === "private" && groupId) {
        await loadGroup(groupId);
        setGroupState({ selectedRoomId: voiceRoomId || state().selectedRoomId });
      }
    } catch (error) {
      const latest = state();
      reportClientError("broadcast_start_error", error, { sourceType, visibility, mediaMode: latest.mediaMode });
      const canceled = ["NotAllowedError", "AbortError"].includes(error?.name);
      await stopRelayRecorder();
      setState({ broadcastError: canceled ? "" : formatBroadcastCaptureError(error, sourceType), broadcastState: canceled ? "idle" : "error" });
      if (canceled) setNotice(sourceType === "camera"
        ? "Acesso à câmera cancelado. Quando quiser, tente iniciar a transmissão novamente."
        : "Seleção da tela cancelada. Quando quiser, escolha uma janela ou tela para iniciar.");
      setState({ showDisplayPicker: false, displaySources: [], selectedDisplayProcessId: null, activeDisplayProcessId: null });
      await stopWindowAudioBridge();
      stopVoiceInputStream(state().broadcastMicrophoneStream);
      setState({ broadcastMicrophoneStream: null });
      stopBroadcastVideoComposition();
      await stopBroadcastAudioMix();
      state().broadcastDisplayStream?.getTracks?.().forEach((track) => track.stop());
      state().broadcastCameraStream?.getTracks?.().forEach((track) => track.stop());
      setState({ broadcastDisplayStream: null, broadcastCameraStream: null, broadcastCameraEnabled: false, broadcastSourceAudioTrack: null, broadcastDisplaySurface: null });
      state().broadcastStream?.getTracks?.().forEach((track) => track.stop());
      const failedStreamId = state().broadcastStreamId;
      setState({ broadcastStream: null });
      setState({ broadcastAudioWarning: "" });
      if (failedStreamId) {
        try {
          await api(`/api/streams/${failedStreamId}/end`, { method: "POST" });
          setState({ broadcastStreamId: "" });
        } catch (cleanupError) {
          reportClientError("broadcast_start_cleanup_error", cleanupError, { streamId: failedStreamId, mediaMode: latest.mediaMode });
          setState({ broadcastError: `${state().broadcastError || "A transmissão falhou."} O servidor ainda não confirmou o encerramento; tente confirmar novamente.` });
        }
      }
      state().broadcastSocket?.close?.();
      setState({ broadcastSocket: null });
    }
  }

  return { begin };
}
