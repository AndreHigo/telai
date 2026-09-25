<script>
  export let groupContextMenu = null;
  export let roomContextMenu = null;
  export let voiceContextMenu = null;
  export let profilePreview = null;
  export let selectedGroupId = "";
  export let currentGroupMember = null;
  export let selectedGroup = null;
  export let user = null;
  export let socialActionId = "";
  export let voiceVolumes = new Map();
  export let canMoveVoiceMembers = false;
  export let voiceRoomId = "";
  export let voiceRooms = [];
  export let activeVoiceRoom = null;
  export let onGroupContextMenuKeydown = () => {};
  export let onRunGroupContextAction = () => {};
  export let onRoomContextMenuKeydown = () => {};
  export let onRunRoomContextAction = () => {};
  export let onVoiceContextMenuKeydown = () => {};
  export let onVoiceParticipantDisplayName = () => "";
  export let onShowVoiceProfile = () => {};
  export let onSendFriendRequest = () => {};
  export let onOpenDirectConversation = () => {};
  export let onMentionVoiceParticipant = () => {};
  export let onSetVoiceVolume = () => {};
  export let onToggleContextParticipantServerMute = () => {};
  export let onToggleVoiceParticipantLocalMute = () => {};
  export let onIsVoiceParticipantLocallyMuted = () => false;
  export let onMoveContextParticipant = () => {};
  export let onDisconnectContextParticipant = () => {};
  export let onCloseProfilePreview = () => {};
</script>

