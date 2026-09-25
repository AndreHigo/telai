<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let showMobileChannels = false;
  export let showGroupPicker = false;
  export let groups = [];
  export let selectedGroup = null;
  export let selectedGroupId = "";
  export let groupLoading = false;
  export let textRooms = [];
  export let voiceRooms = [];
  export let selectedRoomId = "";
  export let voiceDropRoomId = "";
  export let draggedVoiceParticipantId = "";
  export let canMoveVoiceMembers = false;
  export let user = null;
  export let voiceState = "disconnected";
  export let voiceServerMuted = false;
  export let voiceMuted = false;
  export let voiceDeafened = false;
  export let broadcastState = "idle";

  export let onToggleGroupPicker = () => {};
  export let onLoadGroup = () => {};
  export let onCreateGroup = () => {};
  export let onCreateRoom = () => {};
  export let onSelectRoom = () => {};
  export let onVisibleVoiceParticipants = () => [];
  export let onIsVoiceParticipantSpeaking = () => false;
  export let onVoiceParticipantDisplayName = () => "";
  export let onPrivateLiveForParticipant = () => false;
  export let onHandleVoiceDragOver = () => {};
  export let onHandleVoiceDragLeave = () => {};
  export let onHandleVoiceDrop = () => {};
  export let onHandleVoiceDragStart = () => {};
  export let onHandleVoiceDragEnd = () => {};
  export let onToggleVoiceMute = () => {};
  export let onToggleVoiceDeafen = () => {};
  export let onRequestBroadcastStart = () => {};
  export let onOpenVoiceSettings = () => {};
  export let onLeaveVoiceRoom = () => {};
</script>

