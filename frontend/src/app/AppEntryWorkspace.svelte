<script>
  import Viewer from "../Viewer.svelte";
  import AuthPage from "../features/auth/AuthPage.svelte";

  export let state = {};
  export let actions = {};
</script>

{#if state.loading}
  <div class="grid min-h-screen place-items-center" role="status" aria-label="Abrindo seu espaço"><div class="text-sm text-slate-400">Abrindo seu espaço…</div></div>
{:else if state.isViewer || state.view === "viewer"}
  <div class:light={!state.isDark} class="mirante-shell viewer-shell" style={state.visualStyle}>
    <Viewer
      roomId={state.viewerRoomId}
      streamPath={state.viewerStreamPath}
      streamData={state.viewerStream}
      initialMediaMode={state.mediaMode}
      initialRtcConfig={state.rtcConfig}
      appVersion={state.appVersion}
      isDark={state.isDark}
      currentUser={state.user}
      onToggleTheme={actions.toggleTheme}
      onBack={actions.returnFromViewer}
      onNavigate={actions.navigateFromViewer}
    />
  </div>
{:else if !state.user}
  <AuthPage
    authMode={state.authMode}
    authError={state.authError}
    loginUsername={state.loginUsername}
    loginPassword={state.loginPassword}
    registerDisplayName={state.registerDisplayName}
    registerUsername={state.registerUsername}
    registerPassword={state.registerPassword}
    registerLegalAccepted={state.registerLegalAccepted}
    isDark={state.isDark}
    providers={state.providers}
    authBusy={state.authBusy}
    onStateChange={actions.setAuthState}
    onSubmit={actions.submitAuth}
    onStartOAuth={actions.startOAuth}
  />
{:else}
  <slot />
{/if}
