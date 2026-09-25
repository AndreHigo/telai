<script>
  export let entries = [];
  export let hasMore = false;
  export let loading = false;
  export let onLoadMore = () => {};
  export let members = [];
  export let api = null;
  export let groupId = "";
  export let onModerationComplete = async () => {};

  let selectedMemberId = "";
  let moderationReason = "";
  let moderationDuration = "60";
  let moderationBusy = false;
  let moderationError = "";
  let moderationNotice = "";

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

  $: if (!members.some((member) => member.id === selectedMemberId && member.role !== "owner")) selectedMemberId = members.find((member) => member.role !== "owner")?.id || "";

  async function moderate(action) {
    if (!api || !groupId || !selectedMemberId || moderationBusy) return;
    const target = members.find((member) => member.id === selectedMemberId);
    if (!target) return;
    const labels = { mute: "silenciar", unmute: "remover o silêncio de", kick: "expulsar", ban: "banir" };
    if (["kick", "ban"].includes(action) && !window.confirm(`Confirma ${labels[action]} ${target.displayName}?`)) return;
    moderationBusy = true;
    moderationError = "";
    moderationNotice = "";
    try {
      const body = { action, memberId: target.id, reason: moderationReason.trim() };
      if (["mute", "ban"].includes(action) && String(moderationDuration).trim()) body.durationMinutes = Number(moderationDuration);
      await api(`/api/groups/${encodeURIComponent(groupId)}/moderation`, { method: "POST", body: JSON.stringify(body) });
      moderationReason = "";
      moderationNotice = `${target.displayName} foi ${labels[action]}.`;
      await onModerationComplete({ action, memberId: target.id });
    } catch (error) {
      moderationError = error.message || "Não foi possível concluir a moderação.";
    } finally {
      moderationBusy = false;
    }
  }
</script>

<section class="settings-card group-moderation-panel">
  <div class="settings-card-heading"><div><p class="eyebrow">controle da comunidade</p><h2>Moderação básica</h2><p class="muted">Expulse, bana ou silencie membros sem mudar a identidade visual do grupo.</p></div><span class="role-model-badge">somente dono</span></div>
  <div class="group-moderation-form">
    <label><span>Membro</span><select class="settings-input" bind:value={selectedMemberId} disabled={moderationBusy}><option value="" disabled>Selecione um membro</option>{#each members.filter((member) => member.role !== "owner") as member}<option value={member.id}>{member.displayName} · @{member.username}</option>{/each}</select></label>
    <label><span>Motivo</span><input class="settings-input" bind:value={moderationReason} maxlength="200" placeholder="Opcional" disabled={moderationBusy} /></label>
    <label><span>Duração do banimento/silêncio</span><input class="settings-input" type="number" min="1" max="43200" bind:value={moderationDuration} disabled={moderationBusy} /><small class="profile-photo-hint">minutos; vazio mantém permanente</small></label>
  </div>
  <div class="group-moderation-actions"><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={!selectedMemberId || moderationBusy} on:click={() => moderate("mute")}>Silenciar</button><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={!selectedMemberId || moderationBusy} on:click={() => moderate("unmute")}>Remover silêncio</button><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={!selectedMemberId || moderationBusy} on:click={() => moderate("kick")}>Expulsar</button><button class="danger-button rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={!selectedMemberId || moderationBusy} on:click={() => moderate("ban")}>Banir</button></div>
  {#if moderationError}<p class="settings-error" role="alert">{moderationError}</p>{/if}{#if moderationNotice}<p class="settings-success" role="status">{moderationNotice}</p>{/if}
</section>

<section class="settings-card group-audit-panel">
  <div class="settings-card-heading"><div><p class="eyebrow">segurança e histórico</p><h2>Auditoria administrativa</h2><p class="muted">Veja as mudanças importantes feitas na comunidade e nos canais.</p></div><span class="role-model-badge">somente dono</span></div>
  {#if loading && !entries.length}<div class="workspace-loading"><span></span><span></span><span></span></div>{:else if entries.length}<div class="group-audit-list">{#each entries as entry}<article class="group-audit-entry"><span class="group-audit-dot" aria-hidden="true"></span><div><strong>{description(entry)}</strong><small>{new Date(entry.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</small></div></article>{/each}</div>{:else}<p class="settings-empty">Nenhuma ação administrativa registrada ainda.</p>{/if}
  {#if hasMore}<button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={onLoadMore} disabled={loading}>{loading ? "Carregando…" : "Carregar ações anteriores"}</button>{/if}
</section>
