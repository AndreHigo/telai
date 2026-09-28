import { createClientPollingController } from "../services/client-polling.js";

export function createAppLifecycleController({
  getState,
  setState,
  windowLifecycle,
  stateUnsubscribers = [],
  detectViewerRoute,
  loadMaintenance,
  handleNavigationViewport,
  readVoiceReconnectSession,
  setVisualState,
  api,
  setAuthState,
  canonicalizeAuthenticatedRoute,
  maybeShowReleaseNotes,
  refresh,
  loadAudioDevices,
  loadIceConfiguration,
  redeemPendingInvite,
  openPendingChannelRoute,
  loadDesktopVersion,
  loadDesktopLaunchAtLogin,
  loadDesktopHardwareAcceleration,
  handleDesktopPushToTalk,
  handleDesktopMuteShortcut,
  handleDesktopUpdate,
  handleDesktopTrayAction,
  handleWindowAudioStatus,
  clearBroadcastCaptureRecoveryTimer,
  clearVoiceSpeakingPublishTimer,
  stopVoiceTest,
  stopVoiceInputStream,
  groupEventRuntime,
  resetVoiceActivity,
  stopVoiceQuality,
  voiceReconnectTimer,
  reportClientError,
  updateMaintenanceCountdown,
} = {}) {
  let desktopPushToTalkUnsubscribe = null;
  let desktopMuteShortcutUnsubscribe = null;
  let desktopTrayUnsubscribe = null;
  let windowAudioStatusUnsubscribe = null;

  const pollingController = createClientPollingController({
    getState: () => {
      const current = getState?.() || {};
      return {
        user: current.user,
        isViewer: current.isViewer,
        view: current.view,
        groupsWorkspaceOpen: current.groupsWorkspaceOpen,
        selectedGroupId: current.selectedGroupId,
        directConversationId: current.directConversationId,
      };
    },
    refreshGroupOverview: () => getState?.().refreshGroupOverview?.({ includeMessages: false }).catch((error) => reportClientError?.("group_overview_refresh_error", error, { groupId: getState?.().selectedGroupId })),
    loadStreams: () => getState?.().loadStreams?.().catch(() => {}),
    loadNotifications: () => getState?.().loadNotifications?.({ silent: true }).catch(() => {}),
    loadDirectConversationMessages: () => getState?.().loadDirectConversationMessages?.({ silent: true }).catch(() => {}),
    loadMaintenance,
    updateMaintenanceCountdown,
  });

  async function start() {
    detectViewerRoute?.();
    void loadMaintenance?.();
    handleNavigationViewport?.();
    const reconnectSession = readVoiceReconnectSession?.() || null;
    setState?.({ voiceReconnectSession: reconnectSession, voiceReconnectVisible: Boolean(reconnectSession) });
    windowLifecycle?.start();
    setVisualState?.({ theme: globalThis.localStorage?.getItem("mirante-theme") === "light" ? "light" : "dark" });

    const desktop = globalThis.miranteDesktop;
    if (desktop?.isDesktop) {
      setState?.({ isDesktop: true });
      desktopPushToTalkUnsubscribe = desktop.onPushToTalk?.(handleDesktopPushToTalk) || null;
      desktopMuteShortcutUnsubscribe = desktop.onMuteShortcut?.(handleDesktopMuteShortcut) || null;
      desktopTrayUnsubscribe = desktop.onTrayAction?.(handleDesktopTrayAction) || null;
      desktop.onUpdateStatus?.(handleDesktopUpdate);
      windowAudioStatusUnsubscribe = desktop.onWindowAudioStatus?.((status) => { void handleWindowAudioStatus?.(status); }) || null;
      loadDesktopVersion?.();
      loadDesktopLaunchAtLogin?.();
      loadDesktopHardwareAcceleration?.();
      desktop.setTheme?.(getState?.().theme);
      desktop.onDisplayMediaSources?.((sources) => {
        const current = getState?.() || {};
        setState?.({
          displaySources: sources || [],
          displaySourceFilter: current.broadcastSelectionKind === "screen" ? "screen" : "window",
          showDisplayPicker: (sources || []).length > 0,
        });
      });
    }

    try {
      const runtimeResponse = await fetch("/runtime-config", { cache: "no-store" });
      const runtime = await runtimeResponse.json().catch(() => ({}));
      setState?.({ mediaMode: runtime.mediaMode === "relay" ? "relay" : "p2p" });
    } catch {}

    try {
      const [session, availableProviders] = await Promise.all([
        api?.("/api/auth/session"),
        api?.("/api/auth/providers"),
        loadIceConfiguration?.(),
      ]);
      setAuthState?.({ providers: availableProviders });
      const user = session?.user || null;
      setState?.({ user });
      const current = getState?.() || {};
      if (user) canonicalizeAuthenticatedRoute?.();
      if (user && !current.isViewer && current.view !== "viewer") maybeShowReleaseNotes?.(user);
      if (user && !current.isViewer && current.view !== "viewer") {
        await Promise.all([refresh?.(), loadAudioDevices?.(false)]);
      }
      await redeemPendingInvite?.();
      await openPendingChannelRoute?.();
    } catch (error) {
      setState?.({ notice: error.message });
    }
    setState?.({ loading: false });
    pollingController.start();
  }

  function stop() {
    for (const unsubscribe of stateUnsubscribers) unsubscribe?.();
    clearBroadcastCaptureRecoveryTimer?.();
    clearVoiceSpeakingPublishTimer?.();
    stopVoiceTest?.();
    const current = getState?.() || {};
    stopVoiceInputStream?.(current.voiceLocalStream);
    pollingController.stop();
    groupEventRuntime?.close?.();
    resetVoiceActivity?.();
    stopVoiceQuality?.();
    windowLifecycle?.stop();
    desktopPushToTalkUnsubscribe?.();
    desktopMuteShortcutUnsubscribe?.();
    desktopTrayUnsubscribe?.();
    windowAudioStatusUnsubscribe?.();
    if (voiceReconnectTimer) globalThis.clearTimeout?.(voiceReconnectTimer);
  }

  return { start, stop };
}
