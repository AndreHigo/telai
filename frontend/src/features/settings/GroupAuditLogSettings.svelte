<script>
  export let entries = [];
  export let hasMore = false;
  export let loading = false;
  export let onLoadMore = () => {};

  const labels = {
    group_update: "configurou a comunidade",
    role_create: "criou um cargo",
    role_update: "atualizou um cargo",
    role_delete: "excluiu um cargo",
    role_reorder: "reordenou os cargos",
    member_role_assign: "alterou o cargo de um membro",
    room_create: "criou um canal",
    room_update: "atualizou um canal",
    room_delete: "excluiu um canal",
    room_permission_update: "atualizou permissões de um canal",
    room_permission_reset: "removeu um override de canal",
  };

  function description(entry) {
    const action = labels[entry.action] || entry.action;
    const name = entry.metadata?.name ? ` “${entry.metadata.name}”` : "";
    return `${entry.actorDisplayName || entry.actorUsername || "Alguém"} ${action}${name}`;
  }
</script>

<section class="settings-card group-audit-panel">
  <div class="settings-card-heading"><div><p class="eyebrow">segurança e histórico</p><h2>Auditoria administrativa</h2><p class="muted">Veja as mudanças importantes feitas na comunidade e nos canais.</p></div><span class="role-model-badge">somente dono</span></div>
  {#if loading && !entries.length}<div class="workspace-loading"><span></span><span></span><span></span></div>{:else if entries.length}<div class="group-audit-list">{#each entries as entry}<article class="group-audit-entry"><span class="group-audit-dot" aria-hidden="true"></span><div><strong>{description(entry)}</strong><small>{new Date(entry.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</small></div></article>{/each}</div>{:else}<p class="settings-empty">Nenhuma ação administrativa registrada ainda.</p>{/if}
  {#if hasMore}<button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={onLoadMore} disabled={loading}>{loading ? "Carregando…" : "Carregar ações anteriores"}</button>{/if}
</section>
