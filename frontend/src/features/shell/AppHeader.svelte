<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let compactViewport = false;
  export let showGlobalSidebar = false;
  export let globalSidebarCollapsed = false;
  export let isDark = true;
  export let isDesktop = false;
  export let user = null;
  export let broadcastState = "idle";
  export let showUserMenu = false;
  export let showAboutInAccountMenu = false;
  export let notificationUnreadCount = 0;
  export let desktopVersion = "desconhecida";
  export let webVersion = "desconhecida";
  export let desktopUpdate = { status: "idle" };
  export let desktopUpdateLabel = () => "";

  export let onToggleGlobalNavigation = () => {};
  export let onNavigateHome = () => {};
  export let onReturnToBroadcast = () => {};
  export let onStopBroadcast = () => {};
  export let onRequestBroadcastStart = () => {};
  export let onToggleUserMenu = () => {};
  export let onOpenAccountDestination = () => {};
  export let onOpenReleaseNotes = () => {};
  export let onToggleAbout = () => {};
  export let onUpdateDesktopApp = () => {};
  export let onToggleTheme = () => {};
  export let onLogout = () => {};
  export let onOpenNotifications = () => {};
</script>

<div class="app-header-shell">
  <header class="topbar border-b border-[#1d2b48] bg-[#070b16]/90 backdrop-blur-xl">
    <div class="shell-width flex min-h-[92px] items-center justify-between gap-4">
      <div class="topbar-leading">
        <button class="sidebar-menu-toggle desktop-sidebar-reopen outline" type="button" aria-label={compactViewport ? (showGlobalSidebar ? "Fechar navegação" : "Abrir navegação") : (globalSidebarCollapsed ? "Expandir navegação principal" : "Recolher navegação principal")} aria-controls="global-navigation" aria-expanded={compactViewport ? showGlobalSidebar : !globalSidebarCollapsed} on:click={onToggleGlobalNavigation}>
          <span class="sidebar-menu-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("menu")} size={18} strokeWidth={1.8} /></span>
        </button>
        <a href="/svelte/" on:click|preventDefault={onNavigateHome} class="flex shrink-0 items-center gap-3 text-white no-underline"><span class="telai-logo-switcher"><img class:active={isDark} src="/telai-logo-dark.png?v=1" alt={isDark ? "Telai" : ""} aria-hidden={!isDark} /><img class:active={!isDark} src="/telai-logo.png?v=1" alt={!isDark ? "Telai" : ""} aria-hidden={isDark} /></span></a>
      </div>
      <div class="topbar-actions flex items-center gap-2 sm:gap-3">
        {#if broadcastState === "live"}
          <div class="live-session-control" role="status" aria-label="Sua transmissão está ao vivo">
            <span class="live-session-status"><span class="live-pulse"></span><span class="hidden sm:inline">Ao vivo</span></span>
            <button class="live-session-return" type="button" on:click={onReturnToBroadcast}>Voltar à live</button>
            <button class="live-session-stop" type="button" on:click={onStopBroadcast}>Encerrar</button>
          </div>
        {/if}
        <a class="download-app-link outline hidden rounded-xl px-3 py-2.5 text-xs font-extrabold no-underline sm:inline-flex" href="https://github.com/AndreHigo/telai-downloads/releases/latest/download/Telai-Setup-latest.exe" target="_blank" rel="noreferrer" aria-label="Baixar o aplicativo Telai"><HugeiconsIcon icon={iconFor("arrowDown")} size={15} strokeWidth={1.8} /><span class="hidden lg:inline">Baixar app</span><span class="lg:hidden">App</span></a>
        <button class="primary hidden rounded-xl px-4 py-2.5 text-sm font-extrabold sm:inline-flex" type="button" on:click={onRequestBroadcastStart}>Transmitir <span class="ml-2 telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("arrowUpRight")} size={15} strokeWidth={1.8} /></span></button>
        <div class="account-menu-shell">
          <button class="user-menu-chip flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-bold sm:px-3" type="button" aria-label="Abrir menu da conta" aria-expanded={showUserMenu} aria-haspopup="menu" on:click|stopPropagation={onToggleUserMenu}>
            {#if user?.avatarData}<img class="user-menu-avatar" src={user.avatarData} alt="" />{:else}<span class="user-menu-avatar">{user?.displayName?.slice(0, 1) || "M"}</span>{/if}
            <span class="hidden max-w-[120px] truncate sm:inline">{user?.displayName || user?.username}</span><span class="user-menu-chevron">⌄</span>
          </button>
          {#if showUserMenu}
            <div class="account-menu" role="menu" aria-label="Menu da conta">
              <div class="account-menu-heading"><span class="user-menu-avatar">{user?.displayName?.slice(0, 1) || "M"}</span><span><strong>{user?.displayName || user?.username}</strong><small>@{user?.username}</small></span></div>
              <button class="account-menu-item" type="button" role="menuitem" on:click={() => void onOpenAccountDestination("profile")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("userSettings")} size={16} strokeWidth={1.8} /></span>Perfil</button>
              <button class="account-menu-item" type="button" role="menuitem" on:click={() => void onOpenAccountDestination("preferences")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("sparkles")} size={16} strokeWidth={1.8} /></span>Preferências</button>
              <button class="account-menu-item" type="button" role="menuitem" on:click={() => void onOpenAccountDestination("channel")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("live")} size={16} strokeWidth={1.8} /></span>Canal</button>
              <button class="account-menu-item" type="button" role="menuitem" on:click={() => void onOpenAccountDestination("settings")}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("settings")} size={16} strokeWidth={1.8} /></span>Configurações</button>
              <button class="account-menu-item" type="button" role="menuitem" on:click={onOpenReleaseNotes}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("sparkles")} size={16} strokeWidth={1.8} /></span>Notas da atualização</button>
              <button class="account-menu-item" type="button" role="menuitem" aria-expanded={showAboutInAccountMenu} on:click={onToggleAbout}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("info")} size={16} strokeWidth={1.8} /></span>Sobre o Telai</button>
              {#if showAboutInAccountMenu}
                <section class="account-menu-about" aria-label="Sobre o Telai">
                  <div class="account-menu-about-title"><strong>Telai</strong><span class="beta-badge" title="O Telai está em fase beta">BETA</span></div>
                  <div class="account-menu-about-version">{isDesktop ? `App v${desktopVersion}` : `Web ${webVersion}`}</div>
                  <small>{desktopUpdateLabel()}</small>
                  {#if isDesktop && ["available", "downloaded"].includes(desktopUpdate?.status)}<button class="account-menu-about-action" type="button" on:click={onUpdateDesktopApp}>{desktopUpdate.status === "available" ? "Baixar atualização" : "Instalar atualização"}</button>{/if}
                </section>
              {/if}
              <div class="account-menu-divider"></div>
              <a class="account-menu-item account-menu-link" href="/privacidade" target="_blank" rel="noreferrer" role="menuitem"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("shield")} size={16} strokeWidth={1.8} /></span>Privacidade</a>
              <a class="account-menu-item account-menu-link" href="/termos-de-uso" target="_blank" rel="noreferrer" role="menuitem"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("info")} size={16} strokeWidth={1.8} /></span>Termos de Uso</a>
              <button class="account-menu-item account-menu-theme" type="button" role="menuitemcheckbox" aria-checked={isDark} on:click={onToggleTheme}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor(isDark ? "live" : "sparkles")} size={16} strokeWidth={1.8} /></span>{isDark ? "Modo claro" : "Modo escuro"}</button>
              <div class="account-menu-divider"></div>
              <button class="account-menu-item account-menu-danger" type="button" role="menuitem" on:click={onLogout}><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("logout")} size={16} strokeWidth={1.8} /></span>Sair</button>
            </div>
          {/if}
        </div>
        <button class="notification-button outline" class:has-unread={notificationUnreadCount > 0} type="button" on:click={onOpenNotifications} aria-label={`Abrir notificações${notificationUnreadCount ? `, ${notificationUnreadCount} não lidas` : ""}`} title="Notificações"><span class="notification-button-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-3-3-9m-8 13h6" /></svg></span>{#if notificationUnreadCount}<b>{notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}</b>{/if}</button>
      </div>
    </div>
  </header>
</div>
{#if isDesktop && ["available", "downloading", "downloaded"].includes(desktopUpdate?.status)}
  <div class="desktop-update-banner" role="status"><span>{desktopUpdate.status === "available" ? `Nova versão v${desktopUpdate.version || "disponível"} pronta para baixar` : desktopUpdate.status === "downloading" ? `Baixando atualização ${desktopUpdate.percent ? `${desktopUpdate.percent}%` : "…"}` : `Atualização v${desktopUpdate.version || "nova"} pronta para instalar`}</span><button class="desktop-update-action" type="button" on:click={onUpdateDesktopApp} disabled={desktopUpdate.status === "downloading"}>{desktopUpdate.status === "available" ? "Baixar atualização" : desktopUpdate.status === "downloaded" ? "Instalar agora" : "Baixando…"}</button></div>
{/if}
