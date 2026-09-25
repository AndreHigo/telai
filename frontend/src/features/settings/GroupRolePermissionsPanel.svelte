<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let selectedGroup = null;
  export let groupRoles = [];
  export let selectedRole = null;
  export let selectedRoleId = "";
  export let groupMembers = [];
  export let rolePermissionOptions = [];
  export let filteredRoleMembers = [];
  export let roleOrderSaving = false;
  export let draggedRoleId = "";
  export let dragOverRoleId = "";
  export let newRoleName = "";
  export let newRoleColor = "#5865f2";
  export let roleEditName = "";
  export let roleEditColor = "#5865f2";
  export let roleEditBusy = false;
  export let roleMemberSearchQuery = "";
  export let roleMemberActionId = "";

  export let onCreateRole = () => {};
  export let onStartRoleDrag = () => {};
  export let onRoleDragOver = () => {};
  export let onDropRole = () => {};
  export let onEndRoleDrag = () => {};
  export let onMoveRole = () => {};
  export let onDeleteRole = () => {};
  export let onSaveRoleDetails = () => {};
  export let onUpdateRolePermission = () => {};
  export let onSetRoleMember = () => {};

  function selectRole(roleId) {
    selectedRoleId = roleId;
    roleMemberSearchQuery = "";
  }
</script>

