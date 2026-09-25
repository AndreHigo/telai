<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../../config/ui.js";

  export let broadcastState = "idle";
  export let broadcastStreamId = "";
  export let broadcastTitle = "";
  export let broadcastSourceType = "screen";
  export let publicBroadcastSourceLabel = () => "Transmissão";
  export let broadcastSelectionKind = "screen";
  export let selectedQuality = "balanced";
  export let qualityProfiles = {};
  export let broadcastError = "";
  export let broadcastAudioWarning = "";
  export let viewerCount = 0;
  export let broadcastVideo = null;
  export let broadcastChatMessages = [];
  export let broadcastChatListElement = null;
  export let broadcastChatDraft = "";
  export let isDesktop = false;
  export let audioMode = "source";
  export let broadcastDisplaySurface = "screen";
  export let broadcastAudioSourceName = "";
  export let broadcastCameraDeviceId = "";
  export let cameraInputDevices = [];
  export let broadcastCameraEnabled = false;
  export let broadcastCameraPosition = "bottom-right";
  export let selectedInputDeviceId = "";
  export let audioInputDevices = [];
  export let broadcastMicrophoneEnabled = true;
  export let broadcastSourceSwitching = false;
  export let broadcastMediaSwitching = false;
  export let voiceDevicesBusy = false;
  export let broadcastInvite = "";
  export let pendingBroadcastContext = null;
  export let onStopBroadcast = () => {};
  export let onNavigateHome = () => {};
  export let onBeginBroadcast = () => {};
  export let onSendChat = () => {};
  export let onBroadcastAudioModeChange = () => {};
  export let onCameraChange = () => {};
  export let onCameraToggle = () => {};
  export let onCameraPositionChange = () => {};
  export let onMicrophoneChange = () => {};
  export let onRefreshDevices = () => {};
  export let onSwitchSource = () => {};
  export let onCopyInvite = () => {};
  export let onRequestCameraStart = () => {};
</script>

