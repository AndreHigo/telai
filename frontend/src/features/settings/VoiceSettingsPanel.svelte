<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { PlayIcon } from "@hugeicons/core-free-icons";

  export let voiceNoiseSuppressionStatus = "";
  export let voiceNativeProcessingDetails = {};
  export let voiceInputProfile = "isolation";
  export let voiceAdvancedOptions = {};
  export let voiceTestRunning = false;
  export let voiceTestLevel = 0;
  export let voiceTestError = "";
  export let voiceTestSpeakerStatus = "";
  export let voiceTestStatus = "";
  export let voiceDevicesBusy = false;
  export let selectedInputDeviceId = "";
  export let selectedOutputDeviceId = "";
  export let audioInputDevices = [];
  export let audioOutputDevices = [];
  export let voiceMicrophoneVolume = 1;
  export let voiceOutputVolume = 1;
  export let pushToTalkEnabled = false;
  export let pushToTalkCapturing = false;
  export let pushToTalkActive = false;
  export let pushToTalkKey = "";
  export let desktopPushToTalkGlobal = false;
  export let muteShortcutCapturing = false;
  export let muteShortcut = "";
  export let desktopMuteShortcutGlobal = false;
  export let voiceAdvancedOpen = false;
  export let soundPreferences = {};
  export let voiceDevicesError = "";
  export let voiceSensitivityAuto = true;
  export let voiceSensitivity = 0.5;

  export let onLoadAudioDevices = () => {};
  export let onApplyVoiceInputDevice = () => {};
  export let onApplyVoiceOutputDevice = () => {};
  export let onSetVoiceMicrophoneVolume = () => {};
  export let onSetVoiceOutputVolume = () => {};
  export let onApplyVoiceInputProfile = () => {};
  export let onTogglePushToTalk = () => {};
  export let onStartPushToTalkCapture = () => {};
  export let onClearPushToTalkKey = () => {};
  export let onStartMuteShortcutCapture = () => {};
  export let onClearMuteShortcut = () => {};
  export let onToggleVoiceAdvanced = () => {};
  export let onUpdateVoiceAdvancedOption = () => {};
  export let onHandleVoiceSoundEffectsChange = () => {};
  export let onHandleSoundVolumeChange = () => {};
  export let onPreviewVoiceSound = () => {};
  export let onHandleSoundPreferenceChange = () => {};
  export let onUpdateVoiceSensitivityAuto = () => {};
  export let onUpdateVoiceSensitivity = () => {};
  export let onStartVoiceTest = () => {};
  export let onStopVoiceTest = () => {};
  export let onTestVoiceSpeaker = () => {};
  export let pushToTalkLabel = () => "";
  export let shortcutLabel = () => "";
</script>

