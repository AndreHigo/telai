<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";
  import GroupLiveGallery from "../../GroupLiveGallery.svelte";

  export let selectedRoomLiveStreams = [];
  export let currentUserId = "";
  export let watchingStreamId = "";
  export let streamUrl = "";
  export let voiceLobbyParticipants = [];
  export let voiceState = "disconnected";
  export let voiceRoomId = "";
  export let selectedRoom = null;
  export let activeVoiceRoom = null;
  export let voiceError = "";
  export let onWatchSelectedRoomLive = () => {};
  export let onCloseSelectedRoomLive = () => {};
  export let onIsVoiceParticipantSpeaking = () => false;
  export let onVoiceParticipantDisplayName = () => "";
  export let onJoinVoiceRoom = () => {};
  export let onLeaveVoiceRoom = () => {};
</script>

<div class="voice-room-workspace">
  {#if selectedRoomLiveStreams.length}
    <GroupLiveGallery streams={selectedRoomLiveStreams} currentUserId={currentUserId} watchingStreamId={watchingStreamId} streamUrl={streamUrl} onWatch={onWatchSelectedRoomLive} onClose={onCloseSelectedRoomLive} />
  {:else}
    <div class="voice-placeholder voice-lobby-placeholder">
      <div class="voice-lobby-header"><div><p class="eyebrow">sala de voz</p><h2>Lobby de voz</h2><p class="muted">Veja quem está aqui e entre na conversa quando quiser.</p></div><span class="voice-lobby-count">{voiceLobbyParticipants.length} pessoa(s)</span></div>
      {#if voiceLobbyParticipants.length}
        <div class="voice-lobby-grid">
          {#each voiceLobbyParticipants as participant}
            <article class:speaking={onIsVoiceParticipantSpeaking(participant)} class="voice-lobby-person"><span class="voice-lobby-avatar">{#if participant.avatarData}<img src={participant.avatarData} alt="" />{:else}<span>{onVoiceParticipantDisplayName(participant)?.slice(0, 1) || "M"}</span>{/if}{#if onIsVoiceParticipantSpeaking(participant)}<i aria-label="falando"></i>{/if}</span><strong class="voice-lobby-name">{onVoiceParticipantDisplayName(participant)}{#if participant.muted}<span class="voice-participant-state-icon is-muted" role="img" aria-label="Microfone desligado" title="Microfone desligado"><HugeiconsIcon icon={iconFor("micOff")} size={14} strokeWidth={1.9} /></span>{/if}{#if participant.deafened}<span class="voice-participant-state-icon is-deafened" role="img" aria-label="Áudio desativado" title="Áudio desativado"><HugeiconsIcon icon={iconFor("volumeOff")} size={14} strokeWidth={1.9} /></span>{/if}</strong><small>{participant.connecting ? "entrando…" : participant.muted ? "silencioso" : onIsVoiceParticipantSpeaking(participant) ? "falando agora" : "na sala"}</small></article>
          {/each}
        </div>
      {:else}
        <div class="voice-lobby-empty"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("volume")} size={24} strokeWidth={1.8} /></span><strong>A sala está vazia</strong><p class="muted">Seja a primeira pessoa a entrar na conversa.</p></div>
      {/if}
      <div class="voice-actions">
        {#if voiceState === "connected" && voiceRoomId === selectedRoom?.id}
          <div class="voice-connected-note"><span class="voice-connected-dot"></span><strong>Você está em voz</strong><small>{activeVoiceRoom?.name || "Sala atual"} · use os controles no rodapé.</small><button class="voice-center-leave-button" type="button" on:click={onLeaveVoiceRoom}>Sair da sala</button></div>
        {:else if voiceState === "connecting" && voiceRoomId === selectedRoom?.id}
          <div class="voice-connected-note"><span class="voice-connected-dot"></span><strong>Você está entrando nesta sala</strong><small>Você já aparece aqui; o áudio termina de conectar em segundo plano.</small></div>
        {:else if voiceState === "connected"}
          <div class="voice-connected-note"><span class="voice-connected-dot"></span><strong>Você está em {activeVoiceRoom?.name || "outra sala"}</strong><small>Entre nesta sala para trocar sem sair manualmente.</small><button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" on:click={onJoinVoiceRoom}>Entrar nesta sala →</button></div>
        {:else}
          <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" on:click={onJoinVoiceRoom}>{voiceState === "connecting" ? "Conectando…" : "Entrar na voz"}</button>
        {/if}
      </div>
      {#if voiceError}<p class="voice-error">{voiceError}</p>{/if}
    </div>
  {/if}
</div>
