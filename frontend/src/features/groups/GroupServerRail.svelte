<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let groups = [];
  export let selectedGroupId = "";
  export let groupLoading = false;
  export let groupNavigationCollapsed = false;
  export let onGoHome = () => {};
  export let onLoadGroup = () => {};
  export let onOpenGroupContextMenu = () => {};
  export let onCreateGroup = () => {};
  export let onToggleNavigation = () => {};
  export let onSearchGroups = () => {};
  export let onOpenSettings = () => {};
</script>

<aside class="server-rail">
  <button class="server-home" type="button" aria-label="Início" on:click={onGoHome}><img class="server-home-icon" src="/favicon.svg?v=8" alt="" /></button>
  <div class="server-divider"></div>
  <div class="server-list">
    {#each groups as group}
      <button class:active={group.id === selectedGroupId} class="server-button" aria-label={`Abrir ${group.name}`} aria-current={group.id === selectedGroupId ? "page" : undefined} title={`${group.name} · botão direito para opções`} disabled={groupLoading} on:click={() => onLoadGroup(group.id)} on:contextmenu={(event) => onOpenGroupContextMenu(event, group)}>{group.name.slice(0, 2).toUpperCase()}</button>
    {/each}
  </div>
  <button class="server-add" aria-label="Criar grupo" on:click={onCreateGroup}><HugeiconsIcon icon={iconFor("add")} size={18} strokeWidth={1.8} /></button>
  <div class="server-rail-actions">
    <button class="server-navigation-toggle" type="button" aria-label={groupNavigationCollapsed ? "Expandir menu do grupo" : "Recolher menu do grupo"} title={groupNavigationCollapsed ? "Expandir menu do grupo" : "Recolher menu do grupo"} on:click={onToggleNavigation}><HugeiconsIcon icon={iconFor(groupNavigationCollapsed ? "arrowRight" : "arrowLeft")} size={17} strokeWidth={1.8} /></button>
    <button class="server-search" type="button" aria-label="Pesquisar grupos" title="Pesquisar grupos" on:click={onSearchGroups}><HugeiconsIcon icon={iconFor("search")} size={17} strokeWidth={1.8} /></button>
    <button class="server-settings" aria-label="Configurações do servidor" title="Configurações do servidor" on:click={onOpenSettings} disabled={!selectedGroupId}><HugeiconsIcon icon={iconFor("settings")} size={17} strokeWidth={1.8} /></button>
  </div>
</aside>