<section class="settings-card role-permission-panel">
  <div class="settings-card-heading"><div><p class="eyebrow">controle de acesso</p><h2>Permissões por cargo</h2><p class="muted">Configure cada cargo uma vez e aplique o mesmo conjunto de permissões a todos os membros atribuídos.</p></div><span class="role-model-badge">modelo por cargos</span></div>
  {#if selectedGroup?.role === "owner"}<form class="admin-create-row role-create-row" on:submit|preventDefault={onCreateRole}><input class="settings-input" bind:value={newRoleName} maxlength="32" placeholder="Nome do novo cargo" required /><input class="role-color-input" type="color" bind:value={newRoleColor} aria-label="Cor do cargo" /><button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="submit">Criar cargo</button></form>{/if}
  <div class="role-settings-layout">
    <div class="role-settings-list-column">
      <nav class="role-settings-list" aria-label="Cargos do grupo" aria-busy={roleOrderSaving}>
        {#each groupRoles as role, roleIndex}
          <div class:dragging={draggedRoleId === role.id} class:drag-over={dragOverRoleId === role.id && draggedRoleId !== role.id} class="role-order-item">
            <button class:active={selectedRole?.id === role.id} class="role-select-button" type="button" role="tab" aria-selected={selectedRole?.id === role.id} aria-describedby="role-order-help" draggable={selectedGroup?.role === "owner" && !roleOrderSaving} on:click={() => selectRole(role.id)} on:dragstart={(event) => onStartRoleDrag(event, role.id)} on:dragover|preventDefault={(event) => onRoleDragOver(event, role.id)} on:drop|preventDefault={() => void onDropRole(role.id)} on:dragend={onEndRoleDrag}>
              <span class="role-color-dot" style={`background:${role.color}`}></span>
              <span><strong>{role.name}</strong><small>{role.isDefault ? "cargo padrão" : "cargo personalizado"}</small></span>
              <b>{groupMembers.filter((member) => member.roleId === role.id).length}</b>
            </button>
            {#if selectedGroup?.role === "owner" && groupRoles.length > 1}<span class="role-order-controls" aria-label={`Mover cargo ${role.name}`}><button type="button" class="role-order-button" title="Mover para cima" aria-label={`Mover ${role.name} para cima`} disabled={roleIndex === 0 || roleOrderSaving} on:click={() => void onMoveRole(role.id, -1)}><HugeiconsIcon icon={iconFor("arrowUp")} size={15} strokeWidth={1.8} /></button><button type="button" class="role-order-button" title="Mover para baixo" aria-label={`Mover ${role.name} para baixo`} disabled={roleIndex === groupRoles.length - 1 || roleOrderSaving} on:click={() => void onMoveRole(role.id, 1)}><HugeiconsIcon icon={iconFor("arrowDown")} size={15} strokeWidth={1.8} /></button></span>{/if}
          </div>
        {/each}
      </nav>
      {#if groupRoles.length > 1}<p id="role-order-help" class="role-order-help">Arraste um cargo para definir a ordem dos membros. Use os controles de subir e descer pelo teclado.</p>{/if}
    </div>
    {#if selectedRole}
      <div class="role-settings-detail">
        <div class="role-settings-detail-heading"><div><span class="role-color-dot" style={`background:${selectedRole.color}`}></span><div><h3>{selectedRole.name}</h3><p class="muted">Permissões e participantes deste cargo.</p></div></div><div class="role-detail-actions"><span class="role-owner-badge">{selectedRole.isDefault ? "padrão" : "editável"}</span>{#if selectedGroup?.role === "owner" && !selectedRole.isDefault}<button class="role-delete-button" type="button" on:click={() => onDeleteRole(selectedRole)}>Excluir cargo</button>{/if}</div></div>
        <div class="role-summary-strip"><div><small>cargos</small><strong>{groupRoles.length}</strong></div><div><small>neste cargo</small><strong>{groupMembers.filter((member) => member.roleId === selectedRole.id).length}</strong></div><div><small>modelo</small><strong>{selectedRole.isDefault ? "padrão" : "personalizado"}</strong></div></div>
        {#if selectedGroup?.role === "owner"}<form class="role-identity-editor" on:submit|preventDefault={onSaveRoleDetails}><label><span>Nome do cargo</span><input class="settings-input" bind:value={roleEditName} maxlength="32" required /></label><label class="role-color-field"><span>Cor</span><input type="color" bind:value={roleEditColor} aria-label="Cor do cargo" /></label><button class="outline rounded-xl px-4 py-2 text-xs font-extrabold" type="submit" disabled={roleEditBusy || roleEditName.trim().length < 2}>{roleEditBusy ? "Salvando…" : "Salvar identidade"}</button></form>{/if}
        <div class="role-permission-categories">{#each ["Geral", "Texto", "Voz e vídeo"] as category}<section class="permission-category"><p class="permission-category-title">{category}</p>{#each rolePermissionOptions.filter((permission) => permission.category === category) as permission}<label class="role-matrix-row"><span><strong>{permission.label}</strong><small>{permission.description}</small></span><input type="checkbox" checked={Boolean(selectedRole[permission.key])} disabled={selectedGroup?.role !== "owner"} on:change={(event) => onUpdateRolePermission(selectedRole, permission.key, event)} aria-label={`${permission.label} para ${selectedRole.name}`} /></label>{/each}</section>{/each}</div>
        <section class="role-members-editor" aria-labelledby="role-members-title">
          <div class="role-members-heading"><div><p class="permission-category-title">participantes</p><h4 id="role-members-title">Membros deste cargo</h4><p class="muted">Marque uma pessoa para atribuí-la a <strong>{selectedRole.name}</strong>. Ao marcar outro cargo, ela sai do anterior.</p></div><span class="role-members-count">{groupMembers.filter((member) => member.roleId === selectedRole.id).length}</span></div>
          <label class="role-member-search"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("search")} size={16} strokeWidth={1.8} /></span><input type="search" bind:value={roleMemberSearchQuery} placeholder="Pesquisar membro por nome ou @usuário" aria-label="Pesquisar membro para este cargo" /></label>
          <div class="role-member-list">
            {#each filteredRoleMembers as member}
              {@const memberInRole = member.roleId === selectedRole.id}
              <label class:assigned={memberInRole} class="role-member-row">
                <span class="role-assignment-person"><span class="member-avatar">{#if member.avatarData}<img src={member.avatarData} alt="" />{:else}{member.displayName?.slice(0, 1) || "M"}{/if}</span><span><strong>{member.displayName}</strong><small>@{member.username} · {member.roleName || "Membro"}</small></span></span>
                <input type="checkbox" checked={memberInRole} disabled={selectedGroup?.role !== "owner" || roleMemberActionId === member.id || (selectedRole.isDefault && memberInRole)} on:change={(event) => onSetRoleMember(selectedRole, member, event.currentTarget.checked)} aria-label={`${memberInRole ? "Remover" : "Atribuir"} ${member.displayName} ${memberInRole ? "deste cargo" : "a este cargo"}`} />
              </label>
            {:else}
              <p class="muted role-members-empty">Nenhum membro encontrado.</p>
            {/each}
          </div>
        </section>
      </div>
    {:else}
      <div class="settings-empty">Nenhum cargo cadastrado.</div>
    {/if}
  </div>
</section>
