<script>
  import AppHeader from "../features/shell/AppHeader.svelte";
  import GlobalSidebar from "../features/shell/GlobalSidebar.svelte";
  import VoiceReconnectBanner from "../features/shell/VoiceReconnectBanner.svelte";

  export let state = {};
  export let actions = {};
</script>

<AppHeader
  compactViewport={state.compactViewport}
  showGlobalSidebar={state.showGlobalSidebar}
  globalSidebarCollapsed={state.globalSidebarCollapsed}
  isDark={state.isDark}
  isDesktop={state.isDesktop}
  user={state.user}
  broadcastState={state.broadcastState}
  showUserMenu={state.showUserMenu}
  showAboutInAccountMenu={state.showAboutInAccountMenu}
  notificationUnreadCount={state.notificationUnreadCount}
  desktopVersion={state.desktopVersion}
  webVersion={state.webVersion}
  desktopUpdate={state.desktopUpdate}
  desktopUpdateLabel={state.desktopUpdateLabel}
  onToggleGlobalNavigation={actions.toggleGlobalNavigation}
  onNavigateHome={actions.navigateHome}
  onReturnToBroadcast={actions.returnToBroadcast}
  onStopBroadcast={actions.stopBroadcast}
  onRequestBroadcastStart={actions.requestBroadcastStart}
  onToggleUserMenu={actions.toggleUserMenu}
  onOpenAccountDestination={actions.openAccountDestination}
  onOpenReleaseNotes={actions.openReleaseNotes}
  onToggleAbout={actions.toggleAbout}
  onUpdateDesktopApp={actions.updateDesktopApp}
  onToggleTheme={actions.toggleTheme}
  onLogout={actions.logout}
  onOpenNotifications={actions.openNotifications}
  />

<main
  class:groups-active={state.view === "groups"}
  class:direct-active={state.view === "direct"}
  class:broadcast-page-active={state.view === "broadcast"}
  class:global-sidebar-collapsed={state.globalSidebarCollapsed}
  class:voice-reconnect-visible={state.voiceReconnectVisible && state.voiceReconnectSession}
  class="app-main shell-width py-8 sm:py-10"
>
  <GlobalSidebar
    showGlobalSidebar={state.showGlobalSidebar}
    globalSidebarCollapsed={state.globalSidebarCollapsed}
    view={state.view}
    notificationUnreadCount={state.notificationUnreadCount}
    onClose={actions.closeGlobalNavigation}
    onSelectView={actions.selectView}
    onOpenSettings={actions.openSettings}
  />
  {#if state.notice}<div class="app-notice" role="status">{state.notice}</div>{/if}
  {#if state.voiceReconnectVisible && state.voiceReconnectSession}
    <VoiceReconnectBanner
      session={state.voiceReconnectSession}
      busy={state.voiceReconnectBusy}
      onReconnect={actions.reconnectVoice}
      onDismiss={actions.clearVoiceReconnectSession}
    />
  {/if}
  <slot />
</main>