{#if groupContextMenu}
  <div class="group-context-menu" role="menu" tabindex="-1" style={`left:${groupContextMenu.x}px;top:${groupContextMenu.y}px`} on:click|stopPropagation on:keydown|stopPropagation={onGroupContextMenuKeydown}>
    <div class="group-context-heading"><span class="community-avatar">{groupContextMenu.group.name.slice(0, 2).toUpperCase()}</span><span><strong>{groupContextMenu.group.name}</strong><small>{groupContextMenu.group.role === "owner" ? "dono do grupo" : "membro do grupo"}</small></span></div>
    <button type="button" on:click={() => onRunGroupContextAction("open")}>Abrir grupo</button>
    <button type="button" on:click={() => onRunGroupContextAction("invite")} disabled={groupContextMenu.group.role !== "owner" && (selectedGroupId !== groupContextMenu.group.id || !currentGroupMember?.canInvite)}>Convidar pessoas</button>
    <button type="button" on:click={() => onRunGroupContextAction("invite-link")} disabled={groupContextMenu.group.role !== "owner" && (selectedGroupId !== groupContextMenu.group.id || !currentGroupMember?.canInvite)}>Criar link de convite</button>
    <button type="button" on:click={() => onRunGroupContextAction("settings")}>Configurar grupo</button>
    {#if groupContextMenu.group.role !== "owner"}<div class="group-context-divider"></div><button class="group-context-danger" type="button" on:click={() => onRunGroupContextAction("leave")}>Sair do grupo</button>{:else}<div class="group-context-divider"></div><button class="group-context-danger" type="button" on:click={() => onRunGroupContextAction("delete")}>Excluir grupo</button>{/if}
  </div>
{/if}

{#if roomContextMenu}
  <div class="group-context-menu room-context-menu" role="menu" tabindex="-1" style={`left:${roomContextMenu.x}px;top:${roomContextMenu.y}px`} on:click|stopPropagation on:keydown|stopPropagation={onRoomContextMenuKeydown}>
    <div class="group-context-heading"><span class="community-avatar">{roomContextMenu.room.kind === "voice" ? "⌁" : "#"}</span><span><strong>{roomContextMenu.room.kind === "voice" ? "⌁" : "#"}{roomContextMenu.room.name}</strong><small>{roomContextMenu.room.kind === "voice" ? "canal de voz" : "canal de texto"}</small></span></div>
    <button type="button" on:click={() => onRunRoomContextAction("open")}>{roomContextMenu.room.kind === "voice" ? "Entrar no canal" : "Abrir canal"}</button>
    <button type="button" on:click={() => onRunRoomContextAction("read")}>Marcar como lido</button>
    <button type="button" on:click={() => onRunRoomContextAction("copy")}>Copiar link</button>
    {#if selectedGroup?.role === "owner" && roomContextMenu.room.slug !== "geral"}
      <div class="group-context-divider"></div>
      <button type="button" on:click={() => onRunRoomContextAction("edit")}>Editar canal</button>
      <button class="group-context-danger" type="button" on:click={() => onRunRoomContextAction("delete")}>Excluir canal</button>
    {/if}
  </div>
{/if}

{#if voiceContextMenu}
  <div class="voice-context-menu" role="menu" tabindex="-1" style={`left:${voiceContextMenu.x}px;top:${voiceContextMenu.y}px`} on:click|stopPropagation on:keydown|stopPropagation={onVoiceContextMenuKeydown}>
    <div class="voice-context-heading"><span class="member-avatar">{voiceContextMenu.participant.displayName?.slice(0, 1) || "M"}</span><span><strong>{onVoiceParticipantDisplayName(voiceContextMenu.participant)}</strong><small>@{voiceContextMenu.participant.username || "participante"}</small></span></div>
    <button type="button" on:click={() => onShowVoiceProfile(voiceContextMenu.participant)}>Perfil</button>
    {#if voiceContextMenu.participant.userId !== user?.id}<button type="button" on:click={() => onSendFriendRequest(voiceContextMenu.participant)} disabled={socialActionId === voiceContextMenu.participant.userId}>{socialActionId === voiceContextMenu.participant.userId ? "Enviando…" : "Adicionar amigo"}</button>{/if}
    <button type="button" disabled={voiceContextMenu.participant.userId === user?.id} on:click={() => onOpenDirectConversation(voiceContextMenu.participant)}>Enviar mensagem</button>
    <button type="button" on:click={() => onMentionVoiceParticipant(voiceContextMenu.participant)}>Mencionar no chat</button>
    <label class="voice-context-volume"><span>Volume do usuário</span><input type="range" min="0" max="100" value={Math.round((voiceVolumes.get(voiceContextMenu.participant.id) ?? 1) * 100)} on:input={(event) => onSetVoiceVolume(voiceContextMenu.participant.id, event.currentTarget.value)} /></label>
    {#if voiceContextMenu.participant.isLocal}
      <button type="button" on:click={onToggleContextParticipantServerMute}>{voiceContextMenu.participant.muted ? "Ativar meu microfone" : "Silenciar meu microfone"}</button>
    {:else}
      <button type="button" on:click={() => onToggleVoiceParticipantLocalMute(voiceContextMenu.participant.id)}>{onIsVoiceParticipantLocallyMuted(voiceContextMenu.participant.id) ? "Ativar som para mim" : "Silenciar para mim"}</button>
      {#if canMoveVoiceMembers && voiceContextMenu.roomId === voiceRoomId}
        <button type="button" on:click={onToggleContextParticipantServerMute}>{voiceContextMenu.participant.serverMuted ? "Reativar microfone na sala" : "Silenciar na sala"}</button>
      {/if}
    {/if}
    {#if canMoveVoiceMembers && voiceContextMenu.roomId === voiceRoomId && !voiceContextMenu.participant.isLocal}
      <div class="voice-context-divider"></div>
      <span class="voice-context-label">Mover para</span>
      {#each voiceRooms.filter((room) => room.id !== voiceContextMenu.roomId) as room}<button type="button" on:click={() => onMoveContextParticipant(room.id)}>⌁ {room.name}</button>{/each}
      <button class="voice-context-danger" type="button" on:click={onDisconnectContextParticipant}>Desconectar da sala</button>
    {:else if voiceContextMenu.participant.isLocal}
      <button class="voice-context-danger" type="button" on:click={onDisconnectContextParticipant}>Sair da sala</button>
    {/if}
  </div>
{/if}

{#if profilePreview}
  <div class="modal-backdrop" role="presentation" on:click={onCloseProfilePreview}>
    <div class="modal-shell modal-compact voice-profile-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="voice-profile-title" on:click|stopPropagation on:keydown|stopPropagation>
      <header class="modal-header"><div><p class="eyebrow">perfil</p><h2 id="voice-profile-title">{onVoiceParticipantDisplayName(profilePreview)}</h2><p class="muted">@{profilePreview.username || "participante"}</p></div><button class="modal-close outline" type="button" aria-label="Fechar perfil" on:click={onCloseProfilePreview}>×</button></header>
      <div class="voice-profile-body"><span class="voice-profile-avatar">{profilePreview.displayName?.slice(0, 1) || "M"}</span><p class="muted">Participante da sala <strong>{activeVoiceRoom?.name || "de voz"}</strong>.</p></div>
    </div>
  </div>
{/if}
