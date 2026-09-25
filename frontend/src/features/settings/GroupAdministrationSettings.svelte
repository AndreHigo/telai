<script>
  export let selectedGroup = null;
  export let settingsBusy = false;
  export let groupSettingsName = "";
  export let onSave = () => {};
</script>

<section class="settings-card"><div class="settings-card-heading"><div><p class="eyebrow">administração da comunidade</p><h2>{selectedGroup?.name || "Grupo"}</h2><p class="muted">Controle o nome da comunidade e o que cada membro pode fazer.</p></div><button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" on:click={onSave} disabled={settingsBusy || selectedGroup?.role !== "owner"}>Salvar grupo</button></div><div class="settings-form-grid"><label>Nome do grupo<input class="settings-input" bind:value={groupSettingsName} maxlength="64" disabled={selectedGroup?.role !== "owner"} /></label><label>Endereço público<input class="settings-input" value={selectedGroup?.slug || ""} readonly /></label></div>{#if selectedGroup?.role !== "owner"}<p class="settings-callout">Somente o dono do grupo pode alterar estas configurações.</p>{/if}</section>
