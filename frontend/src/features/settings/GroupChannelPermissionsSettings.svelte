<script>
  export let rooms = [];
  export let selectedRoomId = "";
  export let groupRoles = [];
  export let permissions = [];
  export let isOwner = false;
  export let busyKey = "";
  export let onLoadRoom = () => {};
  export let onUpdatePermission = () => {};
  export let onResetPermission = () => {};

  function overrideFor(roleId) {
    return permissions.find((permission) => permission.roleId === roleId) || null;
  }

  function valueFor(roleId, key) {
    return overrideFor(roleId)?.[key] ?? true;
  }
</script>

<section class="settings-card channel-permission-panel">
  <div class="settings-card-heading"><div><p class="eyebrow">acesso por canal</p><h2>Permissões de canais</h2><p class="muted">Restrinja um canal específico sem alterar as permissões do cargo em toda a comunidade.</p></div><span class="role-model-badge">herda por padrão</span></div>
  <label class="channel-permission-room-select"><span>Canal</span><select class="settings-input" bind:value={selectedRoomId} on:change={(event) => onLoadRoom(event.currentTarget.value)} disabled={!isOwner || !rooms.length}><option value="" disabled>Selecione um canal</option>{#each rooms as room}<option value={room.id}>#{room.name}</option>{/each}</select></label>
  {#if selectedRoomId}
    <div class="channel-permission-list">
      {#each groupRoles as role}
        {@const override = overrideFor(role.id)}
        <article class="channel-permission-row">
          <div class="channel-permission-role"><span class="role-color-dot" style={`background:${role.color}`}></span><div><strong>{role.name}</strong><small>{override ? "override ativo neste canal" : "herda permissões do cargo"}</small></div></div>
          <div class="channel-permission-toggles">
            <label><input type="checkbox" checked={valueFor(role.id, "canView")} disabled={!isOwner || busyKey === `${role.id}:canView`} on:change={(event) => onUpdatePermission(role, "canView", event)} /><span>Ver</span></label>
            <label><input type="checkbox" checked={valueFor(role.id, "canChat")} disabled={!isOwner || busyKey === `${role.id}:canChat`} on:change={(event) => onUpdatePermission(role, "canChat", event)} /><span>Conversar</span></label>
            <label><input type="checkbox" checked={valueFor(role.id, "canConnect")} disabled={!isOwner || busyKey === `${role.id}:canConnect`} on:change={(event) => onUpdatePermission(role, "canConnect", event)} /><span>Entrar em voz</span></label>
            <button class="subtle-action" type="button" disabled={!isOwner || !override || busyKey === `${role.id}:reset`} on:click={() => onResetPermission(role)}>Herdar</button>
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <p class="settings-empty">Nenhum canal de texto ou voz disponível.</p>
  {/if}
</section>
