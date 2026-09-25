<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { AppWindowIcon, BrowserIcon } from "@hugeicons/core-free-icons";
  import { iconFor } from "../../config/ui.js";

  export let isDesktop = false;
  export let showPublicBroadcastSetup = false;
  export let showPublicBroadcastReview = false;
  export let showBroadcastVisibilityDialog = false;
  export let showDisplayPicker = false;
  export let showBroadcastAudioPicker = false;

  export let publicBroadcastTitle = "";
  export let publicBroadcastSourceKind = "screen";
  export let publicBroadcastMicrophoneEnabled = false;
  export let publicBroadcastCameraEnabled = false;
  export let publicBroadcastCameraDeviceId = "";
  export let publicBroadcastQuality = "balanced";
  export let selectedInputDeviceId = "";
  export let audioInputDevices = [];
  export let cameraInputDevices = [];
  export let broadcastError = "";
  export let broadcastTitle = "";
  export let broadcastSelectionKind = "screen";
  export let broadcastSelectedSourceName = "";
  export let broadcastMicrophoneEnabled = false;
  export let broadcastCameraEnabled = false;
  export let qualityProfiles = {};
  export let selectedQuality = "balanced";
  export let broadcastVisibility = "private";
  export let displayPickerAvailability = { screen: false, window: false, tab: false };
  export let displaySourceFilter = "all";
  export let displaySourceGroups = [];
  export let broadcastAudioSourceCandidates = [];

  export let publicBroadcastAudioLabel = () => "Automático";
  export let publicBroadcastSourceLabel = () => "Fonte";
  export let onPublicBroadcastTitleChange = () => {};
  export let onPublicBroadcastSourceKindChange = () => {};
  export let onPublicBroadcastMicrophoneChange = () => {};
  export let onPublicBroadcastCameraChange = () => {};
  export let onPublicBroadcastCameraDeviceChange = () => {};
  export let onPublicBroadcastQualityChange = () => {};
  export let onSelectedInputDeviceChange = () => {};
  export let onCancelPublicBroadcastSetup = () => {};
  export let onConfirmPublicBroadcastSetup = () => {};
  export let onCancelPublicBroadcastReview = () => {};
  export let onConfirmPublicBroadcastReview = () => {};
  export let onCancelBroadcastVisibility = () => {};
  export let onBroadcastVisibilityChange = () => {};
  export let onConfirmBroadcastVisibility = () => {};
  export let onCancelDisplayPicker = () => {};
  export let onDisplaySourceFilterChange = () => {};
  export let onSelectDisplaySource = () => {};
  export let onCancelBroadcastAudioPicker = () => {};
  export let onSelectBroadcastAudioSource = () => {};
  export let onSkipBroadcastAudioSource = () => {};
</script>

