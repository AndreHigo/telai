function normalizeDesktopUpdate(payload, current) {
  return payload.status === "checking"
    ? { ...current, status: "idle" }
    : { ...current, ...payload };
}

export function createDesktopController({
  appVersion,
  getState,
  setState,
  setNotice,
  toggleVoiceMute,
  toggleVoiceDeafen,
}) {
  function handleDesktopUpdate(payload = {}) {
    setState({ desktopUpdate: normalizeDesktopUpdate(payload, getState().desktopUpdate) });
  }

  function handleDesktopTrayAction(action) {
    const state = getState();
    if (action === "toggle-mute") {
      if (state.voiceState !== "connected") {
        setNotice("Entre em uma sala de voz para controlar o microfone.");
        return;
      }
      toggleVoiceMute();
    } else if (action === "toggle-deafen") {
      if (state.voiceState !== "connected") {
        setNotice("Entre em uma sala de voz para controlar o áudio.");
        return;
      }
      toggleVoiceDeafen();
    }
  }

  async function loadDesktopVersion() {
    if (!window.miranteDesktop?.isDesktop) return;
    try {
      setState({ desktopVersion: await window.miranteDesktop.getVersion() || appVersion });
    } catch {
      setState({ desktopVersion: appVersion });
    }
    try {
      await window.miranteDesktop.checkForUpdates();
    } catch (error) {
      handleDesktopUpdate({ status: "error", message: error?.message || "Não foi possível verificar atualizações." });
    }
  }

  async function loadDesktopLaunchAtLogin() {
    if (!window.miranteDesktop?.getLaunchAtLogin) return;
    try {
      const result = await window.miranteDesktop.getLaunchAtLogin();
      if (result?.supported) setState({ launchAtLogin: Boolean(result.enabled) });
    } catch {
      setState({ launchAtLoginError: "Não foi possível consultar a inicialização do Telai." });
    }
  }

  async function loadDesktopHardwareAcceleration() {
    if (!window.miranteDesktop?.getHardwareAcceleration) return;
    try {
      const result = await window.miranteDesktop.getHardwareAcceleration();
      if (result?.ok) setState({ hardwareAccelerationMode: result.mode === "disabled" ? "disabled" : "auto" });
    } catch {
      setState({ hardwareAccelerationError: "Não foi possível consultar a aceleração gráfica." });
    }
  }

  async function setHardwareAcceleration(event) {
    if (!window.miranteDesktop?.setHardwareAcceleration) return;
    const nextMode = event.currentTarget.value === "disabled" ? "disabled" : "auto";
    const previousMode = getState().hardwareAccelerationMode;
    setState({ hardwareAccelerationBusy: true, hardwareAccelerationError: "" });
    try {
      const result = await window.miranteDesktop.setHardwareAcceleration(nextMode);
      if (!result?.ok) throw new Error(result?.message || "Não foi possível salvar o modo de compatibilidade.");
      setState({ hardwareAccelerationMode: nextMode });
      setNotice(nextMode === "disabled"
        ? "A aceleração gráfica será desativada ao reiniciar o Telai."
        : "A aceleração gráfica será reativada ao reiniciar o Telai.");
    } catch (error) {
      setState({ hardwareAccelerationMode: previousMode, hardwareAccelerationError: error?.message || "Não foi possível salvar o modo de compatibilidade." });
    } finally {
      setState({ hardwareAccelerationBusy: false });
    }
  }

  async function toggleLaunchAtLogin(event) {
    if (!window.miranteDesktop?.setLaunchAtLogin) return;
    const nextValue = Boolean(event.currentTarget.checked);
    setState({ launchAtLoginBusy: true, launchAtLoginError: "" });
    try {
      const result = await window.miranteDesktop.setLaunchAtLogin(nextValue);
      if (!result?.ok) throw new Error(result?.message || "Não foi possível alterar a inicialização do Telai.");
      const enabled = Boolean(result.enabled);
      setState({ launchAtLogin: enabled });
      setNotice(enabled ? "O Telai iniciará com o computador." : "O Telai não iniciará mais com o computador.");
    } catch (error) {
      setState({ launchAtLogin: !nextValue, launchAtLoginError: error?.message || "Não foi possível alterar a inicialização do Telai." });
    } finally {
      setState({ launchAtLoginBusy: false });
    }
  }

  async function updateDesktopApp() {
    try {
      const state = getState();
      if (state.desktopUpdate.status === "available") {
        handleDesktopUpdate({ status: "downloading", percent: 0 });
        await window.miranteDesktop.downloadUpdate();
      } else if (state.desktopUpdate.status === "downloaded") {
        await window.miranteDesktop.installUpdate();
      } else {
        handleDesktopUpdate({ status: "idle", message: "" });
        await window.miranteDesktop.checkForUpdates();
      }
    } catch (error) {
      handleDesktopUpdate({ status: "error", message: error?.message || "Não foi possível atualizar agora." });
    }
  }

  function resolveBroadcastAudioSource(source) {
    if (!source?.processId) return null;
    return {
      processId: Number(source.processId),
      name: String(source.name || source.processName || "aplicativo").trim(),
    };
  }

  async function requestBroadcastAudioSource() {
    if (!window.miranteDesktop?.getDisplayMediaSources) return null;
    const sources = await window.miranteDesktop.getDisplayMediaSources();
    const candidates = (sources || []).filter((source) => source?.kind === "window" && source?.processId && !/(discord|telai|mirante)/i.test(`${source.processName || ""} ${source.name || ""}`));
    setState({ broadcastAudioSources: candidates });
    if (!candidates.length) return null;
    setState({ showBroadcastAudioPicker: true });
    return new Promise((resolve, reject) => {
      setState({ broadcastAudioSelection: { resolve, reject } });
    });
  }

  function selectBroadcastAudioSource(source) {
    const state = getState();
    const selected = resolveBroadcastAudioSource(source);
    state.broadcastAudioSelection?.resolve(selected);
    setState({ showBroadcastAudioPicker: false, broadcastAudioSources: [], broadcastAudioSelection: null });
  }

  function skipBroadcastAudioSource() {
    const state = getState();
    state.broadcastAudioSelection?.resolve(null);
    setState({ showBroadcastAudioPicker: false, broadcastAudioSources: [], broadcastAudioSelection: null });
  }

  function selectDisplaySource(source) {
    if (!window.miranteDesktop?.isDesktop) return;
    const state = getState();
    state.displaySourceSelection?.resolve(source);
    setState({
      showDisplayPicker: false,
      displaySources: [],
      broadcastDisplaySurface: source.kind === "screen" ? "screen" : "window",
      broadcastSelectedSourceName: source.name || (source.kind === "screen" ? "Tela inteira" : "Janela escolhida"),
      selectedDisplayProcessId: source.processId || null,
      displaySourceSelection: null,
      displaySourceFilter: "all",
    });
    window.miranteDesktop.selectDisplaySource(source.id, { audioMode: state.audioMode === "system" ? "none" : state.audioMode });
  }

  function cancelDisplayPicker() {
    const state = getState();
    state.displaySourceSelection?.reject(new DOMException("Seleção de captura cancelada.", "NotAllowedError"));
    setState({ showDisplayPicker: false, displaySources: [], displaySourceFilter: "all", selectedDisplayProcessId: null, broadcastDisplaySurface: null, displaySourceSelection: null });
    window.miranteDesktop?.cancelDisplaySource?.();
  }

  return {
    cancelDisplayPicker,
    handleDesktopTrayAction,
    handleDesktopUpdate,
    loadDesktopHardwareAcceleration,
    loadDesktopLaunchAtLogin,
    loadDesktopVersion,
    requestBroadcastAudioSource,
    selectBroadcastAudioSource,
    selectDisplaySource,
    setHardwareAcceleration,
    skipBroadcastAudioSource,
    toggleLaunchAtLogin,
    updateDesktopApp,
  };
}
