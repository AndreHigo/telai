<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let groups = [];
  export let groupPickerQuery = "";
  export let groupPickerGroups = [];
  export let groupLoading = false;
  export let onSearch = () => {};
  export let onCreate = () => {};
  export let onOpenGroup = () => {};
</script>

<section class="groups-picker-page" aria-labelledby="groups-picker-title">
  <header class="groups-picker-header">
    <div>
      <h1 id="groups-picker-title">Meus grupos</h1>
      <p class="muted">Escolha uma comunidade para entrar na conversa, gerenciar canais ou acompanhar as transmissões.</p>
    </div>
    <div class="groups-picker-actions">
      <button class="outline rounded-xl px-4 py-3 text-sm font-extrabold" type="button" on:click={onSearch}>Pesquisar grupo <span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("search")} size={15} strokeWidth={1.8} /></span></button>
      <button class="primary rounded-xl px-4 py-3 text-sm font-extrabold" type="button" on:click={onCreate}>Criar grupo <span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("add")} size={15} strokeWidth={1.8} /></span></button>
    </div>
  </header>
  {#if groups.length}
    <div class="groups-picker-toolbar">
      <label class="groups-picker-filter">
        <span>Suas comunidades</span>
        <input class="settings-input" bind:value={groupPickerQuery} placeholder="Filtrar meus grupos" aria-label="Filtrar meus grupos" autocomplete="off" />
      </label>
      <span class="groups-picker-count">{groupPickerGroups.length} {groupPickerGroups.length === 1 ? "grupo" : "grupos"}</span>
    </div>
    {#if groupPickerGroups.length}
      <div class="groups-picker-grid">
        {#each groupPickerGroups as group}
          <button class="groups-picker-card" type="button" on:click={() => void onOpenGroup(group.id)} disabled={groupLoading}>
            {#if group.avatarData}<img class="groups-picker-card-image" src={group.avatarData} alt="" />{:else}<span class="groups-picker-card-art" aria-hidden="true"></span>{/if}
            <span class="groups-picker-card-shade" aria-hidden="true"></span>
            <span class="groups-picker-card-copy"><strong>{group.name}</strong><small>{group.role === "owner" ? "Você é o dono" : "Você é membro"} · {group.memberCount || 0} membros</small></span>
            <span class="groups-picker-card-action">Entrar <b class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("arrowRight")} size={15} strokeWidth={1.8} /></b></span>
          </button>
        {/each}
      </div>
    {:else}
      <div class="groups-picker-empty panel"><strong>Nenhum grupo encontrado</strong><p class="muted">Tente outro nome ou pesquise novas comunidades.</p><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onSearch}>Pesquisar comunidades</button></div>
    {/if}
  {:else}
    <section class="groups-picker-empty panel">
      <span class="groups-empty-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("communities")} size={28} strokeWidth={1.8} /></span>
      <strong>Você ainda não faz parte de nenhum grupo</strong>
      <p class="muted">Crie seu próprio grupo ou pesquise uma comunidade para começar.</p>
    </section>
  {/if}
</section>