{#if showPublicBroadcastSetup}
  <div class="modal-backdrop" role="presentation" on:click={onCancelPublicBroadcastSetup}>
    <div class="modal-shell public-broadcast-setup" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="public-broadcast-setup-title" on:click|stopPropagation on:keydown|stopPropagation>
      <form class="public-broadcast-setup-form" on:submit|preventDefault={onConfirmPublicBroadcastSetup}>
        <header class="modal-header"><div><p class="eyebrow">live pública · electron</p><h2 id="public-broadcast-setup-title">Configure sua transmissão</h2><p class="muted">Defina o que será compartilhado antes de abrir qualquer captura.</p></div><button class="modal-close outline" type="button" aria-label="Fechar configuração da transmissão" on:click={onCancelPublicBroadcastSetup}>×</button></header>
        <div class="modal-body public-broadcast-setup-body">
          <label class="modal-field">Título da live<input class="settings-input" value={publicBroadcastTitle} on:input={(event) => onPublicBroadcastTitleChange(event.currentTarget.value)} maxlength="120" placeholder="Ex.: Jogando Kingdom Come Deliverance 2" required /></label>
          <fieldset class="public-broadcast-fieldset"><legend>O que você quer compartilhar?</legend><div class="public-broadcast-source-options">
            <label class:active={publicBroadcastSourceKind === "screen"} class="public-broadcast-source-option"><input name="public-broadcast-source" type="radio" checked={publicBroadcastSourceKind === "screen"} on:change={() => onPublicBroadcastSourceKindChange("screen")} /><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("computerScreen")} size={20} strokeWidth={1.8} /></span><span><strong>Tela inteira</strong><small>{isDesktop ? "Imagem do monitor e áudio do computador, com Telai e Discord excluídos." : "Imagem do monitor e áudio autorizado no seletor do navegador."}</small></span></label>
            <label class:active={publicBroadcastSourceKind === "window"} class="public-broadcast-source-option"><input name="public-broadcast-source" type="radio" checked={publicBroadcastSourceKind === "window"} on:change={() => onPublicBroadcastSourceKindChange("window")} /><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={AppWindowIcon} size={20} strokeWidth={1.8} /></span><span><strong>Janela</strong><small>Somente a janela escolhida e o áudio dela.</small></span></label>
            <label class:active={publicBroadcastSourceKind === "app"} class="public-broadcast-source-option"><input name="public-broadcast-source" type="radio" checked={publicBroadcastSourceKind === "app"} on:change={() => onPublicBroadcastSourceKindChange("app")} /><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("live")} size={20} strokeWidth={1.8} /></span><span><strong>Aplicativo</strong><small>Escolha um aplicativo na lista e capture somente ele.</small></span></label>
          </div></fieldset>
          <div class="public-broadcast-setup-grid"><label>Qualidade<select class="settings-input" value={publicBroadcastQuality} on:change={(event) => onPublicBroadcastQualityChange(event.currentTarget.value)}><option value="economy">Leve · 540p30</option><option value="balanced">Equilibrada · 720p30</option><option value="high">Alta · 1080p60</option></select></label><div class="public-broadcast-audio-summary"><span class="settings-label">Áudio da transmissão</span><strong>{publicBroadcastAudioLabel()}</strong><small>Definido automaticamente pela fonte.</small></div></div>
          <fieldset class="public-broadcast-fieldset"><legend>Dispositivos opcionais</legend><div class="public-broadcast-device-grid">
            <label class="public-broadcast-toggle"><input type="checkbox" checked={publicBroadcastMicrophoneEnabled} on:change={(event) => onPublicBroadcastMicrophoneChange(event.currentTarget.checked)} /><span><strong>Ativar microfone</strong><small>Inclui sua voz na transmissão.</small></span></label>
            {#if publicBroadcastMicrophoneEnabled}<label>Microfone<select class="settings-input" value={selectedInputDeviceId} on:change={(event) => onSelectedInputDeviceChange(event.currentTarget.value)}><option value="">Microfone padrão do sistema</option>{#each audioInputDevices as device, index}<option value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>{/each}</select></label>{/if}
            <label class="public-broadcast-toggle"><input type="checkbox" checked={publicBroadcastCameraEnabled} on:change={(event) => onPublicBroadcastCameraChange(event.currentTarget.checked)} /><span><strong>Ativar câmera</strong><small>Mostra sua câmera sobre a transmissão.</small></span></label>
            {#if publicBroadcastCameraEnabled}<label>Câmera<select class="settings-input" value={publicBroadcastCameraDeviceId} on:change={(event) => onPublicBroadcastCameraDeviceChange(event.currentTarget.value)}><option value="">Câmera padrão do sistema</option>{#each cameraInputDevices as device, index}<option value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>{/each}</select></label>{/if}
          </div></fieldset>
          {#if broadcastError}<p class="settings-error" role="alert">{broadcastError}</p>{/if}
        </div>
        <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={onCancelPublicBroadcastSetup}>Cancelar</button><button type="submit" class="primary rounded-xl px-4 py-2 text-sm font-bold">Escolher fonte <HugeiconsIcon icon={iconFor("arrowRight")} size={16} strokeWidth={1.8} /></button></footer>
      </form>
    </div>
  </div>
{/if}

{#if showPublicBroadcastReview}
  <div class="modal-backdrop" role="presentation">
    <div class="modal-shell modal-compact public-broadcast-review" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="public-broadcast-review-title" on:click|stopPropagation on:keydown|stopPropagation>
      <header class="modal-header"><div><p class="eyebrow">última revisão</p><h2 id="public-broadcast-review-title">Tudo pronto para entrar ao vivo?</h2><p class="muted">Nada foi publicado ainda. Confirme para abrir a live pública.</p></div></header>
      <div class="modal-body public-broadcast-review-body"><div class="public-broadcast-review-row"><span>Live</span><strong>{broadcastTitle || "Transmissão pública"}</strong></div><div class="public-broadcast-review-row"><span>Fonte</span><strong>{publicBroadcastSourceLabel(broadcastSelectionKind)}{broadcastSelectedSourceName ? ` · ${broadcastSelectedSourceName}` : ""}</strong></div><div class="public-broadcast-review-row"><span>Áudio</span><strong>{publicBroadcastAudioLabel(broadcastSelectionKind)}</strong></div><div class="public-broadcast-review-row"><span>Dispositivos</span><strong>{broadcastMicrophoneEnabled ? "Microfone ativado" : "Sem microfone"} · {broadcastCameraEnabled ? "Câmera ativada" : "Sem câmera"}</strong></div><div class="public-broadcast-review-row"><span>Qualidade</span><strong>{qualityProfiles[selectedQuality]?.label} · {qualityProfiles[selectedQuality]?.width}×{qualityProfiles[selectedQuality]?.height} a {qualityProfiles[selectedQuality]?.maxFramerate} FPS</strong></div></div>
      <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={onCancelPublicBroadcastReview}>Cancelar</button><button type="button" class="primary rounded-xl px-4 py-2 text-sm font-bold" on:click={onConfirmPublicBroadcastReview}>Iniciar transmissão <HugeiconsIcon icon={iconFor("arrowRight")} size={16} strokeWidth={1.8} /></button></footer>
    </div>
  </div>
{/if}

{#if showBroadcastVisibilityDialog}
  <div class="modal-backdrop" role="presentation" on:click={onCancelBroadcastVisibility}>
    <div class="modal-shell modal-compact broadcast-visibility-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="broadcast-visibility-title" on:click|stopPropagation on:keydown|stopPropagation>
      <header class="modal-header"><div><p class="eyebrow">iniciar live</p><h2 id="broadcast-visibility-title">Quem poderá assistir?</h2><p class="muted">Escolha onde a transmissão desta sala ficará disponível.</p></div><button class="modal-close outline" type="button" aria-label="Fechar escolha de visibilidade" on:click={onCancelBroadcastVisibility}>×</button></header>
      <div class="modal-body broadcast-visibility-options">
        <label class:active={broadcastVisibility === "private"} class="broadcast-visibility-option"><input name="broadcast-visibility" type="radio" checked={broadcastVisibility === "private"} on:change={() => onBroadcastVisibilityChange("private")} /><span><strong>Privada neste grupo</strong><small>A live aparece no topo e dentro desta sala de voz para os membros do grupo.</small></span></label>
        <label class:active={broadcastVisibility === "public"} class="broadcast-visibility-option"><input name="broadcast-visibility" type="radio" checked={broadcastVisibility === "public"} on:change={() => onBroadcastVisibilityChange("public")} /><span><strong>Pública</strong><small>A live fica disponível no canal Ao vivo, como as transmissões públicas atuais.</small></span></label>
      </div>
      <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={onCancelBroadcastVisibility}>Cancelar</button><button type="button" class="primary rounded-xl px-4 py-2 text-sm font-bold" on:click={onConfirmBroadcastVisibility}>Escolher tela <HugeiconsIcon icon={iconFor("arrowRight")} size={16} strokeWidth={1.8} /></button></footer>
    </div>
  </div>
{/if}

{#if showDisplayPicker}
  <div class="display-picker-backdrop" role="presentation">
    <div class="modal-shell display-picker" role="dialog" aria-modal="true" aria-labelledby="display-picker-title">
      <header class="modal-header"><div><p class="eyebrow">transmitir tela</p><h2 id="display-picker-title">Escolha o que transmitir</h2><p class="muted">Selecione uma janela ou uma tela inteira para começar sua live.</p></div><button class="modal-close outline" type="button" aria-label="Cancelar seleção" on:click={onCancelDisplayPicker}>×</button></header>
      <div class="modal-body display-picker-body">
        <div class="display-picker-guide" role="tablist" aria-label="Filtrar fontes de transmissão">
          <button class:active={displaySourceFilter === "all"} class="display-picker-guide-item" type="button" role="tab" aria-selected={displaySourceFilter === "all"} on:click={() => onDisplaySourceFilterChange("all")}><span class="display-picker-guide-icon all telai-icon"><HugeiconsIcon icon={iconFor("sparkles")} size={20} strokeWidth={1.8} /></span><span><strong>Todas as fontes</strong><small>Mostrar monitores e janelas disponíveis.</small></span></button>
          <button class:active={displaySourceFilter === "screen"} class:unavailable={!displayPickerAvailability.screen} class="display-picker-guide-item" type="button" role="tab" aria-selected={displaySourceFilter === "screen"} disabled={!displayPickerAvailability.screen} on:click={() => onDisplaySourceFilterChange("screen")}><span class="display-picker-guide-icon screen telai-icon"><HugeiconsIcon icon={iconFor("live")} size={20} strokeWidth={1.8} /></span><span><strong>Monitor inteiro</strong><small>Ideal para jogos e tudo que está na tela.</small></span></button>
          <button class:active={displaySourceFilter === "window"} class:unavailable={!displayPickerAvailability.window} class="display-picker-guide-item" type="button" role="tab" aria-selected={displaySourceFilter === "window"} disabled={!displayPickerAvailability.window} on:click={() => onDisplaySourceFilterChange("window")}><span class="display-picker-guide-icon window telai-icon"><HugeiconsIcon icon={AppWindowIcon} size={20} strokeWidth={1.8} /></span><span><strong>Janela do aplicativo</strong><small>Ideal para transmitir só um programa.</small></span></button>
          <button class:active={displaySourceFilter === "tab"} class:unavailable={!displayPickerAvailability.tab} class="display-picker-guide-item" type="button" role="tab" aria-selected={displaySourceFilter === "tab"} disabled={!displayPickerAvailability.tab} on:click={() => onDisplaySourceFilterChange("tab")}><span class="display-picker-guide-icon tab telai-icon"><HugeiconsIcon icon={BrowserIcon} size={20} strokeWidth={1.8} /></span><span><strong>Guia do navegador</strong><small>{displayPickerAvailability.tab ? "Compartilha somente esta guia." : "Indisponível no app; escolha a janela do navegador."}</small></span></button>
        </div>
        {#if displaySourceFilter !== "all" && !displaySourceGroups.length}
          <div class="display-picker-filter-empty"><strong>Nenhuma fonte nesta categoria</strong><p class="muted">Escolha outra categoria ou mostre todas as fontes disponíveis.</p><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={() => onDisplaySourceFilterChange("all")}>Mostrar todas</button></div>
        {:else}
          {#each displaySourceGroups as group}
            <section class="display-source-section" aria-labelledby={`display-source-${group.id}`}>
              <header class="display-source-section-heading"><div><h3 id={`display-source-${group.id}`}><span class="display-source-heading-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor(group.icon)} size={18} strokeWidth={1.8} /></span>{group.label}</h3><p>{group.description}</p></div><span class="display-source-count">{group.sources.length} opção{group.sources.length === 1 ? "" : "ões"}</span></header>
              <div class="display-source-grid">{#each group.sources as source}<button class="display-source-card" type="button" on:click={() => onSelectDisplaySource(source)}><span class="display-source-preview">{#if source.thumbnail}<img src={source.thumbnail} alt={`Prévia de ${source.name}`} />{:else}<span class="display-source-preview-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor(group.icon)} size={34} strokeWidth={1.8} /></span>{/if}</span><span class="display-source-copy"><strong>{source.name}</strong><small>{group.id === "screen" ? "Monitor inteiro · captura tudo" : "Janela do aplicativo · somente esta janela"}</small></span></button>{/each}</div>
            </section>
          {/each}
        {/if}
      </div>
      <footer class="modal-footer display-picker-footer"><span class="muted">O áudio segue a opção escolhida na tela de transmissão.</span><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onCancelDisplayPicker}>Cancelar</button></footer>
    </div>
  </div>
{/if}

{#if showBroadcastAudioPicker}
  <div class="display-picker-backdrop" role="presentation">
    <div class="modal-shell display-picker broadcast-audio-picker" role="dialog" aria-modal="true" aria-labelledby="broadcast-audio-picker-title">
      <header class="modal-header"><div><p class="eyebrow">áudio da transmissão</p><h2 id="broadcast-audio-picker-title">Escolha o aplicativo que terá áudio</h2><p class="muted">A tela inteira continuará visível, mas somente o aplicativo escolhido será ouvido. Discord e Telai ficam fora automaticamente.</p></div><button class="modal-close outline" type="button" aria-label="Cancelar seleção de áudio" on:click={onCancelBroadcastAudioPicker}>×</button></header>
      <div class="modal-body display-picker-body">
        {#if broadcastAudioSourceCandidates.length}
          <section class="display-source-section" aria-labelledby="broadcast-audio-source-title"><header class="display-source-section-heading"><div><h3 id="broadcast-audio-source-title"><span class="display-source-heading-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("volume")} size={18} strokeWidth={1.8} /></span>Aplicativos disponíveis</h3><p>Escolha o jogo ou programa que deve entrar na transmissão.</p></div><span class="display-source-count">{broadcastAudioSourceCandidates.length} opção{broadcastAudioSourceCandidates.length === 1 ? "" : "ões"}</span></header><div class="display-source-grid">{#each broadcastAudioSourceCandidates as source}<button class="display-source-card" type="button" on:click={() => onSelectBroadcastAudioSource(source)}><span class="display-source-preview">{#if source.thumbnail}<img src={source.thumbnail} alt={`Prévia de ${source.name}`} />{:else}<span class="display-source-preview-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("volume")} size={34} strokeWidth={1.8} /></span>{/if}</span><span class="display-source-copy"><strong>{source.name}</strong><small>{source.processName || "Aplicativo"} · somente áudio</small></span></button>{/each}</div></section>
        {:else}
          <div class="display-picker-filter-empty"><strong>Nenhum aplicativo de áudio disponível</strong><p class="muted">Abra o jogo ou programa que deseja transmitir e tente novamente.</p></div>
        {/if}
      </div>
      <footer class="modal-footer display-picker-footer"><span class="muted">O áudio do Discord e do Telai não será incluído.</span><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={onSkipBroadcastAudioSource}>Continuar sem áudio</button></footer>
    </div>
  </div>
{/if}
