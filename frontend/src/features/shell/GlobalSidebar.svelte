<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { globalNavSections, iconFor } from "../../config/ui.js";

  export let showGlobalSidebar = false;
  export let globalSidebarCollapsed = false;
  export let view = "home";
  export let notificationUnreadCount = 0;

  export let onClose = () => {};
  export let onSelectView = () => {};
  export let onOpenSettings = () => {};
</script>

{#if showGlobalSidebar}<button class="global-sidebar-scrim" type="button" aria-label="Fechar navegação" on:click={onClose}></button>{/if}
<aside id="global-navigation" class:open={showGlobalSidebar} class="global-sidebar" aria-label="Navegação do Telai">
  <div class="global-sidebar-scroll">
    {#each globalNavSections as section}
      <section class="global-sidebar-section">
        <p>{section.label}</p>
        <nav aria-label={section.label}>
          {#each section.items as item}
            <button class:active={item.id === view || (item.id === "live" && view === "multistream")} class="global-sidebar-item" type="button" aria-label={item.label} title={globalSidebarCollapsed ? item.label : undefined} on:click={() => onSelectView(item.id)}>
              <span class="global-sidebar-icon" aria-hidden="true"><HugeiconsIcon icon={item.icon} size={17} strokeWidth={1.8} /></span>
              <span class="global-sidebar-item-copy"><strong>{item.label}</strong></span>
              {#if item.id === "notifications" && notificationUnreadCount}<b class="global-sidebar-count">{notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}</b>{/if}
            </button>
          {/each}
        </nav>
      </section>
    {/each}
  </div>
  <div class="global-sidebar-footer">
    <button class="global-sidebar-settings" type="button" aria-label="Abrir configurações" title={globalSidebarCollapsed ? "Configurações" : undefined} on:click={onOpenSettings}><HugeiconsIcon icon={iconFor("settings")} size={17} strokeWidth={1.8} /></button>
  </div>
</aside>