<section class="settings-card voice-settings-card">
  <p class="settings-callout">O perfil Isolamento de Voz usa os filtros nativos do WebRTC no app desktop e na web. Estúdio mantém o áudio cru.</p>
  <p class="settings-callout voice-noise-status" data-status={voiceNoiseSuppressionStatus} role="status" aria-live="polite">
    {#if voiceNoiseSuppressionStatus === "native"}
      Filtros nativos do WebRTC confirmados neste microfone{#if voiceNativeProcessingDetails.noiseSuppression === true} pelo dispositivo.{:else if voiceNativeProcessingDetails.noiseSuppression === false} — o dispositivo não confirmou a supressão de ruído.{:else} — aguardando confirmação do dispositivo.{/if}
    {:else if voiceNoiseSuppressionStatus === "off" || voiceInputProfile === "studio" || (voiceInputProfile === "custom" && !voiceAdvancedOptions.noiseSuppression)}
      Supressão de ruído desligada neste perfil.
    {:else}
      Os filtros nativos do WebRTC serão aplicados ao testar o microfone ou entrar em uma sala.
    {/if}
  </p>
  <div class="voice-test-panel"><div class="voice-test-copy"><div><p class="settings-label">Teste de áudio</p><p class="muted appearance-settings-help">Fale para confirmar se o microfone está sendo capturado antes de entrar em uma sala.</p></div><span class:active={voiceTestRunning} class="voice-test-state">{voiceTestRunning ? "teste ativo" : "pronto para testar"}</span></div><div class:testing={voiceTestRunning} class="voice-test-meter" role="progressbar" aria-label="Nível do microfone" aria-valuemin="0" aria-valuemax="100" aria-valuenow={voiceTestLevel}>{#each Array(32) as _, index}<span class:active={voiceTestRunning && index < Math.ceil(voiceTestLevel / 100 * 32)}></span>{/each}</div><div class="voice-test-actions"><button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => voiceTestRunning ? onStopVoiceTest() : onStartVoiceTest()}>{voiceTestRunning ? "Parar teste" : "Testar microfone"}</button><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={onTestVoiceSpeaker}>Testar alto-falante</button><small>{voiceTestError || voiceTestSpeakerStatus || voiceTestStatus}</small></div></div>
  <div class="settings-card-heading"><div><p class="eyebrow">áudio e voz</p><h2>Dispositivos de voz</h2><p class="muted">Escolha qual microfone usar e para onde o áudio das salas deve sair. A troca do microfone não desconecta você.</p></div><button class="outline rounded-xl px-4 py-2 text-xs font-extrabold" type="button" on:click={() => onLoadAudioDevices(true)} disabled={voiceDevicesBusy}>{voiceDevicesBusy ? "Listando…" : "Atualizar dispositivos"}</button></div>
  <div class="settings-form-grid"><label>Microfone<select class="settings-input" bind:value={selectedInputDeviceId} on:change={(event) => onApplyVoiceInputDevice(event.currentTarget.value)}><option value="">Microfone padrão do sistema</option>{#each audioInputDevices as device, index}<option value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>{/each}</select></label><label>Saída de áudio<select class="settings-input" bind:value={selectedOutputDeviceId} on:change={(event) => onApplyVoiceOutputDevice(event.currentTarget.value)}><option value="">Saída padrão do sistema</option>{#each audioOutputDevices as device, index}<option value={device.deviceId}>{device.label || `Saída de áudio ${index + 1}`}</option>{/each}</select></label></div>
  <div class="voice-volume-grid"><label><span>Volume do microfone <output>{Math.round(voiceMicrophoneVolume * 100)}%</output></span><input type="range" min="0" max="100" step="1" value={Math.round(voiceMicrophoneVolume * 100)} on:input={(event) => void onSetVoiceMicrophoneVolume(event.currentTarget.value)} aria-label="Volume do microfone" /></label><label><span>Volume do fone <output>{Math.round(voiceOutputVolume * 100)}%</output></span><input type="range" min="0" max="100" step="1" value={Math.round(voiceOutputVolume * 100)} on:input={(event) => onSetVoiceOutputVolume(event.currentTarget.value)} aria-label="Volume do fone" /></label></div>
  <div class="voice-input-profiles"><div class="voice-profile-heading"><div><p class="settings-label">Perfil de entrada</p><p class="muted appearance-settings-help">Escolha como o Telai trata o áudio do seu microfone.</p></div></div><label class="voice-profile-option"><input type="radio" name="voice-profile" value="isolation" checked={voiceInputProfile === "isolation"} on:change={() => void onApplyVoiceInputProfile("isolation")} /><span><strong>Isolamento de Voz</strong><small>Só a sua voz; usa eco, ganho automático e supressão nativa.</small></span></label><label class="voice-profile-option"><input type="radio" name="voice-profile" value="studio" checked={voiceInputProfile === "studio"} on:change={() => void onApplyVoiceInputProfile("studio")} /><span><strong>Estúdio</strong><small>Áudio cru: microfone aberto e sem processamento.</small></span></label><label class="voice-profile-option"><input type="radio" name="voice-profile" value="custom" checked={voiceInputProfile === "custom"} on:change={() => void onApplyVoiceInputProfile("custom")} /><span><strong>Personalizado</strong><small>Modo avançado: escolha cada filtro de áudio.</small></span></label></div>
  <div class="push-to-talk-settings"><div class="voice-setting-row"><div><p class="settings-label">Apertar para falar</p><p class="muted appearance-settings-help">Abra o microfone somente enquanto segura a tecla configurada.</p></div><label class="permission-toggle" title="Ativar apertar para falar"><input type="checkbox" checked={pushToTalkEnabled} on:change={onTogglePushToTalk} aria-label="Ativar apertar para falar" /><span></span></label></div><div class="push-to-talk-row"><button class="outline rounded-xl px-4 py-2 text-xs font-extrabold" type="button" on:click={onStartPushToTalkCapture}>{pushToTalkCapturing ? "Pressione uma tecla…" : pushToTalkKey ? pushToTalkLabel(pushToTalkKey) : "Definir tecla"}</button><button class="subtle-action" type="button" on:click={onClearPushToTalkKey} disabled={!pushToTalkKey && !pushToTalkCapturing}>Limpar</button><span class:active={pushToTalkActive} class="push-to-talk-status">{pushToTalkActive ? "microfone aberto" : pushToTalkKey ? desktopPushToTalkGlobal ? "atalho global configurado" : "tecla configurada" : "nenhuma tecla configurada"}</span></div></div>
  <div class="push-to-talk-settings mute-shortcut-settings"><div><p class="settings-label">Atalho para alternar mudo</p><p class="muted appearance-settings-help">Configure uma tecla ou botão lateral do mouse para ativar e desativar o microfone. No app desktop, teclas funcionam mesmo com outra janela em primeiro plano; botões do mouse funcionam com o Telai em foco.</p></div><div class="push-to-talk-row"><button class="outline rounded-xl px-4 py-2 text-xs font-extrabold" type="button" on:click={onStartMuteShortcutCapture}>{muteShortcutCapturing ? "Pressione uma tecla ou mouse…" : muteShortcut ? shortcutLabel(muteShortcut) : "Definir atalho"}</button><button class="subtle-action" type="button" on:click={onClearMuteShortcut} disabled={!muteShortcut && !muteShortcutCapturing}>Limpar</button><span class="push-to-talk-status">{muteShortcut ? desktopMuteShortcutGlobal ? "atalho global configurado" : "atalho configurado" : "nenhum atalho configurado"}</span></div></div>
  <div class="voice-advanced-settings"><div class="voice-setting-row"><div><p class="settings-label">Mostrar configurações de voz avançadas</p><p class="muted appearance-settings-help">Aviso de áudio não detectado, filtros e controles avançados.</p></div><label class="permission-toggle" title="Mostrar configurações avançadas"><input type="checkbox" checked={voiceAdvancedOpen} on:change={onToggleVoiceAdvanced} aria-label="Mostrar configurações avançadas" /><span></span></label></div>{#if voiceAdvancedOpen}<div class="voice-advanced-options"><label><input type="checkbox" checked={voiceAdvancedOptions.echoCancellation} on:change={(event) => onUpdateVoiceAdvancedOption("echoCancellation", event)} /><span>Cancelamento de eco</span></label><label><input type="checkbox" checked={voiceAdvancedOptions.noiseSuppression} on:change={(event) => onUpdateVoiceAdvancedOption("noiseSuppression", event)} /><span>Supressão de ruído</span></label><label><input type="checkbox" checked={voiceAdvancedOptions.autoGainControl} on:change={(event) => onUpdateVoiceAdvancedOption("autoGainControl", event)} /><span>Ganho automático</span></label></div>{/if}</div>
  <div class="voice-sound-settings"><div class="voice-sound-heading"><div><p class="settings-label">Sons e notificações</p><p class="muted appearance-settings-help">Sons curtos para entrada, saída, microfone, mensagens e avisos.</p></div><label class="permission-toggle" title="Ativar efeitos sonoros"><input type="checkbox" checked={soundPreferences.enabled} on:change={onHandleVoiceSoundEffectsChange} aria-label="Ativar efeitos sonoros" /><span></span></label></div><div class="voice-sound-volume"><label for="voice-sound-volume">Volume dos efeitos</label><input id="voice-sound-volume" type="range" min="0" max="100" step="5" value={Math.round(soundPreferences.volume * 100)} on:input={onHandleSoundVolumeChange} /><output>{Math.round(soundPreferences.volume * 100)}%</output></div><div class="voice-sound-grid"><label><input type="checkbox" checked={soundPreferences.enter} on:change={(event) => onHandleSoundPreferenceChange(event, "enter")} /><span>Entrada na sala</span><button type="button" class="sound-preview-button" on:click={() => onPreviewVoiceSound("enter")} aria-label="Testar som de entrada"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.leave} on:change={(event) => onHandleSoundPreferenceChange(event, "leave")} /><span>Saída da sala</span><button type="button" class="sound-preview-button" on:click={() => onPreviewVoiceSound("leave")} aria-label="Testar som de saída"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.mute} on:change={(event) => onHandleSoundPreferenceChange(event, "mute")} /><span>Mutar microfone</span><button type="button" class="sound-preview-button" on:click={() => onPreviewVoiceSound("mute")} aria-label="Testar som de mutar"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.unmute} on:change={(event) => onHandleSoundPreferenceChange(event, "unmute")} /><span>Desmutar microfone</span><button type="button" class="sound-preview-button" on:click={() => onPreviewVoiceSound("unmute")} aria-label="Testar som de desmutar"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.message} on:change={(event) => onHandleSoundPreferenceChange(event, "message")} /><span>Nova mensagem</span><button type="button" class="sound-preview-button" on:click={() => onPreviewVoiceSound("message")} aria-label="Testar som de mensagem"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.notification} on:change={(event) => onHandleSoundPreferenceChange(event, "notification")} /><span>Nova notificação</span><button type="button" class="sound-preview-button" on:click={() => onPreviewVoiceSound("notification")} aria-label="Testar som de notificação"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label></div></div>
  {#if !audioInputDevices.length && !audioOutputDevices.length}<p class="settings-callout">Clique em “Atualizar dispositivos” para permitir o microfone e listar os equipamentos disponíveis.</p>{/if}
  {#if voiceDevicesError}<p class="settings-error" role="alert">{voiceDevicesError}</p>{/if}
  {#if voiceInputProfile === "custom"}<div class="voice-custom-sensitivity"><div class="voice-setting-row"><div><p class="settings-label">Sensibilidade de fala</p><p class="muted appearance-settings-help">Controla o indicador/borda de fala; não altera os filtros de áudio enviados. No automático, o limiar acompanha o ruído ambiente.</p></div><label class="permission-toggle" title="Ajustar automaticamente a sensibilidade"><input type="checkbox" checked={voiceSensitivityAuto} on:change={onUpdateVoiceSensitivityAuto} aria-label="Ajustar automaticamente a sensibilidade de fala" /><span></span></label></div><p class="voice-sensitivity-auto-label">{voiceSensitivityAuto ? "Detecção automática e adaptativa" : "Limiar manual de detecção"}</p>{#if !voiceSensitivityAuto}<label class="voice-sensitivity-range"><span>Limiar de fala <output>{Math.round(voiceSensitivity * 100)}%</output></span><input type="range" min="0" max="100" step="1" value={Math.round(voiceSensitivity * 100)} on:input={onUpdateVoiceSensitivity} aria-label="Sensibilidade do indicador de fala" /><small>Quanto maior o valor, mais facilmente o indicador de fala será ativado.</small></label>{/if}</div>{/if}
</section>
