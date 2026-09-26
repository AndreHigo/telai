export function createBroadcastSetupController({
  beginBroadcast,
  getState,
  publicBroadcastSourceLabel,
  setAudioMode,
  setNavigationState,
  setNotice,
  setSelectedQuality,
  setState,
}) {
  const state = () => getState?.() || {};

  function openPublicBroadcastSetup() {
    const current = state();
    setState({
      broadcastVisibility: "public",
      publicBroadcastTitle: current.broadcastTitle || `Transmissão de ${current.user?.displayName || current.user?.username || "usuário"}`,
      publicBroadcastSourceKind: "screen",
      publicBroadcastMicrophoneEnabled: false,
      publicBroadcastCameraEnabled: false,
      publicBroadcastCameraDeviceId: current.broadcastCameraDeviceId || "",
      publicBroadcastQuality: current.selectedQuality === "high" ? "balanced" : current.selectedQuality,
      showPublicBroadcastSetup: true,
    });
  }

  function cancelPublicBroadcastSetup() {
    if (state().broadcastState === "starting") return;
    setState({ showPublicBroadcastSetup: false });
  }

  function requestBroadcastStart(sourceType = "screen") {
    const current = state();
    if (current.broadcastState === "live") {
      setNavigationState({ view: "broadcast" });
      setNotice("Você já está transmitindo. Use “Voltar à live” ou encerre a transmissão antes de iniciar outra.");
      return;
    }
    if (current.broadcastState === "starting" || current.broadcastState === "stopping") {
      setNotice(current.broadcastState === "stopping"
        ? "A live anterior ainda está sendo encerrada. Aguarde um instante para iniciar outra."
        : "Sua transmissão ainda está sendo preparada. Aguarde um instante.");
      return;
    }
    if (sourceType !== "camera" && !(current.view === "groups" && current.selectedRoom?.kind === "voice" && current.selectedGroupId)) {
      openPublicBroadcastSetup();
      return;
    }
    const nextSourceType = sourceType === "camera" ? "camera" : "screen";
    setState({ pendingBroadcastSourceType: nextSourceType });
    if (current.view === "groups" && current.selectedRoom?.kind === "voice" && current.selectedGroupId) {
      setState({ broadcastVisibility: "private", pendingBroadcastContext: { groupId: current.selectedGroupId, voiceRoomId: current.selectedRoom.id }, showBroadcastVisibilityDialog: true });
      return;
    }
    setState({ pendingBroadcastContext: null, broadcastSourceType: nextSourceType, broadcastState: "idle" });
    setNavigationState({ view: "broadcast" });
    setNotice("Escolha o áudio, a câmera e o microfone. Depois clique em iniciar a transmissão.");
  }

  async function confirmPublicBroadcastSetup() {
    const current = state();
    const title = String(current.publicBroadcastTitle || "").trim();
    if (!title) {
      setState({ broadcastError: "Informe um título para a transmissão." });
      return;
    }
    setState({ broadcastError: "", broadcastTitle: title });
    setSelectedQuality(current.publicBroadcastQuality);
    setAudioMode(current.publicBroadcastSourceKind === "screen" ? "system" : "source");
    setState({
      broadcastMicrophoneEnabled: current.publicBroadcastMicrophoneEnabled,
      broadcastCameraEnabled: current.publicBroadcastCameraEnabled,
      broadcastCameraDeviceId: current.publicBroadcastCameraEnabled ? current.publicBroadcastCameraDeviceId : "",
      broadcastSelectionKind: current.publicBroadcastSourceKind,
      showPublicBroadcastSetup: false,
      pendingBroadcastContext: null,
      pendingBroadcastSourceType: "screen",
      broadcastSourceType: "screen",
      broadcastState: "idle",
    });
    setNavigationState({ view: "broadcast" });
    setNotice(`Escolha a fonte de vídeo para ${publicBroadcastSourceLabel(current.publicBroadcastSourceKind).toLocaleLowerCase()}.`);
    await beginBroadcast({ sourceType: "screen", visibility: "public", title });
  }

  function waitForPublicBroadcastReview() {
    setState({ showPublicBroadcastReview: true });
    return new Promise((resolve, reject) => {
      setState({ publicBroadcastReviewSelection: { resolve, reject } });
    });
  }

  function confirmPublicBroadcastReview() {
    const current = state();
    setState({ showPublicBroadcastReview: false });
    current.publicBroadcastReviewSelection?.resolve(true);
    setState({ publicBroadcastReviewSelection: null });
  }

  function cancelPublicBroadcastReview() {
    const current = state();
    setState({ showPublicBroadcastReview: false });
    current.publicBroadcastReviewSelection?.reject(new DOMException("Revisão da transmissão cancelada.", "AbortError"));
    setState({ publicBroadcastReviewSelection: null });
  }

  return {
    cancelPublicBroadcastReview,
    cancelPublicBroadcastSetup,
    confirmPublicBroadcastReview,
    confirmPublicBroadcastSetup,
    openPublicBroadcastSetup,
    requestBroadcastStart,
    waitForPublicBroadcastReview,
  };
}
