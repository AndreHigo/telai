<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

  export let showInviteDialog = false;
  export let showGroupSearchDialog = false;
  export let showLeaveGroupDialog = false;
  export let showDeleteRoomDialog = false;
  export let showDeleteGroupDialog = false;
  export let showGroupDialog = false;
  export let showRoomDialog = false;

  export let selectedGroup = null;
  export let deleteRoomTarget = null;

  export let inviteSearchQuery = "";
  export let inviteSearchBusy = false;
  export let inviteSearchError = "";
  export let inviteSearchResults = [];
  export let inviteActionId = "";
  export let groupInviteCreating = false;
  export let groupInviteLink = "";

  export let groupSearchQuery = "";
  export let groupSearchBusy = false;
  export let groupSearchError = "";
  export let groupSearchResults = [];
  export let groupJoinActionId = "";

  export let leaveGroupBusy = false;
  export let leaveGroupError = "";
  export let deleteRoomBusy = false;
  export let deleteRoomError = "";
  export let deleteGroupBusy = false;
  export let deleteGroupError = "";

  export let groupName = "";
  export let roomDialogMode = "create";
  export let roomName = "";
  export let roomKind = "text";
  export let roomMaxParticipants = 8;

  export let onCloseInvite = () => {};
  export let onInviteSearchQueryChange = () => {};
  export let onSearchUsers = () => {};
  export let onInviteUser = () => {};
  export let onCreateGroupInvite = () => {};
  export let onCopyGroupInvite = () => {};
  export let onCloseGroupSearch = () => {};
  export let onGroupSearchQueryChange = () => {};
  export let onSearchGroups = () => {};
  export let onRequestGroupEntry = () => {};
  export let onCloseLeaveGroup = () => {};
  export let onLeaveSelectedGroup = () => {};
  export let onCloseDeleteRoom = () => {};
  export let onConfirmDeleteGroupRoom = () => {};
  export let onCloseDeleteGroup = () => {};
  export let onDeleteSelectedGroup = () => {};
  export let onCloseGroup = () => {};
  export let onGroupNameChange = () => {};
  export let onCreateGroup = () => {};
  export let onCloseRoom = () => {};
  export let onRoomNameChange = () => {};
  export let onRoomKindChange = () => {};
  export let onRoomMaxParticipantsChange = () => {};
  export let onCreateRoom = () => {};
</script>