<section class="broadcast-page">
  <div class:has-live-actions={broadcastState === "live" || (broadcastState === "error" && broadcastStreamId)} class="broadcast-heading"><div><p class="eyebrow">{broadcastState === "live" ? "transmissão ativa" : "nova transmissão"}</p><h1 class="mt-2 text-4xl font-black tracking-[-.05em] text-white sm:text-5xl">{broadcastState === "live" && broadcastTitle ? broadcastTitle : broadcastSourceType === "camera" ? "Sua câmera ao vivo." : "Compartilhe o que está na sua tela."}</h1><p class="muted mt-3 max-w-2xl text-sm leading-6">{broadcastState === "live" ? `${publicBroadcastSourceLabel(broadcastSelectionKind)} · ${qualityProfiles[selectedQuality]?.width}×${qualityProfiles[selectedQuality]?.height} a ${qualityProfiles[selectedQuality]?.maxFramerate} FPS` : broadcastSourceType === "camera" ? "Use sua câmera e seu microfone para transmitir pelo Telai." : "Escolha uma janela ou uma tela inteira. O Telai cuidará da conexão com quem receber o link."}</p></div><div class="broadcast-heading-actions">{#if broadcastState === "live" || (broadcastState === "error" && broadcastStreamId)}<button class="danger-outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onStopBroadcast} disabled={broadcastState === "stopping"}>{broadcastState === "live" ? "Encerrar transmissão" : "Cancelar live"}</button>{/if}<button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onNavigateHome}>Voltar ao início</button></div></div>
  <div class="broadcast-layout">
    <section class="panel broadcast-preview rounded-3xl p-3 sm:p-4">
      <div class="broadcast-stage">
        {#if broadcastState === "live"}<video bind:this={broadcastVideo} autoplay muted playsinline></video><div class="broadcast-live-badge"><span class="live-pulse"></span> ao vivo{#if viewerCount > 0} · {viewerCount} {viewerCount === 1 ? "pessoa" : "pessoas"} assistindo{/if}</div>{:else if broadcastState === "starting"}<div class="broadcast-empty"><span class="broadcast-spinner"></span><strong>{broadcastSourceType === "camera" ? "Abrindo sua câmera" : "Escolha uma janela ou tela"}</strong><p>{broadcastSourceType === "camera" ? "O navegador pedirá acesso à câmera e ao microfone." : "O seletor do navegador aparecerá em seguida."}</p></div>{:else if broadcastState === "stopping"}<div class="broadcast-empty"><span class="broadcast-spinner"></span><strong>Encerrando sua transmissão</strong><p>Estamos fechando a live e liberando a captura.</p></div>{:else if broadcastState === "error"}<div class="broadcast-empty broadcast-error-state"><strong>{broadcastStreamId ? "A live continua ativa" : "Não foi possível concluir"}</strong><p>{broadcastError}</p><button class="primary mt-4 rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={broadcastStreamId ? onStopBroadcast : () => onBeginBroadcast({ sourceType: broadcastSourceType })}>{broadcastStreamId ? "Encerrar transmissão" : "Tentar novamente"}</button></div>{:else}<div class="broadcast-empty"><span class="broadcast-screen-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("live")} size={28} strokeWidth={1.8} /></span><strong>Sua prévia aparecerá aqui</strong><p>Use os controles ao lado para começar.</p></div>{/if}
      </div>
      {#if broadcastAudioWarning}<p class="broadcast-audio-warning" role="status">{broadcastAudioWarning}</p>{/if}
    </section>
    <aside class="panel broadcast-chat-panel rounded-3xl">
      <div class="broadcast-chat-heading"><div><p class="eyebrow">conversa ao vivo</p><h2>Chat da transmissão</h2></div><span>{broadcastChatMessages.length}</span></div>
      <div bind:this={broadcastChatListElement} class="broadcast-chat-list" aria-live="polite">
        {#if broadcastState !== "live"}<div class="broadcast-chat-empty"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("sparkles")} size={24} strokeWidth={1.8} /></span><strong>O chat aparece quando a live iniciar.</strong><small>As mensagens dos espectadores ficarão disponíveis aqui.</small></div>
        {:else if broadcastChatMessages.length}{#each broadcastChatMessages as message}<article class="broadcast-chat-message"><span>{message.displayName?.slice(0, 1) || "V"}</span><div><div><strong>{message.displayName || "Visitante"}</strong><small>{message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "agora"}</small></div><p>{message.body}</p></div></article>{/each}
        {:else}<div class="broadcast-chat-empty"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("sparkles")} size={24} strokeWidth={1.8} /></span><strong>O chat está pronto.</strong><small>Quando alguém falar, a mensagem aparecerá aqui.</small></div>{/if}
      </div>
      <form class="broadcast-chat-form" on:submit|preventDefault={onSendChat}><input bind:value={broadcastChatDraft} maxlength="500" placeholder="Escreva uma mensagem…" autocomplete="off" disabled={broadcastState !== "live"} aria-label="Mensagem da transmissão" /><button type="submit" disabled={broadcastState !== "live" || !broadcastChatDraft.trim()} aria-label="Enviar mensagem"><HugeiconsIcon icon={iconFor("arrowUp")} size={17} strokeWidth={1.8} /></button></form>
      <p class="broadcast-chat-hint">As mensagens aparecem para quem está assistindo.</p>
    </aside>
    <aside class="panel broadcast-controls rounded-3xl p-5 sm:p-6">
      <div class="broadcast-controls-heading"><p class="eyebrow">configuração rápida</p><h2 class="mt-2 text-2xl font-black text-white">{broadcastSourceType === "camera" ? "Transmitir câmera" : "Transmitir tela"}</h2><p class="muted mt-2 text-sm leading-6">Escolha antes de iniciar ou troque os dispositivos durante a live.</p></div>
      <div class="broadcast-option-group">
        <label>Qualidade<select bind:value={selectedQuality} class="broadcast-select" disabled={broadcastState === "live"}><option value="economy">Leve · 540p30</option><option value="balanced">Equilibrada · 720p30</option><option value="high">Alta · 1080p60</option></select></label>
        {#if broadcastSourceType !== "camera"}<label>Áudio da transmissão<select bind:value={audioMode} on:change={onBroadcastAudioModeChange} class="broadcast-select" disabled={broadcastState === "starting" || broadcastState === "stopping" || broadcastSourceSwitching || broadcastMediaSwitching}><option value="source">Áudio apenas do aplicativo escolhido</option><option value="system">{isDesktop ? "Áudio do computador inteiro (sem Telai/Discord)" : "Áudio do computador inteiro (pelo navegador)"}</option><option value="none">Sem áudio do computador</option></select>{#if audioMode === "source" && broadcastDisplaySurface === "screen"}<small class="muted">{broadcastAudioSourceName ? `Somente ${broadcastAudioSourceName}; Discord e Telai ficam fora.` : "Ao iniciar, escolha qual aplicativo terá áudio."}</small>{:else if audioMode === "system"}<small class="muted">{isDesktop ? "O Telai filtra automaticamente as janelas do Telai e do Discord no app Windows." : "No navegador, marque “Compartilhar áudio do sistema” no seletor da tela inteira."}</small>{/if}</label>{/if}
        <label>Câmera<select class="broadcast-select broadcast-camera-select" bind:value={broadcastCameraDeviceId} on:change={onCameraChange} disabled={broadcastState === "starting" || broadcastState === "stopping" || broadcastMediaSwitching || broadcastSourceSwitching}><option value="">Sem câmera</option>{#each cameraInputDevices as device, index}<option value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>{/each}</select></label>
        {#if broadcastSourceType === "screen"}<label class="broadcast-check"><input class="broadcast-camera-enabled" type="checkbox" bind:checked={broadcastCameraEnabled} on:change={onCameraToggle} disabled={broadcastState === "starting" || broadcastState === "stopping" || broadcastMediaSwitching || broadcastSourceSwitching} /><span><strong>Incluir minha câmera</strong><small>Mostra a câmera sobre a tela compartilhada.</small></span></label>{/if}
        {#if broadcastSourceType === "screen"}<label>Câmera na tela<select class="broadcast-select broadcast-camera-position-select" bind:value={broadcastCameraPosition} on:change={onCameraPositionChange} disabled={broadcastState === "stopping" || broadcastMediaSwitching || broadcastSourceSwitching}><option value="top-left">Canto superior esquerdo</option><option value="top-right">Canto superior direito</option><option value="bottom-left">Canto inferior esquerdo</option><option value="bottom-right">Canto inferior direito</option></select><small class="broadcast-field-hint">A tela continua como fonte principal; a câmera aparece por cima.</small></label>{/if}
        <label>Microfone<select class="broadcast-select broadcast-microphone-select" bind:value={selectedInputDeviceId} on:change={onMicrophoneChange} disabled={broadcastState === "starting" || broadcastState === "stopping" || broadcastMediaSwitching || broadcastSourceSwitching}><option value="">Microfone padrão do sistema</option>{#each audioInputDevices as device, index}<option value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>{/each}</select></label>
        <label class="broadcast-check"><input class="broadcast-microphone-enabled" type="checkbox" bind:checked={broadcastMicrophoneEnabled} on:change={onMicrophoneChange} disabled={broadcastState === "starting" || broadcastState === "stopping" || broadcastMediaSwitching || broadcastSourceSwitching} /><span><strong>Incluir minha voz</strong><small>Usa o mesmo processamento de áudio configurado em Voz.</small></span></label>
        <button class="outline broadcast-refresh-devices rounded-xl px-3 py-2 text-xs font-extrabold" type="button" on:click={onRefreshDevices} disabled={broadcastState === "starting" || broadcastState === "stopping" || voiceDevicesBusy}><HugeiconsIcon icon={iconFor("refresh")} size={16} strokeWidth={1.8} /> Atualizar câmera e microfone</button>
      </div>
      {#if broadcastState === "live"}<div class="broadcast-invite"><label>Link para compartilhar<input readonly value={broadcastInvite} /></label><div class:single={broadcastSourceType === "camera"} class="broadcast-invite-actions">{#if broadcastSourceType === "screen"}<button class="outline rounded-xl px-3 py-2 text-xs font-extrabold" type="button" on:click={onSwitchSource} disabled={broadcastSourceSwitching}>{broadcastSourceSwitching ? "Trocando fonte…" : "Trocar janela/tela"}</button>{/if}<button class="outline rounded-xl px-3 py-2 text-xs font-extrabold" type="button" on:click={onCopyInvite}>Copiar link</button></div></div>{/if}
      <button class="primary broadcast-start-button rounded-xl px-4 py-3 text-sm font-extrabold" type="button" on:click={broadcastState === "live" || (broadcastState === "error" && broadcastStreamId) ? onStopBroadcast : () => onBeginBroadcast({ sourceType: broadcastSourceType, ...(pendingBroadcastContext || {}), visibility: pendingBroadcastContext?.visibility || "public" })} disabled={broadcastState === "stopping"}>{broadcastState === "live" || (broadcastState === "error" && broadcastStreamId) ? "Encerrar transmissão" : broadcastSourceType === "camera" ? "Abrir câmera" : "Escolher tela ou janela"} <HugeiconsIcon icon={iconFor(broadcastState === "live" || (broadcastState === "error" && broadcastStreamId) ? "logout" : "arrowRight")} size={16} strokeWidth={1.8} /></button>
      {#if broadcastState !== "live"}<button class="outline broadcast-camera-button rounded-xl px-4 py-3 text-sm font-extrabold" type="button" on:click={onRequestCameraStart}>Transmitir câmera</button>{/if}
    </aside>
  </div>
</section>