<aside class:mobile-open={showMobileChannels} class="channel-rail" id="group-channel-rail">
  <div class="group-channel-header">
    <button class="group-switcher" aria-expanded={showGroupPicker} on:click={onToggleGroupPicker}><span class="group-switcher-copy"><span class="group-switcher-avatar">{selectedGroup?.name?.slice(0, 1).toUpperCase() || "G"}</span><span class="group-switcher-label"><strong class="truncate">{selectedGroup?.name || "Grupo"}</strong><small>comunidade</small></span></span><span class="group-switcher-chevron telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("arrowRight")} size={14} strokeWidth={1.8} /></span></button>
    <button class="channel-add" aria-label="Criar canal" disabled={!selectedGroupId || groupLoading} on:click={() => onCreateRoom()}><HugeiconsIcon icon={iconFor("add")} size={17} strokeWidth={1.8} /></button>
    {#if showGroupPicker}
      <div class="group-picker" role="menu">
        {#each groups as group}
          <button class:active={group.id === selectedGroupId} role="menuitem" on:click={() => onLoadGroup(group.id)}><span class="community-avatar">{group.name.slice(0, 2).toUpperCase()}</span><span class="truncate">{group.name}</span><small>{group.role === "owner" ? "dono" : "membro"}</small></button>
        {/each}
        <button class="group-picker-create" role="menuitem" on:click={onCreateGroup}><HugeiconsIcon icon={iconFor("add")} size={15} strokeWidth={1.8} /> Criar grupo</button>
      </div>
    {/if}
  </div>
  <div class="channel-list-scroll">
    {#if groupLoading}
      <div class="channel-loading"><span></span><span></span><span></span></div>
    {:else}
      <div class="channel-section">
        <p class="channel-section-label"><span class="channel-section-title"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("message")} size={15} strokeWidth={1.8} /></span><span>Texto</span><small>{textRooms.length}</small></span><button aria-label="Criar canal de texto" on:click={() => onCreateRoom("text")}><HugeiconsIcon icon={iconFor("add")} size={17} strokeWidth={1.8} /></button></p>
        {#each textRooms as room}
          <button class:active={room.id === selectedRoomId} class="channel-item" aria-current={room.id === selectedRoomId ? "page" : undefined} on:click={() => onSelectRoom(room.id)}><span class="channel-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("message")} size={15} strokeWidth={1.8} /></span><span>{room.name}</span><small>chat</small></button>
        {/each}
      </div>
      <div class="channel-section voice-channel-section">
        <p class="channel-section-label"><span class="channel-section-title"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("volume")} size={15} strokeWidth={1.8} /></span><span>Voz</span><small>{voiceRooms.length}</small></span><button aria-label="Criar canal de voz" on:click={() => onCreateRoom("voice")}><HugeiconsIcon icon={iconFor("add")} size={17} strokeWidth={1.8} /></button></p>
        {#each voiceRooms as room}
          {@const roomParticipants = onVisibleVoiceParticipants(room)}
          <button class:active={room.id === selectedRoomId} class:drop-target={voiceDropRoomId === room.id} class="channel-item" aria-current={room.id === selectedRoomId ? "page" : undefined} on:click={() => onSelectRoom(room.id)} on:dragover={(event) => onHandleVoiceDragOver(event, room)} on:dragleave={(event) => onHandleVoiceDragLeave(event, room)} on:drop={(event) => onHandleVoiceDrop(event, room)}><span class="channel-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("volume")} size={15} strokeWidth={1.8} /></span><span>{room.name}</span><small>{roomParticipants.length ? roomParticipants.length + " aqui" : "vazio"}</small></button>
          {#if roomParticipants.length}
            <div class="channel-voice-members">
              {#each roomParticipants as participant}
                <span class:speaking={onIsVoiceParticipantSpeaking(participant)} class:dragging={draggedVoiceParticipantId === participant.id} class="channel-voice-member" role="button" tabindex="0" aria-label={"Mover " + onVoiceParticipantDisplayName(participant)} draggable={canMoveVoiceMembers} on:dragstart={(event) => onHandleVoiceDragStart(event, participant)} on:dragend={onHandleVoiceDragEnd}>{#if participant.avatarData}<img src={participant.avatarData} alt="" />{:else}<i>{onVoiceParticipantDisplayName(participant)?.slice(0, 1) || "M"}</i>{/if}<b>{onVoiceParticipantDisplayName(participant)}</b>{#if participant.muted}<span class="voice-participant-state-icon is-muted" role="img" aria-label="Microfone desligado" title="Microfone desligado"><HugeiconsIcon icon={iconFor("micOff")} size={14} strokeWidth={1.9} /></span>{/if}{#if participant.deafened}<span class="voice-participant-state-icon is-deafened" role="img" aria-label="Áudio desativado" title="Áudio desativado"><HugeiconsIcon icon={iconFor("volumeOff")} size={14} strokeWidth={1.9} /></span>{/if}{#if participant.connecting}<small class="channel-voice-status">entrando…</small>{/if}{#if onPrivateLiveForParticipant(participant, room.id)}<em class="channel-live-tag">Live</em>{/if}</span>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
  {#if voiceState === "connected"}
    <div class="channel-voice-control">
      <div class="channel-voice-identity"><span class="channel-voice-avatar">{#if user?.avatarData}<img src={user.avatarData} alt="" />{:else}{user?.displayName?.slice(0, 1) || "M"}{/if}</span><span class="channel-voice-copy"><strong>{user?.displayName || "Você"}</strong><small>{voiceServerMuted ? "microfone silenciado na sala" : voiceMuted ? "microfone desligado" : voiceDeafened ? "áudio desativado" : "em voz"}</small></span></div>
      <div class="channel-voice-actions">
        <button class:active={voiceMuted || voiceServerMuted} class="channel-voice-button" type="button" disabled={voiceServerMuted} on:click={onToggleVoiceMute} aria-pressed={voiceMuted || voiceServerMuted} aria-label={voiceServerMuted ? "Microfone silenciado na sala" : voiceMuted ? "Ativar microfone" : "Silenciar microfone"} title={voiceServerMuted ? "Microfone silenciado na sala" : voiceMuted ? "Ativar microfone" : "Silenciar microfone"}><HugeiconsIcon icon={iconFor(voiceMuted || voiceServerMuted ? "micOff" : "mic")} size={18} strokeWidth={1.8} /></button>
        <button class:active={voiceDeafened} class="channel-voice-button" type="button" on:click={onToggleVoiceDeafen} aria-pressed={voiceDeafened} aria-label={voiceDeafened ? "Ativar áudio" : "Desativar áudio"} title={voiceDeafened ? "Ativar áudio" : "Desativar áudio"}><HugeiconsIcon icon={iconFor(voiceDeafened ? "volumeOff" : "volume")} size={18} strokeWidth={1.8} /></button>
        <button class="channel-live-button" type="button" disabled={broadcastState === "starting" || broadcastState === "stopping"} on:click={onRequestBroadcastStart} aria-label={broadcastState === "live" ? "Voltar à live ativa" : "Iniciar live"} title={broadcastState === "live" ? "Você já está ao vivo; clique para voltar à live" : "Iniciar transmissão"}><HugeiconsIcon icon={iconFor("live")} size={18} strokeWidth={1.8} /><span>{broadcastState === "live" ? "Voltar" : "Live"}</span></button>
        <button class="channel-voice-button" type="button" on:click={onOpenVoiceSettings} aria-label="Abrir configurações de voz" title="Configurações de voz"><HugeiconsIcon icon={iconFor("settings")} size={18} strokeWidth={1.8} /></button>
        <button class="channel-voice-leave" type="button" on:click={onLeaveVoiceRoom} aria-label="Sair da voz" title="Sair da voz"><HugeiconsIcon icon={iconFor("logout")} size={18} strokeWidth={1.8} /></button>
      </div>
    </div>
  {/if}
</aside>