{#if showInviteDialog}
  <div class="modal-backdrop" role="presentation">
    <div class="modal-shell invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-dialog-title">
      <header class="modal-header">
        <div><p class="eyebrow">membros do grupo</p><h2 id="invite-dialog-title">Convidar para {selectedGroup?.name}</h2><p class="muted">Pesquise pelo nome ou pelo @usuário e envie um convite direto.</p></div>
        <button class="modal-close outline" type="button" aria-label="Fechar convite" on:click={onCloseInvite}>×</button>
      </header>
      <div class="modal-body">
        <form class="modal-search-row" on:submit|preventDefault={onSearchUsers}>
          <input class="settings-input" value={inviteSearchQuery} on:input={(event) => onInviteSearchQueryChange(event.currentTarget.value)} placeholder="Nome ou @usuário" autocomplete="off" />
          <button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="submit" disabled={inviteSearchBusy}>{inviteSearchBusy ? "Buscando…" : "Pesquisar"}</button>
        </form>
        {#if inviteSearchError}<p class="settings-error" role="alert">{inviteSearchError}</p>{/if}
        <div class="invite-search-results">
          {#each inviteSearchResults as target}
            <div class="invite-search-result">
              <span class="member-avatar">{#if target.avatarData}<img src={target.avatarData} alt="" />{:else}{target.displayName?.slice(0, 1) || "M"}{/if}</span>
              <span><strong>{target.displayName}</strong><small>@{target.username}</small></span>
              <button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={inviteActionId === target.id} on:click={() => onInviteUser(target)}>{inviteActionId === target.id ? "Enviando…" : "Convidar"}</button>
            </div>
          {/each}
        </div>
        <div class="invite-dialog-divider"><span>ou compartilhe um link temporário</span></div>
        <button class="outline w-full rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onCreateGroupInvite} disabled={groupInviteCreating}>{groupInviteCreating ? "Gerando…" : "Gerar link de convite"}</button>
        {#if groupInviteLink}<div class="invite-link-row"><input class="settings-input" readonly value={groupInviteLink} aria-label="Link do convite" /><button class="outline rounded-xl px-3 py-2 text-xs font-extrabold" type="button" on:click={onCopyGroupInvite}>Copiar</button></div>{/if}
      </div>
    </div>
  </div>
{/if}

{#if showGroupSearchDialog}
  <div class="modal-backdrop" role="presentation" on:click={onCloseGroupSearch}>
    <div class="modal-shell modal-compact group-search-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="group-search-dialog-title" on:click|stopPropagation on:keydown|stopPropagation>
      <header class="modal-header"><div><p class="eyebrow">descobrir comunidades</p><h2 id="group-search-dialog-title">Pesquisar grupos</h2><p class="muted">Encontre um grupo pelo nome e solicite sua entrada.</p></div><button class="modal-close outline" type="button" aria-label="Fechar pesquisa de grupos" on:click={onCloseGroupSearch}>×</button></header>
      <div class="modal-body">
        <form class="modal-search-row" on:submit|preventDefault={onSearchGroups}>
          <input class="settings-input" value={groupSearchQuery} on:input={(event) => onGroupSearchQueryChange(event.currentTarget.value)} placeholder="Nome do grupo" autocomplete="off" />
          <button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="submit" disabled={groupSearchBusy}>{groupSearchBusy ? "Buscando…" : "Pesquisar"}</button>
        </form>
        {#if groupSearchError}<p class="settings-error" role="alert">{groupSearchError}</p>{/if}
        {#if groupSearchResults.length}
          <div class="group-discovery-results">
            {#each groupSearchResults as group}
              <div class="group-discovery-result">
                <span class="community-avatar">{group.name.slice(0, 2).toUpperCase()}</span>
                <span><strong>{group.name}</strong><small>por {group.ownerName} · {group.memberCount} {group.memberCount === 1 ? "membro" : "membros"}</small></span>
                {#if group.requestStatus === "pending"}
                  <span class="group-request-status">Pendente</span>
                {:else if group.requestStatus === "rejected"}
                  <button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={groupJoinActionId === group.id} on:click={() => onRequestGroupEntry(group)}>Solicitar novamente</button>
                {:else}
                  <button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={groupJoinActionId === group.id} on:click={() => onRequestGroupEntry(group)}>{groupJoinActionId === group.id ? "Enviando…" : "Solicitar entrada"}</button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if showLeaveGroupDialog}
  <div class="modal-backdrop" role="presentation" on:click={() => !leaveGroupBusy && onCloseLeaveGroup()}>
    <div class="modal-shell modal-compact" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="leave-group-title" on:click|stopPropagation on:keydown|stopPropagation>
      <form on:submit|preventDefault={onLeaveSelectedGroup}>
        <header class="modal-header"><div><p class="eyebrow">sair da comunidade</p><h2 id="leave-group-title">Sair de {selectedGroup?.name}</h2><p class="muted">Você perderá acesso aos canais e precisará solicitar entrada novamente para voltar.</p></div><button class="modal-close outline" type="button" aria-label="Fechar confirmação" on:click={() => !leaveGroupBusy && onCloseLeaveGroup()}>×</button></header>
        <div class="modal-body">{#if leaveGroupError}<p class="settings-error" role="alert">{leaveGroupError}</p>{/if}<p class="settings-callout danger-callout">Essa ação remove você do grupo, mas não exclui a comunidade.</p></div>
        <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={onCloseLeaveGroup} disabled={leaveGroupBusy}>Cancelar</button><button type="submit" class="danger-outline rounded-xl px-4 py-2 text-sm font-bold" disabled={leaveGroupBusy}>{leaveGroupBusy ? "Saindo…" : "Sair do grupo"}</button></footer>
      </form>
    </div>
  </div>
{/if}

{#if showDeleteRoomDialog}
  <div class="modal-backdrop" role="presentation" on:click={() => !deleteRoomBusy && onCloseDeleteRoom()}>
    <div class="modal-shell modal-compact" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="delete-room-title" on:click|stopPropagation on:keydown|stopPropagation>
      <header class="modal-header"><div><p class="eyebrow">excluir canal</p><h2 id="delete-room-title">Excluir #{deleteRoomTarget?.name}</h2><p class="muted">As mensagens deste canal também serão removidas. Essa ação não pode ser desfeita.</p></div><button class="modal-close outline" type="button" aria-label="Fechar confirmação" on:click={() => !deleteRoomBusy && onCloseDeleteRoom()}>×</button></header>
      <div class="modal-body">{#if deleteRoomError}<p class="settings-error" role="alert">{deleteRoomError}</p>{/if}<p class="settings-callout danger-callout">Confirme somente se você deseja apagar o canal e todo o histórico dele.</p></div>
      <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={() => !deleteRoomBusy && onCloseDeleteRoom()} disabled={deleteRoomBusy}>Cancelar</button><button type="button" class="danger-outline rounded-xl px-4 py-2 text-sm font-bold" on:click={onConfirmDeleteGroupRoom} disabled={deleteRoomBusy}>{deleteRoomBusy ? "Excluindo…" : "Excluir canal"}</button></footer>
    </div>
  </div>
{/if}

{#if showDeleteGroupDialog}
  <div class="modal-backdrop" role="presentation" on:click={() => !deleteGroupBusy && onCloseDeleteGroup()}>
    <div class="modal-shell modal-compact" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="delete-group-title" on:click|stopPropagation on:keydown|stopPropagation>
      <form on:submit|preventDefault={onDeleteSelectedGroup}>
        <header class="modal-header"><div><p class="eyebrow">excluir comunidade</p><h2 id="delete-group-title">Excluir {selectedGroup?.name}</h2><p class="muted">Essa ação remove o grupo, os canais, mensagens, cargos e convites de forma permanente.</p></div><button class="modal-close outline" type="button" aria-label="Fechar confirmação" on:click={() => !deleteGroupBusy && onCloseDeleteGroup()}>×</button></header>
        <div class="modal-body">{#if deleteGroupError}<p class="settings-error" role="alert">{deleteGroupError}</p>{/if}<p class="settings-callout danger-callout">Não será possível recuperar esta comunidade depois da exclusão.</p></div>
        <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={onCloseDeleteGroup} disabled={deleteGroupBusy}>Cancelar</button><button type="submit" class="danger-outline rounded-xl px-4 py-2 text-sm font-bold" disabled={deleteGroupBusy}>{deleteGroupBusy ? "Excluindo…" : "Excluir grupo"}</button></footer>
      </form>
    </div>
  </div>
{/if}

{#if showGroupDialog}
  <div class="modal-backdrop" role="presentation">
    <form class="modal-shell modal-compact" on:submit|preventDefault={onCreateGroup}>
      <header class="modal-header"><div><p class="eyebrow">organização</p><h2 id="group-dialog-title">Criar grupo</h2><p class="muted">Crie um espaço para organizar seus canais e pessoas.</p></div><button class="modal-close outline" type="button" aria-label="Fechar criação de grupo" on:click={onCloseGroup}>×</button></header>
      <div class="modal-body"><label class="modal-field">Nome do grupo<input value={groupName} on:input={(event) => onGroupNameChange(event.currentTarget.value)} class="settings-input" placeholder="Nome do grupo" maxlength="64" required /></label></div>
      <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={onCloseGroup}>Cancelar</button><button class="primary rounded-xl px-4 py-2 text-sm font-bold">Criar grupo <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} /></button></footer>
    </form>
  </div>
{/if}

{#if showRoomDialog}
  <div class="modal-backdrop" role="presentation">
    <form class="modal-shell modal-compact" on:submit|preventDefault={onCreateRoom}>
      <header class="modal-header"><div><p class="eyebrow">sala do grupo</p><h2>{roomDialogMode === "edit" ? "Editar canal" : "Criar sala"}</h2><p class="muted">{roomDialogMode === "edit" ? "Altere o nome do canal de texto." : "Escolha o nome e o tipo do novo canal."}</p></div><button class="modal-close outline" type="button" aria-label="Fechar janela de canal" on:click={onCloseRoom}>×</button></header>
      <div class="modal-body"><label class="modal-field">Nome da sala<input value={roomName} on:input={(event) => onRoomNameChange(event.currentTarget.value)} class="settings-input" placeholder="ex.: conversa, estudos" maxlength="48" required /></label>{#if roomDialogMode !== "edit"}<label class="modal-field">Tipo<select value={roomKind} on:change={(event) => onRoomKindChange(event.currentTarget.value)} class="settings-input"><option value="text">Texto e chat</option><option value="voice">Canal de voz</option></select></label>{/if}</div>
      {#if roomKind === "voice"}<div class="modal-body room-capacity-field"><label class="modal-field">Limite de participantes<input value={roomMaxParticipants} on:input={(event) => onRoomMaxParticipantsChange(event.currentTarget.value)} class="settings-input" type="number" min="1" max="50" step="1" required aria-describedby="room-capacity-help" /></label><small id="room-capacity-help" class="muted">Defina de 1 a 50 pessoas nesta sala. O padrão é 8.</small></div>{/if}
      <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={onCloseRoom}>Cancelar</button><button class="primary rounded-xl px-4 py-2 text-sm font-bold">{roomDialogMode === "edit" ? "Salvar alterações" : "Criar sala"} {#if roomDialogMode !== "edit"}<HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} />{/if}</button></footer>
    </form>
  </div>
{/if}
