<script>
  export let settingsSection = "profile";
  export let settingsTab = "user";
  export let isDesktop = false;
  export let settingsBusy = false;
  export let preferencesResetBusy = false;
  export let preferencesResetConfirm = false;
  export let launchAtLogin = true;
  export let launchAtLoginBusy = false;
  export let launchAtLoginError = "";
  export let hardwareAccelerationMode = "auto";
  export let hardwareAccelerationBusy = false;
  export let hardwareAccelerationError = "";
  export let onTogglePreferencesResetConfirm = () => {};
  export let onResetPreferences = () => {};
  export let onToggleLaunchAtLogin = () => {};
  export let onSetHardwareAcceleration = () => {};
</script>

{#if settingsTab === "user" && settingsSection === "profile"}
  <section class="settings-card settings-reset-card">
    <div class="settings-card-heading"><div><p class="eyebrow">preferências</p><h2>Restaurar configurações</h2><p class="muted">Volte o Telai aos valores padrão sem apagar sua conta, grupos, mensagens ou transmissões.</p></div><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={onTogglePreferencesResetConfirm} disabled={settingsBusy || preferencesResetBusy}>{preferencesResetConfirm ? "Cancelar" : "Restaurar padrões"}</button></div>
    {#if preferencesResetConfirm}<div class="settings-callout settings-reset-callout"><span>Isso restaura tema, cores, qualidade, áudio, volumes, filtros, dispositivos e atalhos. A ação não apaga dados da conta.</span><button class="danger-outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={onResetPreferences} disabled={preferencesResetBusy}>{preferencesResetBusy ? "Restaurando…" : "Restaurar agora"}</button></div>{/if}
  </section>
{/if}

{#if settingsTab === "user" && settingsSection === "profile" && isDesktop}
  <section class="settings-card desktop-startup-card">
    <div class="settings-card-heading"><div><p class="eyebrow">aplicativo desktop</p><h2>Iniciar com o computador</h2><p class="muted">O Telai será iniciado automaticamente com o Windows e ficará disponível na bandeja.</p></div><label class="permission-toggle desktop-startup-toggle" title="Iniciar o Telai com o computador"><input type="checkbox" checked={launchAtLogin} on:change={onToggleLaunchAtLogin} disabled={launchAtLoginBusy} aria-label="Iniciar o Telai com o computador" /><span></span></label></div>
    {#if launchAtLoginError}<p class="settings-error" role="alert">{launchAtLoginError}</p>{/if}
  </section>
{/if}

{#if settingsSection === "profile" && isDesktop}
  <section class="settings-card desktop-hardware-card">
    <div class="settings-card-heading"><div><p class="eyebrow">compatibilidade</p><h2>Aceleração gráfica</h2><p class="muted">Use o modo desativado se o Telai causar travamentos, tela preta ou conflito com o driver de vídeo. A alteração exige reiniciar o aplicativo.</p></div><select class="settings-input desktop-hardware-select" value={hardwareAccelerationMode} on:change={onSetHardwareAcceleration} disabled={hardwareAccelerationBusy} aria-label="Modo de aceleração gráfica"><option value="auto">Automático (recomendado)</option><option value="disabled">Desativada (modo de compatibilidade)</option></select></div>
    {#if hardwareAccelerationError}<p class="settings-error" role="alert">{hardwareAccelerationError}</p>{/if}
  </section>
{/if}

