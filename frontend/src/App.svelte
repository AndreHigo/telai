<script>
  import { onDestroy, onMount, tick } from "svelte";
  import Viewer from "./Viewer.svelte";
  import AuthPage from "./features/auth/AuthPage.svelte";
  import NotificationsPage from "./features/notifications/NotificationsPage.svelte";
  import { createNotificationController } from "./features/notifications/controller.js";
  import FriendsPage from "./features/social/FriendsPage.svelte";
  import FollowingPage from "./features/social/FollowingPage.svelte";
  import DirectMessagesPage from "./features/direct/DirectMessagesPage.svelte";
  import BroadcastPage from "./features/broadcast/BroadcastPage.svelte";
  import HomePage from "./features/home/HomePage.svelte";
  import GroupPickerPage from "./features/groups/GroupPickerPage.svelte";
  import GroupMemberRail from "./features/groups/GroupMemberRail.svelte";
  import GroupServerRail from "./features/groups/GroupServerRail.svelte";
  import GroupChannelRail from "./features/groups/GroupChannelRail.svelte";
  import GroupWorkspaceHeader from "./features/groups/GroupWorkspaceHeader.svelte";
  import GroupChatHeader from "./features/groups/GroupChatHeader.svelte";
  import GroupTextChatWorkspace from "./features/groups/GroupTextChatWorkspace.svelte";
  import GroupVoiceWorkspace from "./features/groups/GroupVoiceWorkspace.svelte";
  import AppHeader from "./features/shell/AppHeader.svelte";
  import GlobalSidebar from "./features/shell/GlobalSidebar.svelte";
  import VoiceReconnectBanner from "./features/shell/VoiceReconnectBanner.svelte";
  import SettingsCategoryNav from "./features/settings/SettingsCategoryNav.svelte";
  import SettingsHeading from "./features/settings/SettingsHeading.svelte";
  import ChannelProfileSettings from "./features/settings/ChannelProfileSettings.svelte";
  import SettingsInternalNav from "./features/settings/SettingsInternalNav.svelte";
  import AccountProfileSettings from "./features/settings/AccountProfileSettings.svelte";
  import PreferencesSettings from "./features/settings/PreferencesSettings.svelte";
  import LinkedAccountsSettings from "./features/settings/LinkedAccountsSettings.svelte";
  import GroupAdministrationSettings from "./features/settings/GroupAdministrationSettings.svelte";
  import NotificationPreferencesSettings from "./features/settings/NotificationPreferencesSettings.svelte";
  import GroupLiveGallery from "./GroupLiveGallery.svelte";
  import AccountPrivacy from "./AccountPrivacy.svelte";
  import LegalConsentGate from "./LegalConsentGate.svelte";
  import { createApiClient } from "./services/api.js";
  import {
    createSelectedVoiceAudioConstraints,
    createVoiceAudioConstraints,
    createVoiceInputPipeline,
  } from "./services/media/voice-input.js";
  import { createVoiceCaptureService } from "./services/media/voice-capture.js";
  import { createVoiceTrackSyncService } from "./services/media/voice-track-sync.js";
  import {
    audioDeviceDisplayLabel,
    isUnavailableVoiceInputError,
    normalizeAudioDeviceLabel,
    normalizeAudioVolume,
    rawAudioDeviceLabel,
    readStoredVoiceDeviceId,
    readStoredVoiceDeviceLabel,
  } from "./services/media/voice-device-utils.js";
  import { createClientDiagnostics } from "./services/client-diagnostics.js";
  import { globalNavSections, iconFor, notificationIconFor } from "./config/ui.js";
  import { createVoiceSpeakingPublisher, updateVoiceActivitySpeakingState } from "./voice-activity.js";
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { AppWindowIcon, BrowserIcon, PlayIcon } from "@hugeicons/core-free-icons";

  const APP_VERSION = typeof __MIRANTE_VERSION__ === "string" ? __MIRANTE_VERSION__ : "desconhecida";
  const WEB_VERSION = typeof __MIRANTE_WEB_VERSION__ === "string" ? __MIRANTE_WEB_VERSION__ : "desconhecida";
  const RELEASE_NOTES_CONTENT = {
      title: "Notas da atualização",
      summary: "Uma rodada de melhorias para deixar o Telai mais claro, compacto e confiável durante transmissões e chamadas.",
      sections: [
        {
          title: "Transmissões públicas",
          items: [
            "Novo fluxo antes de iniciar a live: título, fonte, áudio, câmera, microfone e qualidade ficam definidos antes da publicação.",
            "A câmera pode ser incluída ou removida, trocada e posicionada sem interromper a transmissão.",
            "Melhorias na captura de tela, áudio do aplicativo escolhido e recuperação quando a captura é perdida.",
          ],
        },
        {
          title: "Áudio e chamadas",
          items: [
            "O perfil Isolamento de Voz usa os filtros nativos do WebRTC no app desktop e na web. Estúdio mantém o áudio cru.",
            "O teste de microfone voltou a exibir o indicador de nível e os controles de áudio ficaram mais consistentes.",
            "Os ícones do player agora refletem corretamente quando o áudio está mutado ou ativo.",
          ],
        },
        {
          title: "Interface e estabilidade",
          items: [
            "Cabeçalho, menu lateral e cartões de grupos receberam ajustes de espaçamento e responsividade.",
            "O painel de reconexão e o encerramento de transmissões ficaram mais previsíveis quando uma captura cai.",
          ],
        },
      ],
  };
  const RELEASE_NOTES = {
    desktop: { "0.2.68": { platformLabel: "app desktop", ...RELEASE_NOTES_CONTENT } },
    web: { "2026-09-22": { platformLabel: "versão web", ...RELEASE_NOTES_CONTENT } },
  };
  const reportClientError = createClientDiagnostics({
    routineKinds: ["voice_activity_sample", "voice_activity_state"],
    getRoute: () => window.location.pathname,
    getAppVersion: () => runtimeVersion(),
    getView: () => view,
    isDesktop: () => Boolean(window.miranteDesktop?.isDesktop),
  });

  async function copyText(text, successMessage, failureMessage) {
    const value = String(text || "");
    if (!value) {
      notice = failureMessage;
      return false;
    }
    try {
      // No Electron, o clipboard do processo principal continua disponível
      // mesmo quando a página remota não recebe permissão do Chromium.
      if (window.miranteDesktop?.copyText) {
        const result = await window.miranteDesktop.copyText(value);
        if (result?.ok) {
          notice = successMessage;
          return true;
        }
      }
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("Clipboard indisponível neste contexto.");
      }
      notice = successMessage;
      return true;
    } catch (error) {
      reportClientError("clipboard_error", error);
      notice = failureMessage;
      return false;
    }
  }

  let loading = true;
  let user = null;
  let groups = [];
  let streams = [];
  let view = "home";
  let groupsWorkspaceOpen = false;
  let groupPickerQuery = "";
  let showGlobalSidebar = false;
  let globalSidebarCollapsed = false;
  let compactViewport = false;
  let isViewer = false;
  let viewerParentFullscreen = false;
  let viewerRoomId = "";
  let viewerStreamPath = "";
  let viewerStream = null;
  let selectedGroupId = null;
  let groupOverview = null;
  let knownGroupMessageIds = new Set();
  let selectedRoomId = null;
  let watchingGroupLiveStreamId = "";
  let groupLoading = false;
  let followingOnly = false;
  let liveNotificationScope = "related";
  let liveNotificationScopes = ["related"];
  let selectedStreams = new Set();
  let multistreamOpen = false;
  let theme = "dark";
  let notice = "";
  let maintenanceNotice = null;
  let maintenanceRemainingSeconds = 0;
  let maintenanceReloadKey = "";
  let providers = { google: false, discord: false };
  let authMode = "login";
  let authBusy = false;
  let authError = "";
  let loginUsername = "";
  let loginPassword = "";
  let registerDisplayName = "";
  let registerUsername = "";
  let registerPassword = "";
  let registerLegalAccepted = false;
  let messageDraft = "";
  let messageComposerInput;
  let mentionSuggestions = [];
  let mentionStartIndex = -1;
  let mentionActiveIndex = 0;
  let broadcastState = "idle";
  let broadcastError = "";
  let broadcastTitle = "";
  let broadcastInvite = "";
  let broadcastRoomId = "";
  let broadcastStreamId = "";
  let broadcastStream = null;
  let broadcastMicrophoneStream = null;
  let broadcastDisplayStream = null;
  let broadcastCameraStream = null;
  let broadcastSourceAudioTrack = null;
  let broadcastCameraDeviceId = "";
  let broadcastCameraPosition = "bottom-right";
  let broadcastCameraEnabled = false;
  let broadcastMicrophoneEnabled = true;
  let broadcastVideoComposition = null;
  let broadcastAudioMixContext = null;
  let broadcastAudioMixDestination = null;
  let broadcastSocket = null;
  let broadcastChatMessageIds = new Set();
  let broadcastChatMessages = [];
  let broadcastChatDraft = "";
  let broadcastChatListElement;
  let broadcastStopPromise = null;
  let broadcastCaptureRecoveryTimer = null;
  let broadcastSourceType = "screen";
  let broadcastDisplaySurface = null;
  let mediaMode = "p2p";
  let relayRecorder = null;
  let relaySendChain = Promise.resolve();
  let broadcastVideo;
  let broadcastAudioWarning = "";
  let broadcastVisibility = "private";
  let showBroadcastVisibilityDialog = false;
  let showPublicBroadcastSetup = false;
  let showPublicBroadcastReview = false;
  let publicBroadcastTitle = "";
  let publicBroadcastSourceKind = "screen";
  let publicBroadcastMicrophoneEnabled = false;
  let publicBroadcastCameraEnabled = false;
  let publicBroadcastCameraDeviceId = "";
  let publicBroadcastQuality = "balanced";
  let publicBroadcastReviewSelection = null;
  let broadcastSelectedSourceName = "";
  let broadcastSelectionKind = "screen";
  let pendingBroadcastContext = null;
  let pendingBroadcastSourceType = "screen";
  let displaySources = [];
  let showDisplayPicker = false;
  let displaySourceSelection = null;
  let displaySourceFilter = "all";
  let broadcastAudioSources = [];
  let showBroadcastAudioPicker = false;
  let broadcastAudioSelection = null;
  let broadcastAudioProcessId = null;
  let broadcastAudioSourceName = "";
  let selectedDisplayProcessId = null;
  let activeDisplayProcessId = null;
  let broadcastSourceSwitching = false;
  let broadcastMediaSwitching = false;
  let windowAudioContext = null;
  let windowAudioProcessor = null;
  let windowAudioDestination = null;
  let windowAudioUnsubscribe = null;
  let windowAudioStatusUnsubscribe = null;
  let windowAudioQueue = [];
  let windowAudioQueuedFrames = 0;
  let viewerCount = 0;
  let peerConnections = new Map();
  let pendingBroadcastCandidates = new Map();
  let broadcastPeerRetryTimers = new Map();
  let broadcastPeerNegotiations = new Map();
  let selectedQuality = "balanced";
  let audioMode = "source";
  let buttonColor = "#5b5fea";
  let inputBackgroundColor = "#0d1728";
  let backgroundColor = "#070b16";
  let rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  let rtcConfigLoadedAt = 0;
  const VOICE_ICE_REFRESH_MS = 45 * 60 * 1000;
  let voiceState = "idle";
  let voiceError = "";
  let voiceMuted = false;
  // Diferencia o mute automático causado por uma captura indisponível do
  // mute escolhido manualmente pelo usuário. Assim, ao selecionar um
  // microfone válido depois de entrar na sala, podemos restaurar a captura
  // sem alterar um mute intencional.
  let voiceMutedByCaptureFailure = false;
  let voiceServerMuted = false;
  let pushToTalkKey = "";
  let pushToTalkEnabled = localStorage.getItem("mirante-push-to-talk-enabled") === "true";
  let pushToTalkCapturing = false;
  let pushToTalkActive = false;
  let muteShortcut = "";
  let muteShortcutCapturing = false;
  let voiceDeafened = false;
  let voiceRoomId = null;
  let voiceClientId = null;
  let voiceLocalStream = null;
  let voiceSocket = null;
  let voiceParticipants = new Map();
  let voicePeerConnections = new Map();
  let voicePeerDisconnectTimers = new Map();
  let voicePeerConnectionTimers = new Map();
  let voicePeerAudioTrackTimers = new Map();
  let voicePeerRecoveryInFlight = new Set();
  let voicePeerNegotiationInFlight = new Set();
  let voicePeerAudioHealth = new Map();
  let voicePeerHealthTimer = null;
  let voicePeerHealthInFlight = false;
  let voicePeerRelayRecoveryAttempted = new Set();
  let voicePendingCandidates = new Map();
  let voiceSignalQueues = new Map();
  let voicePendingSignals = new Map();
  let voiceRemoteAudio = new Map();
  let voiceRemoteStreams = new Map();
  let voiceRemoteAudioBindings = new Map();
  let voiceRemotePlaybackTimers = new Map();
  let voicePlaybackBlocked = false;
  let voiceInputRecoveryInFlight = false;
  let voiceInputSelectionRevision = 0;
  let voiceBoundInputTracks = new WeakSet();
  let voiceInputDeviceByStream = new WeakMap();
  let voiceReconnectSession = null;
  let voiceReconnectVisible = false;
  let voiceReconnectBusy = false;
  let voiceReconnectTimer = null;
  let voiceAnalyzers = new Map();
  let voiceAnalyzerPendingIds = new Set();
  let voiceAnalyzerTokens = new Map();
  let voiceRtcSpeakingParticipantIds = new Set();
  let voiceRtcStatSnapshots = new Map();
  let voiceRtcActivityPending = false;
  let speakingVoiceParticipantIds = new Set();
  // O estado de fala enviado pelo servidor é a fonte autoritativa da borda
  // para participantes atuais. O analisador remoto fica apenas como fallback
  // para clientes antigos que ainda não publicam esse estado.
  let voiceSpeakingSignalKnownParticipantIds = new Set();
  let voiceSoundContext = null;
  let pendingNotificationSound = false;
  let voiceActivityTimer;
  // Para o microfone local, a borda acompanha a janela de áudio do analisador.
  // A saída usa uma cauda curta para não piscar com ruído e o tempo mínimo
  // entre mudanças impede excesso de eventos no WebSocket durante uma fala.
  const VOICE_ACTIVITY_POLL_MS = 16;
  const VOICE_ACTIVITY_RELEASE_MS = 120;
  const VOICE_ACTIVITY_MIN_STATE_MS = 160;
  const VOICE_ACTIVITY_CALIBRATION_MS = 32;
  const VOICE_ACTIVITY_ONSET_GUARD_MS = 48;
  // Publica transições no mesmo ciclo do detector e só enfileira se o fluxo
  // se aproximar do limite por janela do servidor.
  const voiceSpeakingPublisher = createVoiceSpeakingPublisher({
    send: (message) => sendVoice(message),
    isReady: (participantId) => participantId === voiceClientId && voiceSocket?.readyState === WebSocket.OPEN,
  });
  const VOICE_PEER_AUDIO_GRACE_MS = 4_000;
  const VOICE_PEER_CONNECTION_TIMEOUT_MS = 8_000;
  const VOICE_PEER_AUDIO_TRACK_TIMEOUT_MS = 6_000;
  const VOICE_PEER_HEALTH_POLL_MS = 2_000;
  const VOICE_REMOTE_PLAYBACK_RETRY_MS = 1_000;
  const soundPreferenceDefaults = { enabled: true, volume: 0.55, enter: true, leave: true, mute: true, unmute: true, message: true, notification: true };
  function readSoundPreferences() {
    try {
      const parsed = JSON.parse(localStorage.getItem("mirante-sound-preferences") || "null");
      if (!parsed || typeof parsed !== "object") throw new Error("invalid sound preferences");
      return { ...soundPreferenceDefaults, ...parsed, volume: Math.min(1, Math.max(0, Number(parsed.volume ?? soundPreferenceDefaults.volume))) };
    } catch {
      return { ...soundPreferenceDefaults, enabled: localStorage.getItem("mirante-voice-sounds") !== "false" };
    }
  }
  let soundPreferences = readSoundPreferences();
  let voiceSoundEffects = soundPreferences.enabled;
  class VoicePreferenceMap extends Map {
    get(key) {
      const targetUserId = voicePreferenceTargetId(key);
      return super.get(targetUserId) ?? super.get(key);
    }
  }
  let voiceVolumes = new VoicePreferenceMap();
  let voiceLocallyMutedParticipants = new Set();
  let voicePreferencePersistTimers = new Map();
  let voiceContextMenu = null;
  let profilePreview = null;
  let draggedVoiceParticipantId = "";
  let voiceDropRoomId = "";
  let audioInputDevices = [];
  let cameraInputDevices = [];
  let audioOutputDevices = [];
  let allAudioInputDevices = [];
  let audioDevicesRequestRevision = 0;
  // Streams capturados no microfone padrão depois que o dispositivo salvo
  // deixou de existir. A marca evita que uma troca automática seja tratada
  // como uma seleção manual concorrente.
  let voiceInputFallbackStreams = new WeakSet();
  function persistPreferredInputDeviceId(deviceId) {
    if (!user) return;
    api("/api/auth/preferences", {
      method: "PATCH",
      body: JSON.stringify({ preferredInputDeviceId: deviceId || null }),
    }).catch((error) => reportClientError("voice_input_device_server_persist_error", error));
  }

  function clearUnavailableInputDevice(expectedDeviceId = "") {
    if (expectedDeviceId && selectedInputDeviceId !== expectedDeviceId) return false;
    const previousDeviceId = selectedInputDeviceId;
    selectedInputDeviceId = "";
    selectedInputDeviceLabel = "";
    allAudioInputDevices = allAudioInputDevices.filter((device) => device.deviceId !== previousDeviceId);
    audioInputDevices = audioInputDevices.filter((device) => device.deviceId !== previousDeviceId);
    try {
      localStorage.removeItem("mirante-voice-input");
      localStorage.removeItem("mirante-voice-input-label");
    } catch (error) { reportClientError("voice_input_device_persist_error", error); }
    if (previousDeviceId) persistPreferredInputDeviceId(null);
    return Boolean(previousDeviceId);
  }
  // Restaure as escolhas antes de qualquer tentativa de entrar em uma sala.
  // Antes, elas só eram carregadas ao abrir Configurações, então o app recém-
  // aberto usava os dispositivos padrão até o usuário visitar essa tela.
  let selectedInputDeviceId = readStoredVoiceDeviceId("mirante-voice-input");
  let selectedInputDeviceLabel = readStoredVoiceDeviceLabel("mirante-voice-input-label");
  let selectedOutputDeviceId = readStoredVoiceDeviceId("mirante-voice-output");
  function voicePreferenceTargetId(participantOrId) {
    const participant = participantOrId && typeof participantOrId === "object"
      ? participantOrId
      : voiceParticipants.get(participantOrId);
    return String(participant?.userId || participant?.id || participantOrId || "").trim();
  }

  function scheduleVoiceUserPreferencePersistence(targetUserId) {
    if (!user?.id || !targetUserId || targetUserId === user.id) return;
    const currentTimer = voicePreferencePersistTimers.get(targetUserId);
    if (currentTimer) window.clearTimeout(currentTimer);
    const timer = window.setTimeout(() => {
      voicePreferencePersistTimers.delete(targetUserId);
      api("/api/auth/voice-preferences", {
        method: "PATCH",
        body: JSON.stringify({
          targetUserId,
          volume: voiceVolumes.get(targetUserId) ?? 1,
          locallyMuted: voiceLocallyMutedParticipants.has(targetUserId),
        }),
      }).catch((error) => reportClientError("voice_user_preference_persist_error", error, { targetUserId }));
    }, 250);
    voicePreferencePersistTimers = new Map(voicePreferencePersistTimers).set(targetUserId, timer);
  }
  // O servidor é a fonte por conta; estes valores mantêm um estado audível
  // enquanto as preferências autenticadas ainda estão sendo carregadas.
  let voiceMicrophoneVolume = 1;
  let voiceOutputVolume = 1;
  let audioVolumePersistTimer = null;
  let voiceNoiseMode = ["native", "off"].includes(localStorage.getItem("mirante-voice-noise-mode"))
    ? localStorage.getItem("mirante-voice-noise-mode")
    : "native";
  // Mantém as instâncias de processamento para atualizar ganho e liberar
  // corretamente os recursos de cada microfone/teste.
  let voiceNoiseSuppressionStatus = "idle";
  let voiceNativeProcessingDetails = {
    echoCancellation: null,
    noiseSuppression: null,
    autoGainControl: null,
    sampleRate: null,
    channelCount: null,
  };
  let voiceInputProfile = ["isolation", "studio", "custom"].includes(localStorage.getItem("mirante-voice-profile"))
    ? localStorage.getItem("mirante-voice-profile")
    : "isolation";
  let voiceSensitivityAuto = localStorage.getItem("mirante-voice-sensitivity-auto") !== "false";
  const storedVoiceSensitivity = localStorage.getItem("mirante-voice-sensitivity");
  let voiceSensitivity = storedVoiceSensitivity === null ? 0.5 : normalizeAudioVolume(Number(storedVoiceSensitivity) / 100, 0.5);
  let voiceAdvancedOpen = localStorage.getItem("mirante-voice-advanced-open") === "true";
  let voiceAdvancedOptions = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mirante-voice-advanced") || "null");
      return {
        echoCancellation: saved?.echoCancellation !== false,
        noiseSuppression: saved?.noiseSuppression !== false,
        autoGainControl: saved?.autoGainControl !== false,
      };
    } catch {
      return { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    }
  })();
  const voiceInputPipeline = createVoiceInputPipeline({
    getAudioContext: () => window.AudioContext || window.webkitAudioContext,
    shouldProcess: () => shouldProcessVoiceInput(),
    getMicrophoneVolume: () => voiceMicrophoneVolume,
    onNativeProcessingDetails: (details) => { voiceNativeProcessingDetails = details; },
    onNoiseSuppressionStatus: (status) => { voiceNoiseSuppressionStatus = status; },
    onProcessingError: (error) => reportClientError("voice_input_volume_processing_error", error, { profile: voiceInputProfile }),
  });
  const voiceCaptureService = createVoiceCaptureService({
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia({ audio: constraints, video: false }),
    getAudioConstraints: () => voiceAudioConstraints(),
    getSelectedInputDeviceId: () => selectedInputDeviceId,
    getSelectionRevision: () => voiceInputSelectionRevision,
    rememberCapturedInputDevice: (track, requestedDeviceId) => rememberCapturedInputDevice(track, requestedDeviceId),
    processVoiceInputStream: (stream) => processVoiceInputStream(stream),
    stopVoiceInputStream: (stream) => stopVoiceInputStream(stream),
    isUnavailableVoiceInputError: (error) => isUnavailableVoiceInputError(error),
    clearUnavailableInputDevice: (deviceId) => clearUnavailableInputDevice(deviceId),
    onFallbackStream: (stream) => voiceInputFallbackStreams.add(stream),
  });
  const voiceTrackSyncService = createVoiceTrackSyncService({
    getLocalStream: () => voiceLocalStream,
    getMuteState: () => voiceMuted || voiceServerMuted,
    getPeers: () => voicePeerConnections,
    negotiationInFlight: voicePeerNegotiationInFlight,
    sendVoiceSignal: (message) => sendVoice(message),
    reportDiagnostic: (kind, error, context) => reportClientError(kind, error, context),
    bindLocalTrack: (track) => bindVoiceLocalTrack(track),
  });
  let voiceDevicesBusy = false;
  let voiceDevicesError = "";
  let voiceTestStream = null;
  let voiceTestContext = null;
  let voiceTestAnalyser = null;
  let voiceTestSource = null;
  let voiceTestTimer = null;
  let voiceTestRunning = false;
  let voiceTestLevel = 0;
  let voiceTestPeak = 0;
  let voiceTestError = "";
  let voiceTestStatus = "Clique em testar para verificar seu microfone.";
  let voiceTestSpeakerStatus = "";
  let isDesktop = false;
  let desktopPushToTalkGlobal = false;
  let desktopPushToTalkUnsubscribe = null;
  let desktopMuteShortcutGlobal = false;
  let desktopMuteShortcutUnsubscribe = null;
  let desktopTrayUnsubscribe = null;
  let desktopVersion = APP_VERSION;
  let desktopUpdate = { status: "idle", version: "", percent: 0, message: "" };
  let showReleaseNotes = false;
  let releaseNotes = null;
  let hardwareAccelerationMode = "auto";
  let hardwareAccelerationBusy = false;
  let hardwareAccelerationError = "";

  $: if (isDesktop && window.miranteDesktop?.setTrayStatus) {
    const broadcasting = broadcastState === "live" || broadcastState === "starting";
    window.miranteDesktop.setTrayStatus({
      connected: Boolean(user),
      live: broadcasting,
      sharing: broadcasting && (broadcastSourceType === "screen" || Boolean(broadcastDisplayStream)),
      camera: broadcasting && (broadcastSourceType === "camera" || Boolean(broadcastCameraStream)),
      voice: voiceState === "connected" || voiceState === "connecting",
      muted: voiceState === "connected" && (voiceMuted || voiceServerMuted),
      deafened: voiceState === "connected" && voiceDeafened,
    });
  }
  let launchAtLogin = true;
  let launchAtLoginBusy = false;
  let launchAtLoginError = "";
  let showGroupDialog = false;
  let showGroupPicker = false;
  let showUserMenu = false;
  let showAboutInAccountMenu = false;
  let groupContextMenu = null;
  let roomContextMenu = null;
  let showMobileChannels = false;
  let showMobileMembers = false;
  let groupNavigationCollapsed = false;
  let groupName = "";
  let showRoomDialog = false;
  let roomName = "";
  let roomKind = "text";
  let roomMaxParticipants = 8;
  let roomDialogMode = "create";
  let editingRoomId = "";
  let settingsTab = "user";
  let settingsSection = "profile";
  let settingsPageElement;
  let settingsReturnView = "home";
  let settingsBusy = false;
  let settingsError = "";
  let preferencesResetConfirm = false;
  let preferencesResetBusy = false;
  let settingsDisplayName = "";
  let settingsAvatarData = "";
  let avatarError = "";
  let avatarFileInput;
  let channelDisplayName = "";
  let channelAvatarData = "";
  let channelGames = [];
  let channelError = "";
  let channelAvatarFileInput;
  let groupSettingsName = "";
  let groupRoles = [];
  let selectedRoleId = "";
  let roleEditId = "";
  let roleEditName = "";
  let roleEditColor = "#5865f2";
  let roleEditBusy = false;
  let roleOrderSaving = false;
  let draggedRoleId = "";
  let dragOverRoleId = "";
  let roleMemberSearchQuery = "";
  let roleMemberActionId = "";
  let groupInvites = [];
  let newRoleName = "";
  let newRoleColor = "#5865f2";
  let groupInviteLink = "";
  let groupInviteBusyId = "";
  let groupAdminError = "";
  const rolePermissionOptions = [
    { key: "canChat", category: "Texto", label: "Conversar", description: "Enviar mensagens e conversar nas salas." },
    { key: "canInvite", category: "Geral", label: "Convidar", description: "Adicionar pessoas ao grupo." },
    { key: "canStream", category: "Voz e vídeo", label: "Transmitir", description: "Iniciar transmissões ao vivo." },
    { key: "canViewVoiceMembers", category: "Voz e vídeo", label: "Ver voz", description: "Ver participantes das salas." },
    { key: "canMoveMembers", category: "Voz e vídeo", label: "Moderar voz", description: "Mover e silenciar participantes." },
  ];
  let showInviteDialog = false;
  let showGroupSearchDialog = false;
  let showLeaveGroupDialog = false;
  let leaveGroupBusy = false;
  let leaveGroupError = "";
  let showDeleteGroupDialog = false;
  let showDeleteRoomDialog = false;
  let deleteRoomTarget = null;
  let deleteRoomBusy = false;
  let deleteRoomError = "";
  let deleteGroupBusy = false;
  let deleteGroupError = "";
  let inviteSearchQuery = "";
  let inviteSearchResults = [];
  let inviteSearchBusy = false;
  let inviteSearchError = "";
  let inviteActionId = "";
  let groupInviteCreating = false;
  let groupSearchQuery = "";
  let groupSearchResults = [];
  let groupSearchBusy = false;
  let groupSearchError = "";
  let groupJoinRequests = [];
  let groupJoinActionId = "";
  let pendingInviteToken = "";
  let pendingGroupRouteId = "";
  let pendingRoomRouteId = "";
  let notifications = [];
  let notificationUnreadCount = 0;
  let hideReadNotifications = false;
  let notificationHideReadPreferenceUserId = "";
  let notificationSoundInitialized = false;
  let knownNotificationIds = new Set();
  let notificationsLoading = false;
  let notificationsError = "";
  let streamsRefreshInFlight = false;
  let notificationsRefreshInFlight = false;
  let groupOverviewRefreshInFlight = false;
  let groupPresenceRefreshInFlight = false;
  let maintenanceRefreshInFlight = false;
  let directConversations = [];
  let directConversationId = "";
  let directConversationTarget = null;
  let directMessages = [];
  let directMessageDraft = "";
  let directConversationLoading = false;
  let directConversationSending = false;
  let directConversationError = "";
  let directConversationsRefreshInFlight = false;
  let directConversationRefreshInFlight = false;
  let directConversationRefreshQueued = false;
  let directConversationRefreshId = "";
  let social = { friends: [], incomingRequests: [], outgoingRequests: [], following: [], counts: { friends: 0, incomingRequests: 0, following: 0 } };
  let socialSearchQuery = "";
  let socialSearchOpen = false;
  let socialRequestsOpen = false;
  let socialSearchResults = [];
  let socialSearchBusy = false;
  let socialError = "";
  let socialActionId = "";
  let socialRefreshInFlight = false;
  let groupLoadSequence = 0;
  let groupOverviewRetryAt = 0;
  const pendingGroupOverviewRequests = new Map();
  const maxAvatarFileBytes = 5 * 1024 * 1024;
  const gameOptions = ["League of Legends", "Valorant", "Minecraft", "Fortnite", "Roblox", "GTA V", "CS2", "Outro"];
  const visualDefaults = {
    dark: { button: "#5b5fea", input: "#0d1728", background: "#070b16" },
    light: { button: "#4256d6", input: "#ffffff", background: "#f7f8fc" },
  };

  $: selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  $: normalizedGroupPickerQuery = groupPickerQuery.trim().toLocaleLowerCase();
  $: groupPickerGroups = groups.filter((group) => {
    if (!normalizedGroupPickerQuery) return true;
    return `${group.name || ""} ${group.slug || ""}`.toLocaleLowerCase().includes(normalizedGroupPickerQuery);
  });
  $: displayPickerAvailability = {
    screen: displaySources.some((source) => source.kind === "screen"),
    window: displaySources.some((source) => !["screen", "tab", "browser-tab"].includes(source.kind)),
    tab: displaySources.some((source) => ["tab", "browser-tab"].includes(source.kind)),
  };
  $: displaySourceGroups = [
    { id: "screen", icon: "computerScreen", label: "Telas inteiras", description: "Compartilha tudo que aparece em um monitor.", sources: displaySources.filter((source) => source.kind === "screen") },
    { id: "window", icon: "appWindow", label: broadcastSelectionKind === "app" ? "Aplicativos" : "Janelas de aplicativos", description: broadcastSelectionKind === "app" ? "Compartilha somente o aplicativo escolhido." : "Compartilha somente uma janela específica.", sources: displaySources.filter((source) => !["screen", "tab", "browser-tab"].includes(source.kind)) },
  ].filter((group) => displaySourceFilter === "all" || group.id === displaySourceFilter).filter((group) => group.sources.length);
  $: broadcastAudioSourceCandidates = broadcastAudioSources.filter((source) => source?.kind === "window" && source?.processId && !/(discord|telai|mirante)/i.test(`${source.processName || ""} ${source.name || ""}`));
  $: rooms = groupOverview?.rooms || [];
  $: textRooms = rooms.filter((room) => room.kind === "text");
  $: voiceRooms = rooms.filter((room) => room.kind === "voice");
  $: if (!showRoomDialog && roomDialogMode === "edit") {
    roomDialogMode = "create";
    editingRoomId = "";
  }
  $: groupLiveStreams = groupOverview?.streams || [];
  $: selectedRoomLiveStreams = selectedRoom?.kind === "voice"
    ? groupLiveStreams.filter((stream) => stream.visibility === "private" && stream.voiceRoomId === selectedRoom.id)
    : [];
  $: selectedRoomLiveStream = selectedRoomLiveStreams[0] || null;
  $: watchedSelectedRoomLive = selectedRoomLiveStreams.find((stream) => stream.id === watchingGroupLiveStreamId && stream.createdBy !== user?.id) || null;
  $: watchingSelectedRoomLive = Boolean(watchedSelectedRoomLive);
  $: activeVoiceRoom = voiceRooms.find((room) => room.id === voiceRoomId) || null;
  $: selectedRoom = rooms.find((room) => room.id === selectedRoomId) || rooms[0] || null;
  $: selectedRoomRemoteVoice = Boolean(
    selectedRoom?.kind === "voice" &&
    voiceState === "idle" &&
    (selectedRoom.participants || []).some((participant) => participant.userId === user?.id),
  );
  $: groupMembers = groupOverview?.members || [];
  $: voiceLobbyParticipants = selectedRoom?.kind === "voice" ? visibleVoiceParticipants(selectedRoom) : [];
  $: homeLiveStreams = streams.filter((stream) => stream.visibility === "public").slice(0, 3);
  $: homeCommunityGroups = groups.slice(0, 4);
  $: selectedRole = groupRoles.find((role) => role.id === selectedRoleId) || groupRoles[0] || null;
  $: if (groupRoles.length && !groupRoles.some((role) => role.id === selectedRoleId)) selectedRoleId = groupRoles[0].id;
  $: if (selectedRole && selectedRole.id !== roleEditId) {
    roleEditId = selectedRole.id;
    roleEditName = selectedRole.name;
    roleEditColor = selectedRole.color;
  }
  $: currentGroupMember = groupMembers.find((member) => member.id === user?.id) || null;
  $: normalizedRoleMemberSearch = roleMemberSearchQuery.trim().toLocaleLowerCase();
  $: filteredRoleMembers = groupMembers
    .filter((member) => member.role !== "owner")
    .filter((member) => {
      if (!normalizedRoleMemberSearch) return true;
      return `${member.displayName || ""} ${member.username || ""}`.toLocaleLowerCase().includes(normalizedRoleMemberSearch.replace(/^@/, ""));
    });
  $: activeGroupInvites = groupInvites.filter((invite) => new Date(invite.expiresAt) > new Date() && invite.uses < invite.maxUses);
  $: canMoveVoiceMembers = selectedGroup?.role === "owner" || Boolean(currentGroupMember?.canMoveMembers);
  $: memberRoleGroups = (() => {
    const groupsByRole = new Map();
    for (const member of groupMembers) {
      const isOwner = member.role === "owner";
      const key = isOwner ? "owner" : member.roleId || member.roleName || "default";
      const current = groupsByRole.get(key) || { roleId: isOwner ? "" : member.roleId || "", name: isOwner ? "Dono" : member.roleName || "Membro", color: isOwner ? "#62d994" : member.roleColor || "#5865f2", sortOrder: isOwner ? -1 : member.roleSortOrder ?? Number.MAX_SAFE_INTEGER, members: [] };
      current.members.push(member);
      groupsByRole.set(key, current);
    }
    const roleOrder = new Map(groupRoles.map((role, index) => [role.id, role.sortOrder ?? index]));
    return [...groupsByRole.values()].sort((left, right) => {
      const leftOrder = left.name === "Dono" ? -1 : roleOrder.get(left.roleId) ?? left.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.name === "Dono" ? -1 : roleOrder.get(right.roleId) ?? right.sortOrder ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.name.localeCompare(right.name, "pt-BR");
    });
  })();
  $: isDark = theme === "dark";
  $: visibleNotifications = hideReadNotifications ? notifications.filter((notification) => notification.unread) : notifications;
  $: readNotificationCount = notifications.filter((notification) => !notification.unread).length;
  $: unreadDirectNotification = notifications.find((notification) => notification.unread && notification.type === "direct_message" && notification.directConversationId) || null;
  $: visualStyle = `--mirante-button-color:${buttonColor};--mirante-input-background:${inputBackgroundColor};--mirante-background:${backgroundColor};`;
  $: roomMessages = (groupOverview?.messages || []).filter((message) => !selectedRoom || !message.roomId || message.roomId === selectedRoom.id);
  $: if (notice) {
    const noticeAtDisplay = notice;
    setTimeout(() => { if (notice === noticeAtDisplay) notice = ""; }, 5000);
  }

  const qualityProfiles = {
    economy: { label: "Econômica", width: 960, height: 540, maxFramerate: 30, maxBitrate: 1_200_000 },
    balanced: { label: "Equilibrada", width: 1280, height: 720, maxFramerate: 30, maxBitrate: 2_500_000 },
    high: { label: "Alta", width: 1920, height: 1080, maxFramerate: 60, maxBitrate: 6_000_000 },
  };

  const api = createApiClient({ reportError: reportClientError });
  const notificationController = createNotificationController({
    api,
    getUser: () => user,
    getState: () => ({
      hideReadNotifications,
      knownNotificationIds,
      notificationHideReadPreferenceUserId,
      notificationSoundInitialized,
      notificationUnreadCount,
      notifications,
      notificationsError,
      notificationsLoading,
      notificationsRefreshInFlight,
    }),
    setState: (next) => {
      if ("hideReadNotifications" in next) hideReadNotifications = next.hideReadNotifications;
      if ("knownNotificationIds" in next) knownNotificationIds = next.knownNotificationIds;
      if ("notificationHideReadPreferenceUserId" in next) notificationHideReadPreferenceUserId = next.notificationHideReadPreferenceUserId;
      if ("notificationSoundInitialized" in next) notificationSoundInitialized = next.notificationSoundInitialized;
      if ("notificationUnreadCount" in next) notificationUnreadCount = next.notificationUnreadCount;
      if ("notifications" in next) notifications = next.notifications;
      if ("notificationsError" in next) notificationsError = next.notificationsError;
      if ("notificationsLoading" in next) notificationsLoading = next.notificationsLoading;
      if ("notificationsRefreshInFlight" in next) notificationsRefreshInFlight = next.notificationsRefreshInFlight;
    },
    playVoiceSound: (kind) => playVoiceSound(kind),
  });
  const {
    loadNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    setHideReadNotifications,
    syncNotificationHideReadPreference,
  } = notificationController;
  let directControllerPromise = null;
  function getDirectController() {
    if (!directControllerPromise) {
      directControllerPromise = import("./features/direct/controller.js").then(({ createDirectController }) => createDirectController({
        api,
        tick,
        getUser: () => user,
        getView: () => view,
        getState: () => ({
          directConversationError,
          directConversationId,
          directConversationLoading,
          directConversationRefreshId,
          directConversationRefreshInFlight,
          directConversationRefreshQueued,
          directConversationSending,
          directConversationTarget,
          directConversations,
          directConversationsRefreshInFlight,
          directMessageDraft,
          directMessages,
        }),
        setState: (next) => {
          if ("directConversationError" in next) directConversationError = next.directConversationError;
          if ("directConversationId" in next) directConversationId = next.directConversationId;
          if ("directConversationLoading" in next) directConversationLoading = next.directConversationLoading;
          if ("directConversationRefreshId" in next) directConversationRefreshId = next.directConversationRefreshId;
          if ("directConversationRefreshInFlight" in next) directConversationRefreshInFlight = next.directConversationRefreshInFlight;
          if ("directConversationRefreshQueued" in next) directConversationRefreshQueued = next.directConversationRefreshQueued;
          if ("directConversationSending" in next) directConversationSending = next.directConversationSending;
          if ("directConversationTarget" in next) directConversationTarget = next.directConversationTarget;
          if ("directConversations" in next) directConversations = next.directConversations;
          if ("directConversationsRefreshInFlight" in next) directConversationsRefreshInFlight = next.directConversationsRefreshInFlight;
          if ("directMessageDraft" in next) directMessageDraft = next.directMessageDraft;
          if ("directMessages" in next) directMessages = next.directMessages;
          if ("view" in next) view = next.view;
        },
        loadNotifications,
        closeVoiceContextMenu: () => closeVoiceContextMenu(),
        setNotice: (message) => { notice = message; },
      }));
    }
    return directControllerPromise;
  }
  async function loadDirectConversationMessages(...args) { return (await getDirectController()).loadDirectConversationMessages(...args); }
  async function loadDirectConversations(...args) { return (await getDirectController()).loadDirectConversations(...args); }
  async function openDirectConversationById(...args) { return (await getDirectController()).openDirectConversationById(...args); }
  async function openDirectConversationWithUser(...args) { return (await getDirectController()).openDirectConversationWithUser(...args); }
  async function sendDirectMessage(...args) { return (await getDirectController()).sendDirectMessage(...args); }
  function handleDirectMessageKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  let groupControllerPromise = null;
  function getGroupController() {
    if (!groupControllerPromise) {
      groupControllerPromise = import("./features/groups/controller.js").then(({ createGroupController }) => createGroupController({
        api,
        getState: () => ({
          broadcastState,
          groupLoadSequence,
          groupLoading,
          groupOverview,
          groupOverviewRefreshInFlight,
          groupOverviewRetryAt,
          groupPresenceRefreshInFlight,
          groups,
          knownGroupMessageIds,
          pendingGroupOverviewRequests,
          selectedGroupId,
          selectedRoomId,
          showGroupPicker,
          user,
          watchingGroupLiveStreamId,
        }),
        setState: (next) => {
          if ("groupLoadSequence" in next) groupLoadSequence = next.groupLoadSequence;
          if ("groupLoading" in next) groupLoading = next.groupLoading;
          if ("groupOverview" in next) groupOverview = next.groupOverview;
          if ("groupOverviewRefreshInFlight" in next) groupOverviewRefreshInFlight = next.groupOverviewRefreshInFlight;
          if ("groupOverviewRetryAt" in next) groupOverviewRetryAt = next.groupOverviewRetryAt;
          if ("groupPresenceRefreshInFlight" in next) groupPresenceRefreshInFlight = next.groupPresenceRefreshInFlight;
          if ("groups" in next) groups = next.groups;
          if ("knownGroupMessageIds" in next) knownGroupMessageIds = next.knownGroupMessageIds;
          if ("selectedGroupId" in next) selectedGroupId = next.selectedGroupId;
          if ("selectedRoomId" in next) selectedRoomId = next.selectedRoomId;
          if ("showGroupPicker" in next) showGroupPicker = next.showGroupPicker;
          if ("watchingGroupLiveStreamId" in next) watchingGroupLiveStreamId = next.watchingGroupLiveStreamId;
        },
        mergeActiveVoicePresence,
        shouldKeepGroupMessagesAtBottom,
        scrollGroupMessagesToBottom,
        playVoiceSound,
        setNotice: (message) => { notice = message; },
      }));
    }
    return groupControllerPromise;
  }
  async function loadGroups(...args) { return (await getGroupController()).loadGroups(...args); }
  async function loadGroup(...args) { return (await getGroupController()).loadGroup(...args); }

  let settingsControllerPromise = null;
  function getSettingsController() {
    if (!settingsControllerPromise) {
      settingsControllerPromise = import("./features/settings/controller.js").then(({ createSettingsController }) => createSettingsController({
        api,
        qualityProfiles,
        visualDefaults,
        VoicePreferenceMap,
        normalizeAudioVolume,
        readStoredVoiceDeviceId,
        loadStreams,
        syncDesktopShortcuts,
        reapplyVoiceInputSettings,
        resetVoiceActivityCalibration,
        effectiveVoiceOutputVolume,
        voicePreferenceTargetId,
        soundPreferenceDefaults,
        reportClientError,
        getState: () => ({
          theme,
          selectedQuality,
          audioMode,
          selectedInputDeviceId,
          selectedInputDeviceLabel,
          selectedOutputDeviceId,
          voiceMicrophoneVolume,
          voiceOutputVolume,
          liveNotificationScope,
          liveNotificationScopes,
          pushToTalkKey,
          pushToTalkEnabled,
          muteShortcut,
          buttonColor,
          inputBackgroundColor,
          backgroundColor,
          channelDisplayName,
          channelAvatarData,
          channelGames,
          settingsDisplayName,
          settingsAvatarData,
          settingsBusy,
          settingsError,
          preferencesResetBusy,
          preferencesResetConfirm,
          user,
          notice,
          voiceVolumes,
          voiceLocallyMutedParticipants,
          voiceRemoteAudio,
          voiceDeafened,
          voiceNoiseMode,
          voiceInputProfile,
          voiceSensitivityAuto,
          voiceSensitivity,
          voiceAdvancedOpen,
          voiceAdvancedOptions,
          soundPreferences,
          voiceSoundEffects,
        }),
        setState: (next) => {
          const setters = {
            theme: (value) => { theme = value; },
            selectedQuality: (value) => { selectedQuality = value; },
            audioMode: (value) => { audioMode = value; },
            selectedInputDeviceId: (value) => { selectedInputDeviceId = value; },
            selectedInputDeviceLabel: (value) => { selectedInputDeviceLabel = value; },
            selectedOutputDeviceId: (value) => { selectedOutputDeviceId = value; },
            voiceMicrophoneVolume: (value) => { voiceMicrophoneVolume = value; },
            voiceOutputVolume: (value) => { voiceOutputVolume = value; },
            liveNotificationScope: (value) => { liveNotificationScope = value; },
            liveNotificationScopes: (value) => { liveNotificationScopes = value; },
            pushToTalkKey: (value) => { pushToTalkKey = value; },
            pushToTalkEnabled: (value) => { pushToTalkEnabled = value; },
            muteShortcut: (value) => { muteShortcut = value; },
            buttonColor: (value) => { buttonColor = value; },
            inputBackgroundColor: (value) => { inputBackgroundColor = value; },
            backgroundColor: (value) => { backgroundColor = value; },
            channelDisplayName: (value) => { channelDisplayName = value; },
            channelAvatarData: (value) => { channelAvatarData = value; },
            channelGames: (value) => { channelGames = value; },
            settingsDisplayName: (value) => { settingsDisplayName = value; },
            settingsAvatarData: (value) => { settingsAvatarData = value; },
            settingsBusy: (value) => { settingsBusy = value; },
            settingsError: (value) => { settingsError = value; },
            channelError: (value) => { channelError = value; },
            preferencesResetBusy: (value) => { preferencesResetBusy = value; },
            preferencesResetConfirm: (value) => { preferencesResetConfirm = value; },
            user: (value) => { user = value; },
            notice: (value) => { notice = value; },
            voiceVolumes: (value) => { voiceVolumes = value; },
            voiceLocallyMutedParticipants: (value) => { voiceLocallyMutedParticipants = value; },
            voiceNoiseMode: (value) => { voiceNoiseMode = value; },
            voiceInputProfile: (value) => { voiceInputProfile = value; },
            voiceSensitivityAuto: (value) => { voiceSensitivityAuto = value; },
            voiceSensitivity: (value) => { voiceSensitivity = value; },
            voiceAdvancedOpen: (value) => { voiceAdvancedOpen = value; },
            voiceAdvancedOptions: (value) => { voiceAdvancedOptions = value; },
            soundPreferences: (value) => { soundPreferences = value; },
            voiceSoundEffects: (value) => { voiceSoundEffects = value; },
          };
          Object.entries(next).forEach(([key, value]) => setters[key]?.(value));
        },
      }));
    }
    return settingsControllerPromise;
  }
  async function loadPreferences(...args) { return (await getSettingsController()).loadPreferences(...args); }
  async function loadVoiceUserPreferences(...args) { return (await getSettingsController()).loadVoiceUserPreferences(...args); }
  async function saveChannelProfile(...args) { return (await getSettingsController()).saveChannelProfile(...args); }
  async function saveProfile(...args) { return (await getSettingsController()).saveProfile(...args); }
  async function savePreferences(...args) { return (await getSettingsController()).savePreferences(...args); }
  async function resetPreferencesToDefaults(...args) { return (await getSettingsController()).resetPreferencesToDefaults(...args); }

  function shouldKeepGroupMessagesAtBottom(list) {
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight <= 96;
  }

  async function scrollGroupMessagesToBottom({ force = false } = {}) {
    await tick();
    const list = document.querySelector(".chat-workspace .message-list");
    if (!list || (!force && !shouldKeepGroupMessagesAtBottom(list))) return;
    list.scrollTop = list.scrollHeight;
  }

  async function refreshGroupOverview(...args) { return (await getGroupController()).refreshGroupOverview(...args); }
  async function refreshGroupPresence(...args) { return (await getGroupController()).refreshGroupPresence(...args); }

  async function loadStreams() {
    if (streamsRefreshInFlight) return;
    streamsRefreshInFlight = true;
    try {
      const result = await api(`/api/streams${followingOnly ? "?following=1" : ""}`);
      streams = result.streams || [];
      selectedStreams = new Set([...selectedStreams].filter((id) => streams.some((stream) => stream.id === id)));
    } finally {
      streamsRefreshInFlight = false;
    }
  }

  async function loadSocial() {
    if (socialRefreshInFlight) return;
    socialRefreshInFlight = true;
    try {
      social = await api("/api/social");
    } finally {
      socialRefreshInFlight = false;
    }
  }

  async function searchSocialUsers() {
    if (socialSearchBusy) return;
    const query = socialSearchQuery.trim();
    socialError = "";
    if (query.length < 2) {
      socialSearchResults = [];
      if (query) socialError = "Digite pelo menos 2 caracteres para pesquisar.";
      return;
    }
    socialSearchBusy = true;
    try {
      const result = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
      socialSearchResults = result.users || [];
      if (!socialSearchResults.length) socialError = "Nenhuma pessoa encontrada.";
    } catch (error) {
      socialError = error.message;
    } finally {
      socialSearchBusy = false;
    }
  }

  async function sendFriendRequest(target) {
    if (!target?.id || socialActionId) return;
    socialActionId = target.id;
    socialError = "";
    let sent = false;
    try {
      await api(`/api/friends/${encodeURIComponent(target.id)}`, { method: "POST" });
      socialSearchResults = socialSearchResults.map((item) => item.id === target.id ? { ...item, friendshipStatus: "pending_sent" } : item);
      await loadSocial();
      notice = `Solicitação enviada para ${target.displayName}.`;
      sent = true;
    } catch (error) {
      socialError = error.message;
      notice = error.message;
    } finally {
      socialActionId = "";
    }
    return sent;
  }

  async function sendFriendRequestFromContext(target) {
    const friendTarget = {
      id: target?.userId || target?.id,
      displayName: target?.displayName || target?.username || "esta pessoa",
    };
    if (!friendTarget.id || friendTarget.id === user?.id) return;
    if (await sendFriendRequest(friendTarget)) closeVoiceContextMenu();
  }

  async function respondToFriendRequest(request, action) {
    if (!request?.id || socialActionId) return;
    socialActionId = request.id;
    socialError = "";
    try {
      await api(`/api/friends/requests/${encodeURIComponent(request.id)}/${action}`, { method: "POST" });
      await loadSocial();
      notice = action === "accept" ? `${request.displayName} agora está na sua lista de amigos.` : "Solicitação recusada.";
    } catch (error) {
      socialError = error.message;
    } finally {
      socialActionId = "";
    }
  }

  async function cancelFriendRequest(request) {
    if (!request?.id || socialActionId) return;
    socialActionId = request.id;
    socialError = "";
    try {
      await api(`/api/friends/requests/${encodeURIComponent(request.id)}`, { method: "DELETE" });
      await loadSocial();
    } catch (error) {
      socialError = error.message;
    } finally {
      socialActionId = "";
    }
  }

  async function removeFriend(friend) {
    if (!friend?.id || socialActionId) return;
    socialActionId = friend.id;
    socialError = "";
    try {
      await api(`/api/friends/${encodeURIComponent(friend.id)}`, { method: "DELETE" });
      await loadSocial();
      notice = `${friend.displayName} foi removido dos seus amigos.`;
    } catch (error) {
      socialError = error.message;
    } finally {
      socialActionId = "";
    }
  }

  async function toggleFollowUser(target) {
    if (!target?.id || socialActionId) return;
    socialActionId = `follow:${target.id}`;
    socialError = "";
    const nextFollowing = !target.following;
    try {
      await api(`/api/users/${encodeURIComponent(target.id)}/follow`, { method: nextFollowing ? "POST" : "DELETE" });
      socialSearchResults = socialSearchResults.map((item) => item.id === target.id ? { ...item, following: nextFollowing } : item);
      await loadSocial();
      notice = nextFollowing ? `Você está seguindo ${target.displayName}.` : `Você deixou de seguir ${target.displayName}.`;
    } catch (error) {
      socialError = error.message;
    } finally {
      socialActionId = "";
    }
  }

  async function toggleFollowStream(stream) {
    if (!stream?.id || stream.channelUsername === user?.username || socialActionId) return;
    socialActionId = `stream-follow:${stream.id}`;
    socialError = "";
    const nextFollowing = !Boolean(stream.following);
    try {
      await api(`/api/streams/${encodeURIComponent(stream.id)}/follow`, { method: nextFollowing ? "POST" : "DELETE" });
      streams = streams.map((item) => item.id === stream.id ? { ...item, following: nextFollowing } : item);
      await loadSocial();
      notice = nextFollowing ? `Você está seguindo ${stream.channelName}.` : `Você deixou de seguir ${stream.channelName}.`;
    } catch (error) {
      socialError = error.message;
    } finally {
      socialActionId = "";
    }
  }

  async function refresh() {
    try {
      await Promise.all([loadGroups(), loadStreams(), loadPreferences(), loadVoiceUserPreferences(), loadNotifications(), loadDirectConversations(), loadSocial()]);
    } catch (error) {
      notice = error.message;
    }
  }

  function maintenanceWasReloaded(id) {
    if (!id) return false;
    try { return sessionStorage.getItem(`telai-maintenance-reloaded:${id}`) === "1"; } catch { return false; }
  }

  function updateMaintenanceCountdown() {
    if (!maintenanceNotice) {
      maintenanceRemainingSeconds = 0;
      return;
    }
    const startsAt = Date.parse(maintenanceNotice.startsAt);
    if (!Number.isFinite(startsAt)) {
      maintenanceNotice = null;
      maintenanceRemainingSeconds = 0;
      return;
    }
    if (maintenanceWasReloaded(maintenanceNotice.id) && startsAt <= Date.now()) {
      maintenanceNotice = null;
      maintenanceRemainingSeconds = 0;
      return;
    }
    maintenanceRemainingSeconds = Math.max(0, Math.ceil((startsAt - Date.now()) / 1000));
    if (maintenanceRemainingSeconds > 0 || maintenanceReloadKey === maintenanceNotice.id) return;
    const storageKey = `telai-maintenance-reloaded:${maintenanceNotice.id}`;
    let alreadyReloaded = false;
    try { alreadyReloaded = sessionStorage.getItem(storageKey) === "1"; } catch {}
    if (alreadyReloaded) {
      maintenanceReloadKey = maintenanceNotice.id;
      maintenanceNotice = null;
      maintenanceRemainingSeconds = 0;
      return;
    }
    try { sessionStorage.setItem(storageKey, "1"); } catch {}
    maintenanceReloadKey = maintenanceNotice.id;
    window.setTimeout(() => window.location.reload(), 500);
  }

  async function loadMaintenance() {
    if (maintenanceRefreshInFlight) return;
    maintenanceRefreshInFlight = true;
    try {
      const response = await fetch("/api/maintenance", { cache: "no-store" });
      if (!response.ok) {
        maintenanceNotice = null;
        maintenanceRemainingSeconds = 0;
        return;
      }
      const body = await response.json().catch(() => ({}));
      const nextNotice = body.notice || null;
      maintenanceNotice = nextNotice && maintenanceWasReloaded(nextNotice.id) && Date.parse(nextNotice.startsAt) <= Date.now()
        ? null
        : nextNotice;
      if (!maintenanceNotice) maintenanceReloadKey = "";
      updateMaintenanceCountdown();
    } catch {
      maintenanceNotice = null;
      maintenanceRemainingSeconds = 0;
      maintenanceReloadKey = "";
    } finally {
      maintenanceRefreshInFlight = false;
    }
  }

  async function openNotifications() {
    view = "notifications";
    await loadNotifications();
  }

  async function openDirectNotification(notification) {
    await markNotificationRead(notification);
    if (notification?.directConversationId) void openDirectConversationById(notification.directConversationId);
  }

  async function reviewNotification(notification) {
    if (["friend_request", "friend_accepted"].includes(notification?.type)) {
      await markNotificationRead(notification);
      await loadSocial();
      view = "friends";
      return;
    }
    if (!notification?.groupId) return;
    await markNotificationRead(notification);
    selectedGroupId = notification.groupId;
    if (notification.type === "group_join_decision" && notification.joinRequestStatus === "approved") {
      await loadGroups();
    }
    await loadGroup(notification.groupId);
    if (notification.type === "group_join_request") await openSettings("group", "groups");
    else setGroupsView();
  }

  const VOICE_RECONNECT_STORAGE_KEY = "mirante-voice-reconnect";
  const VOICE_RECONNECT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  function readVoiceReconnectSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(VOICE_RECONNECT_STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object" || !saved.groupId || !saved.voiceRoomId) return null;
      const savedAt = Number(saved.savedAt || 0);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > VOICE_RECONNECT_MAX_AGE_MS) {
        localStorage.removeItem(VOICE_RECONNECT_STORAGE_KEY);
        return null;
      }
      return {
        groupId: String(saved.groupId).slice(0, 64),
        voiceRoomId: String(saved.voiceRoomId).slice(0, 64),
        groupName: String(saved.groupName || "grupo").slice(0, 80),
        roomName: String(saved.roomName || "sala de voz").slice(0, 80),
        savedAt,
      };
    } catch {
      localStorage.removeItem(VOICE_RECONNECT_STORAGE_KEY);
      return null;
    }
  }

  function writeVoiceReconnectSession(session, { show = true } = {}) {
    if (!session?.groupId || !session.voiceRoomId) return;
    const next = {
      groupId: String(session.groupId).slice(0, 64),
      voiceRoomId: String(session.voiceRoomId).slice(0, 64),
      groupName: String(session.groupName || "grupo").slice(0, 80),
      roomName: String(session.roomName || "sala de voz").slice(0, 80),
      savedAt: Date.now(),
    };
    voiceReconnectSession = next;
    voiceReconnectVisible = show;
    try { localStorage.setItem(VOICE_RECONNECT_STORAGE_KEY, JSON.stringify(next)); } catch (error) { reportClientError("voice_reconnect_persist_error", error); }
  }

  function clearVoiceReconnectSession() {
    voiceReconnectSession = null;
    voiceReconnectVisible = false;
    if (voiceReconnectTimer) window.clearTimeout(voiceReconnectTimer);
    voiceReconnectTimer = null;
    try { localStorage.removeItem(VOICE_RECONNECT_STORAGE_KEY); } catch (error) { reportClientError("voice_reconnect_clear_error", error); }
  }

  function isOwnPublicStream(stream) {
    if (!stream || typeof stream === "string") return false;
    const currentUserId = user?.id == null ? "" : String(user.id);
    const streamOwnerId = stream.createdBy == null ? "" : String(stream.createdBy);
    if (currentUserId && streamOwnerId && currentUserId === streamOwnerId) return true;
    const currentUsername = String(user?.username || "").trim().toLowerCase();
    const streamUsername = String(stream.channelUsername || "").trim().toLowerCase();
    return Boolean(currentUsername && streamUsername && currentUsername === streamUsername);
  }

  function openStreamViewer(streamOrPath) {
    if (isOwnPublicStream(streamOrPath)) {
      void returnToBroadcast();
      return;
    }
    const streamPath = typeof streamOrPath === "string"
      ? streamOrPath
      : streamOrPath?.publicPath || streamViewerUrl(streamOrPath);
    if (!streamPath) return;
    isViewer = false;
    viewerRoomId = "";
    viewerStreamPath = streamPath;
    viewerStream = typeof streamOrPath === "string" ? null : streamOrPath;
    const nextUrl = new URL(streamPath, window.location.origin);
    window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    view = "viewer";
  }

  async function openStreamNotification(notification) {
    if (!notification?.streamPath) return;
    await markNotificationRead(notification);
    if (notification?.streamPath) openStreamViewer(notification.streamPath);
  }

  function setLiveNotificationScope(scope, enabled) {
    const next = new Set(liveNotificationScopes);
    if (enabled) next.add(scope);
    else next.delete(scope);
    // Pelo menos um escopo precisa continuar ativo para evitar uma
    // configuração que pareça salva, mas silencie todos os avisos.
    if (!next.size) next.add("related");
    liveNotificationScopes = ["related", "all"].filter((item) => next.has(item));
    liveNotificationScope = liveNotificationScopes.includes("all") ? "all" : "related";
  }

  async function createGroup() {
    if (groupName.trim().length < 2) return;
    try {
      const result = await api("/api/groups", { method: "POST", body: JSON.stringify({ name: groupName.trim() }) });
      showGroupDialog = false;
      groupName = "";
      await loadGroups();
      selectedGroupId = result.group.id;
      await loadGroup(result.group.id);
      setGroupsView();
      notice = "Grupo criado.";
    } catch (error) { notice = error.message; }
  }

  function openCreateRoomDialog(kind = "text") {
    roomDialogMode = "create";
    editingRoomId = "";
    roomName = "";
    roomKind = kind;
    roomMaxParticipants = 8;
    showRoomDialog = true;
  }

  async function openPendingChannelRoute() {
    if (!user || isViewer || !pendingGroupRouteId) return;
    const groupId = pendingGroupRouteId;
    try {
      if (selectedGroupId !== groupId || groupOverview?.group?.id !== groupId) await loadGroup(groupId);
      const room = rooms.find((candidate) => candidate.id === pendingRoomRouteId && ["text", "voice"].includes(candidate.kind));
      if (room) {
        selectedRoomId = room.id;
        setGroupsView();
      }
      pendingGroupRouteId = "";
      pendingRoomRouteId = "";
    } catch {}
  }

  async function createRoom() {
    if (!selectedGroupId || roomName.trim().length < 2) return;
    const editing = roomDialogMode === "edit" && Boolean(editingRoomId);
    try {
      if (editing) {
        await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/rooms/${encodeURIComponent(editingRoomId)}`, {
          method: "PATCH",
          body: JSON.stringify({ name: roomName.trim(), ...(roomKind === "voice" ? { maxParticipants: Number(roomMaxParticipants) } : {}) }),
        });
      } else {
        await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/rooms`, {
          method: "POST",
          body: JSON.stringify({ name: roomName.trim(), kind: roomKind, ...(roomKind === "voice" ? { maxParticipants: Number(roomMaxParticipants) } : {}) }),
        });
      }
      showRoomDialog = false;
      roomName = "";
      editingRoomId = "";
      roomDialogMode = "create";
      await loadGroup(selectedGroupId);
      notice = editing ? "Canal atualizado." : "Sala criada.";
    } catch (error) { notice = error.message; }
  }

  function toggleStream(id) {
    const next = new Set(selectedStreams);
    if (next.has(id)) next.delete(id);
    else if (next.size < 4) next.add(id);
    selectedStreams = next;
  }

  function handleStreamCardClick(event, stream) {
    if (event.target?.closest?.("button, input, a, select, textarea")) return;
    toggleStream(stream.id);
  }

  function handleStreamCardKeydown(event, stream) {
    if (event.target?.closest?.("button, input, a, select, textarea")) return;
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    toggleStream(stream.id);
  }

  function openMultistream() {
    if (selectedStreams.size < 2) return;
    multistreamOpen = true;
    view = "multistream";
  }

  function closeMultistream() {
    multistreamOpen = false;
    view = "live";
  }

  function streamViewerUrl(stream, embed = false) {
    const path = stream?.publicPath || `/?room=${encodeURIComponent(stream?.roomName || "")}&mode=viewer`;
    if (!embed) return path;
    return `${path}${path.includes("?") ? "&" : "?"}embed=1`;
  }

  function randomRoom() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function openSettings(tab = "user", returnView = view) {
    // Settings owns the full content area. Close the compact global navigation
    // first so its scrim cannot remain above the settings category navigation.
    showGlobalSidebar = false;
    settingsTab = tab;
    settingsSection = tab === "group" ? "group" : "profile";
    settingsReturnView = returnView;
    settingsError = "";
    settingsDisplayName = user?.displayName || "";
    settingsAvatarData = user?.avatarData || "";
    avatarError = "";
    channelDisplayName = user?.displayName || "";
    channelAvatarData = "";
    channelGames = [];
    channelError = "";
    groupSettingsName = selectedGroup?.name || "";
    groupRoles = [];
    groupInvites = [];
    groupInviteLink = "";
    groupAdminError = "";
    draggedRoleId = "";
    dragOverRoleId = "";
    roleOrderSaving = false;
    selectedInputDeviceId ||= readStoredVoiceDeviceId("mirante-voice-input");
    selectedInputDeviceLabel ||= readStoredVoiceDeviceLabel("mirante-voice-input-label");
    selectedOutputDeviceId ||= readStoredVoiceDeviceId("mirante-voice-output");
    voiceDevicesError = "";
    view = "settings";
    try {
      const result = await api("/api/auth/channel");
      channelDisplayName = result.channel?.displayName || user?.displayName || "";
      channelAvatarData = result.channel?.avatarData || "";
      channelGames = result.channel?.games || [];
    } catch (error) { channelError = error.message; }
    if (tab === "group" && selectedGroupId) await loadGroupAdministration();
    // A enumeração de áudio não deve bloquear a abertura das configurações.
    void loadAudioDevices(false).catch((error) => {
      voiceDevicesError = error.message || "Não foi possível carregar os dispositivos de áudio.";
    });
  }

  async function loadAudioDevices(requestPermission = false) {
    if (!navigator.mediaDevices?.enumerateDevices) {
      voiceDevicesError = "Este navegador não permite escolher dispositivos de áudio.";
      return;
    }
    const requestRevision = ++audioDevicesRequestRevision;
    const requestedInputDeviceId = selectedInputDeviceId;
    voiceDevicesBusy = true;
    voiceDevicesError = "";
    let permissionStream;
    try {
      if (requestPermission) {
        const permissionAudio = selectedVoiceAudioConstraints();
        try {
          permissionStream = await navigator.mediaDevices.getUserMedia({ audio: permissionAudio, video: false });
        } catch (error) {
          // Um deviceId pode mudar depois de reiniciar o Windows/Electron. Nesse
          // caso, peça permissão sem fixar o ID apenas para conseguir enumerar
          // os dispositivos atuais; a captura da sala continua estrita em
          // captureVoiceInputStream e nunca faz fallback silencioso.
          const canRefreshWithDefault = Boolean(selectedInputDeviceId)
            && ["NotFoundError", "OverconstrainedError"].includes(error?.name);
          if (!canRefreshWithDefault) throw error;
          reportClientError("voice_device_permission_refresh", error, { requestedDeviceId: selectedInputDeviceId });
          permissionStream = await navigator.mediaDevices.getUserMedia({ audio: voiceAudioConstraints(), video: false });
        }
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (requestRevision !== audioDevicesRequestRevision) return;
      allAudioInputDevices = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          // MediaDeviceInfo expõe seus campos via getters do Web IDL. O
          // spread (...device) não copia esses getters em navegadores reais,
          // deixando deviceId como undefined e o <option> com value="".
          deviceId: String(device.deviceId || ""),
          kind: device.kind,
          groupId: String(device.groupId || ""),
          rawLabel: String(device.label || "").replace(/\s+/g, " ").trim(),
          label: audioDeviceDisplayLabel(device, index, "input"),
        }));
      audioInputDevices = allAudioInputDevices;
      cameraInputDevices = devices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: String(device.deviceId || ""),
          kind: device.kind,
          groupId: String(device.groupId || ""),
          label: audioDeviceDisplayLabel(device, index, "camera"),
        }));
      audioOutputDevices = devices
        .filter((device) => device.kind === "audiooutput")
        .map((device, index) => ({
          // Preserve the same identifiers for output devices (used by
          // setSinkId); spreading MediaDeviceInfo loses them for the same
          // reason as above.
          deviceId: String(device.deviceId || ""),
          kind: device.kind,
          groupId: String(device.groupId || ""),
          label: audioDeviceDisplayLabel(device, index, "output"),
        }));
      // O Windows/Electron pode entregar um novo deviceId depois de reiniciar
      // o app. O rótulo do dispositivo é a segunda chave para recuperar a
      // escolha sem voltar silenciosamente para o microfone padrão.
      if (selectedInputDeviceId) {
        const selectedDevice = allAudioInputDevices.find((device) => device.deviceId === selectedInputDeviceId);
        const matchingDevice = selectedDevice || (selectedInputDeviceLabel
          ? allAudioInputDevices.find((device) => normalizeAudioDeviceLabel(rawAudioDeviceLabel(device)) === normalizeAudioDeviceLabel(selectedInputDeviceLabel))
          : null);
        if (matchingDevice) {
          selectedInputDeviceId = matchingDevice.deviceId;
          const currentLabel = rawAudioDeviceLabel(matchingDevice);
          if (currentLabel) selectedInputDeviceLabel = currentLabel;
          try {
            localStorage.setItem("mirante-voice-input", selectedInputDeviceId);
            if (currentLabel) localStorage.setItem("mirante-voice-input-label", currentLabel);
          } catch {}
          // O ID pode ter mudado após uma atualização do Windows/driver.
          // Atualize também a preferência remota para o próximo login não
          // restaurar o identificador antigo.
          if (selectedInputDeviceId !== requestedInputDeviceId) persistPreferredInputDeviceId(selectedInputDeviceId);
        }
      }
      // Se o ID antigo não apareceu e não foi possível remapear pelo rótulo,
      // descarte-o. A captura da sala usará o microfone padrão do sistema.
      if (selectedInputDeviceId && !allAudioInputDevices.some((device) => device.deviceId === selectedInputDeviceId)) {
        clearUnavailableInputDevice(selectedInputDeviceId);
      }
      // Se o Windows trocou o deviceId, confirme a nova captura com o ID
      // remapeado. Sem essa segunda captura, a tela podia mostrar o aparelho
      // correto enquanto a permissão ainda permanecia ligada ao ID antigo.
      if (requestPermission && selectedInputDeviceId && selectedInputDeviceId !== requestedInputDeviceId) {
        try {
          const remappedPermissionStream = await navigator.mediaDevices.getUserMedia({ audio: selectedVoiceAudioConstraints(), video: false });
          remappedPermissionStream?.getTracks?.().forEach((track) => track.stop());
        } catch (error) {
          reportClientError("voice_device_remapped_capture", error, { requestedDeviceId: selectedInputDeviceId });
        }
      }
    } catch (error) {
      voiceDevicesError = error.name === "NotAllowedError" ? "Permita o microfone para listar seus dispositivos." : "Não foi possível listar os dispositivos de áudio.";
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
      if (requestRevision === audioDevicesRequestRevision) voiceDevicesBusy = false;
    }
  }

  function voiceAudioConstraints() {
    return createVoiceAudioConstraints(voiceInputProfile, voiceAdvancedOptions);
  }

  function selectedVoiceAudioConstraints() {
    return createSelectedVoiceAudioConstraints(voiceInputProfile, voiceAdvancedOptions, selectedInputDeviceId);
  }

  function rememberCapturedInputDevice(track, requestedDeviceId = selectedInputDeviceId) {
    const actualDeviceId = String(track?.getSettings?.().deviceId || "").trim();
    if (requestedDeviceId && actualDeviceId && actualDeviceId !== requestedDeviceId) {
      const error = new Error("O navegador entregou um microfone diferente do selecionado.");
      error.name = "SelectedDeviceMismatchError";
      error.requestedDeviceId = requestedDeviceId;
      error.actualDeviceId = actualDeviceId;
      throw error;
    }
    if (requestedDeviceId) {
      const matchingDevice = allAudioInputDevices.find((device) => device.deviceId === (actualDeviceId || requestedDeviceId));
      const actualLabel = rawAudioDeviceLabel(matchingDevice) || String(track?.label || "").replace(/\s+/g, " ").trim();
      if (actualLabel) {
        selectedInputDeviceLabel = actualLabel;
        try { localStorage.setItem("mirante-voice-input-label", actualLabel); } catch {}
      }
    }
    return { actualDeviceId, actualLabel: String(track?.label || "").replace(/\s+/g, " ").trim() };
  }

  function voiceInputStreamMatchesSelectedDevice(stream, requestedDeviceId = selectedInputDeviceId) {
    if (!requestedDeviceId) return true;
    const remembered = voiceInputDeviceByStream.get(stream);
    const sourceTrack = voiceInputPipeline.getResource(stream)?.rawStream?.getAudioTracks?.()[0] || stream?.getAudioTracks?.()[0];
    const actualDeviceId = remembered?.actualDeviceId || String(sourceTrack?.getSettings?.().deviceId || "").trim();
    return !actualDeviceId || actualDeviceId === requestedDeviceId;
  }

  function shouldProcessVoiceInput() {
    return voiceInputProfile === "isolation" || (voiceInputProfile === "custom" && voiceAdvancedOptions.noiseSuppression);
  }

  async function processVoiceInputStream(rawStream) {
    return voiceInputPipeline.process(rawStream);
  }

  function stopVoiceInputStream(stream) {
    voiceInputPipeline.stop(stream);
  }

  function updateVoiceMicrophoneGain(stream = voiceLocalStream) {
    return voiceInputPipeline.updateGain(stream, voiceMicrophoneVolume);
  }

  async function setVoiceMicrophoneVolume(value) {
    voiceMicrophoneVolume = normalizeAudioVolume(Number(value) / 100);
    try { localStorage.setItem("mirante-voice-microphone-volume", String(voiceMicrophoneVolume)); } catch (error) { reportClientError("voice_microphone_volume_persist_error", error); }
    scheduleAudioVolumePersistence();
    // O teste de áudio e a transmissão podem ter seus próprios ganhos
    // gerenciados. Eles não podem encerrar a atualização antes de aplicar o
    // mesmo valor na faixa da sala: enquanto o teste estava ativo, o código
    // anterior atualizava apenas voiceTestStream e deixava voiceLocalStream
    // bruto sendo enviado aos participantes.
    const updatedLocalGain = updateVoiceMicrophoneGain(voiceLocalStream);
    updateVoiceMicrophoneGain(voiceTestStream);
    updateVoiceMicrophoneGain(broadcastMicrophoneStream);
    if (updatedLocalGain || !voiceLocalStream || voiceInputRecoveryInFlight) return;
    try {
      const previousStream = voiceLocalStream;
      const nextStream = await processVoiceInputStream(previousStream);
      if (nextStream === previousStream) return;
      voiceLocalStream = nextStream;
      const nextTrack = nextStream.getAudioTracks()[0];
      nextTrack.enabled = !(voiceMuted || voiceServerMuted);
      bindVoiceLocalTrack(nextTrack);
      await syncVoiceLocalTrackToPeers();
      const resource = voiceInputPipeline.getResource(nextStream);
      if (resource) resource.rawStream = null;
      previousStream.getTracks().forEach((track) => track.stop());
      clearVoiceActivityAnalyzer(voiceClientId);
      void attachVoiceActivityStream(voiceClientId, voiceLocalStream);
      ensureVoiceActivityTimer();
    } catch (error) {
      reportClientError("voice_microphone_volume_apply_error", error, { voiceState });
    }
  }

  async function captureVoiceInputStream({ expectedDeviceId = selectedInputDeviceId, selectionRevision = voiceInputSelectionRevision, fallbackToDefault = true } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não permite acessar o microfone.");
    const captured = await voiceCaptureService.capture({ expectedDeviceId, selectionRevision, fallbackToDefault });
    voiceInputDeviceByStream.set(captured.stream, captured.device);
    return captured.stream;
  }

  function bindVoiceLocalTrack(track) {
    if (!track || voiceBoundInputTracks.has(track)) return;
    voiceBoundInputTracks.add(track);
    track.addEventListener("ended", () => {
      if (voiceLocalStream?.getAudioTracks?.()[0] !== track) return;
      if (!["connected", "connecting"].includes(voiceState)) return;
      void recoverVoiceInputTrack("track_ended");
    }, { once: true });
  }

  async function negotiateVoicePeer(participantId, peer, reason = "audio_track_added") {
    return voiceTrackSyncService.negotiate(participantId, peer, reason);
  }

  async function syncVoiceLocalTrackToPeers({ negotiateMissing = true } = {}) {
    return voiceTrackSyncService.sync({ negotiateMissing });
  }

  async function recoverVoiceInputTrack(reason = "track_unavailable") {
    if (voiceInputRecoveryInFlight || !["connected", "connecting"].includes(voiceState)) return false;
    voiceInputRecoveryInFlight = true;
    const previousStream = voiceLocalStream;
    try {
      const nextStream = await captureVoiceInputStream();
      if (!["connected", "connecting"].includes(voiceState)) {
        nextStream.getTracks().forEach((track) => track.stop());
        return false;
      }
      voiceLocalStream = nextStream;
      const track = nextStream.getAudioTracks()[0];
      const shouldRestoreAfterCaptureFailure = voiceMutedByCaptureFailure || voiceError.startsWith("Você entrou sem microfone");
      if (shouldRestoreAfterCaptureFailure) {
        voiceMuted = false;
        voiceMutedByCaptureFailure = false;
      }
      track.enabled = !(voiceMuted || voiceServerMuted);
      bindVoiceLocalTrack(track);
      await syncVoiceLocalTrackToPeers();
      stopVoiceInputStream(previousStream);
      clearVoiceActivityAnalyzer(voiceClientId);
      void attachVoiceActivityStream(voiceClientId, voiceLocalStream);
      ensureVoiceActivityTimer();
      if (shouldRestoreAfterCaptureFailure) {
        const local = voiceParticipants.get(voiceClientId);
        if (local) {
          const updated = { ...local, muted: voiceMuted || voiceServerMuted, serverMuted: voiceServerMuted };
          voiceParticipants = new Map(voiceParticipants).set(voiceClientId, updated);
          upsertVoiceRoomParticipant(voiceRoomId, updated);
        }
        sendVoice({ type: "voice-mute-state", muted: voiceMuted });
        voiceError = "";
      }
      reportClientError("voice_input_track_recovered", new Error("A captura do microfone foi recuperada automaticamente."), { reason, deviceSelected: Boolean(selectedInputDeviceId) });
      return true;
    } catch (error) {
      reportClientError("voice_input_track_recovery_error", error, { reason, deviceSelected: Boolean(selectedInputDeviceId) });
      voiceError = error.name === "NotAllowedError" ? "Permita o microfone para continuar falando." : "O microfone ficou indisponível. Verifique o dispositivo de entrada.";
      return false;
    } finally {
      voiceInputRecoveryInFlight = false;
    }
  }

  async function reapplyVoiceInputSettings() {
    if (voiceTestRunning) {
      stopVoiceTest();
      await startVoiceTest();
    }
    if (voiceState === "connected") await applyVoiceInputDevice(selectedInputDeviceId);
  }

  async function applyVoiceInputProfile(nextProfile) {
    voiceInputProfile = ["isolation", "studio", "custom"].includes(nextProfile) ? nextProfile : "isolation";
    localStorage.setItem("mirante-voice-profile", voiceInputProfile);
    voiceNoiseMode = voiceInputProfile === "studio" ? "off" : "native";
    localStorage.setItem("mirante-voice-noise-mode", voiceNoiseMode);
    voiceNoiseSuppressionStatus = shouldProcessVoiceInput() ? "idle" : "off";
    await reapplyVoiceInputSettings();
  }

  function resetVoiceActivityCalibration() {
    const calibrationUntil = Date.now() + VOICE_ACTIVITY_CALIBRATION_MS;
    for (const state of voiceAnalyzers.values()) {
      state.calibrationUntil = calibrationUntil;
      state.silentSince = 0;
      state.speaking = false;
      markVoiceParticipantSpeaking(state.participantId, false);
    }
  }

  function updateVoiceSensitivityAuto(event) {
    voiceSensitivityAuto = Boolean(event.currentTarget.checked);
    localStorage.setItem("mirante-voice-sensitivity-auto", String(voiceSensitivityAuto));
    resetVoiceActivityCalibration();
  }

  function updateVoiceSensitivity(event) {
    voiceSensitivity = Math.min(1, Math.max(0, Number(event.currentTarget.value) / 100));
    localStorage.setItem("mirante-voice-sensitivity", String(Math.round(voiceSensitivity * 100)));
    resetVoiceActivityCalibration();
  }

  function toggleVoiceAdvanced(event) {
    voiceAdvancedOpen = Boolean(event.currentTarget.checked);
    localStorage.setItem("mirante-voice-advanced-open", String(voiceAdvancedOpen));
  }

  function updateVoiceAdvancedOption(key, event) {
    if (!Object.hasOwn(voiceAdvancedOptions, key)) return;
    voiceInputProfile = "custom";
    voiceAdvancedOptions = { ...voiceAdvancedOptions, [key]: Boolean(event.currentTarget.checked) };
    localStorage.setItem("mirante-voice-profile", voiceInputProfile);
    localStorage.setItem("mirante-voice-advanced", JSON.stringify(voiceAdvancedOptions));
    voiceNoiseSuppressionStatus = shouldProcessVoiceInput() ? "idle" : "off";
    void reapplyVoiceInputSettings();
  }

  async function applyVoiceNoiseMode(nextMode) {
    voiceInputProfile = "custom";
    voiceAdvancedOptions = { ...voiceAdvancedOptions, noiseSuppression: nextMode !== "off" };
    localStorage.setItem("mirante-voice-profile", voiceInputProfile);
    localStorage.setItem("mirante-voice-advanced", JSON.stringify(voiceAdvancedOptions));
    voiceNoiseSuppressionStatus = shouldProcessVoiceInput() ? "idle" : "off";
    await reapplyVoiceInputSettings();
  }

  function stopVoiceTest({ reset = true } = {}) {
    if (voiceTestTimer) window.clearInterval(voiceTestTimer);
    voiceTestTimer = null;
    try { voiceTestSource?.disconnect(); } catch {}
    try { voiceTestAnalyser?.disconnect(); } catch {}
    voiceTestSource = null;
    voiceTestAnalyser = null;
    stopVoiceInputStream(voiceTestStream);
    voiceTestStream = null;
    if (voiceTestContext && voiceTestContext !== voiceSoundContext) void voiceTestContext.close().catch(() => {});
    voiceTestContext = null;
    voiceTestRunning = false;
    if (reset) {
      voiceTestLevel = 0;
      voiceTestPeak = 0;
      voiceTestStatus = "Clique em testar para verificar seu microfone.";
    }
  }

  function pollVoiceTest() {
    if (!voiceTestAnalyser) return;
    const samples = new Float32Array(voiceTestAnalyser.fftSize);
    voiceTestAnalyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const rms = Math.sqrt(energy / samples.length);
    const level = Math.min(1, Math.max(0, rms * 7));
    voiceTestLevel = Math.round(level * 100);
    voiceTestPeak = Math.max(voiceTestPeak * 0.985, voiceTestLevel);
    voiceTestStatus = voiceTestLevel >= 12 ? "Microfone funcionando — sua voz está sendo capturada." : "Fale normalmente para testar o nível do microfone.";
  }

  async function startVoiceTest() {
    stopVoiceTest({ reset: false });
    voiceTestError = "";
    voiceTestStatus = "Solicitando acesso ao microfone…";
    try {
      voiceTestStream = await captureVoiceInputStream();
      const track = voiceTestStream.getAudioTracks()[0];
      if (!track) throw new Error("Nenhum microfone foi encontrado.");
      voiceTestContext = new (window.AudioContext || window.webkitAudioContext)();
      await voiceTestContext.resume();
      voiceTestSource = voiceTestContext.createMediaStreamSource(voiceTestStream);
      voiceTestAnalyser = voiceTestContext.createAnalyser();
      voiceTestAnalyser.fftSize = 512;
      voiceTestAnalyser.smoothingTimeConstant = 0.2;
      voiceTestSource.connect(voiceTestAnalyser);
      voiceTestRunning = true;
      voiceTestStatus = "Fale normalmente para testar o nível do microfone.";
      voiceTestTimer = window.setInterval(pollVoiceTest, 100);
      track.addEventListener("ended", () => {
        if (voiceTestStream?.getAudioTracks?.()[0] !== track) return;
        stopVoiceTest();
        voiceTestError = "O microfone foi desconectado durante o teste.";
      }, { once: true });
    } catch (error) {
      stopVoiceTest({ reset: false });
      voiceTestError = error.name === "NotAllowedError" ? "Permita o microfone para fazer o teste." : "Não foi possível iniciar o teste do microfone.";
      voiceTestStatus = "Teste não iniciado.";
      reportClientError("voice_test_error", error, { isDesktop, deviceSelected: Boolean(selectedInputDeviceId) });
    }
  }

  async function testVoiceSpeaker() {
    voiceTestSpeakerStatus = "Reproduzindo som de teste…";
    try {
      const context = getVoiceSoundContext();
      if (!context) throw new Error("Saída de áudio indisponível.");
      if (selectedOutputDeviceId && typeof context.setSinkId === "function") await context.setSinkId(selectedOutputDeviceId);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.08 * voiceOutputVolume), now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.38);
      window.setTimeout(() => { voiceTestSpeakerStatus = "Som de teste reproduzido."; }, 450);
    } catch (error) {
      voiceTestSpeakerStatus = "Não foi possível reproduzir o som de teste.";
      reportClientError("voice_speaker_test_error", error, { isDesktop, deviceSelected: Boolean(selectedOutputDeviceId) });
    }
  }

  async function applyVoiceOutputDevice(deviceId = selectedOutputDeviceId) {
    selectedOutputDeviceId = deviceId || "";
    if (selectedOutputDeviceId) localStorage.setItem("mirante-voice-output", selectedOutputDeviceId);
    else localStorage.removeItem("mirante-voice-output");
    if (user) api("/api/auth/preferences", { method: "PATCH", body: JSON.stringify({ preferredOutputDeviceId: selectedOutputDeviceId || null }) }).catch((error) => reportClientError("voice_output_device_server_persist_error", error));
    voiceDevicesError = "";
    for (const [participantId, audio] of voiceRemoteAudio) {
      if (typeof audio.setSinkId !== "function") {
        if (selectedOutputDeviceId) voiceDevicesError = "A saída de áudio personalizada não é compatível neste navegador.";
        continue;
      }
      try { await audio.setSinkId(selectedOutputDeviceId || "default"); }
      catch (error) {
        reportClientError("voice_output_device_fallback", error, { deviceSelected: Boolean(selectedOutputDeviceId) });
        selectedOutputDeviceId = "";
        localStorage.removeItem("mirante-voice-output");
        voiceDevicesError = "A saída escolhida não está disponível; voltamos para a saída padrão.";
        await audio.setSinkId("default").catch(() => {});
      }
      void playVoiceRemoteAudio(participantId, audio).catch(() => {});
    }
  }

  function effectiveVoiceOutputVolume(participantId) {
    const targetUserId = voicePreferenceTargetId(participantId);
    return normalizeAudioVolume((voiceVolumes.get(targetUserId) ?? 1) * voiceOutputVolume);
  }

  function setVoiceOutputVolume(value) {
    voiceOutputVolume = normalizeAudioVolume(Number(value) / 100);
    try { localStorage.setItem("mirante-voice-output-volume", String(voiceOutputVolume)); } catch (error) { reportClientError("voice_output_volume_persist_error", error); }
    scheduleAudioVolumePersistence();
    for (const [participantId, audio] of voiceRemoteAudio) audio.volume = effectiveVoiceOutputVolume(participantId);
  }

  function scheduleAudioVolumePersistence() {
    if (!user) return;
    if (audioVolumePersistTimer) clearTimeout(audioVolumePersistTimer);
    audioVolumePersistTimer = setTimeout(() => {
      audioVolumePersistTimer = null;
      api("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ voiceMicrophoneVolume, voiceOutputVolume }),
      }).catch((error) => reportClientError("voice_volume_server_persist_error", error));
    }, 350);
  }

  async function applyVoiceInputDevice(deviceId = selectedInputDeviceId) {
    selectedInputDeviceId = deviceId || "";
    const selectionRevision = ++voiceInputSelectionRevision;
    const requestedDeviceId = selectedInputDeviceId;
    const selectedDevice = allAudioInputDevices.find((device) => device.deviceId === selectedInputDeviceId);
    selectedInputDeviceLabel = selectedDevice ? rawAudioDeviceLabel(selectedDevice) : selectedInputDeviceLabel;
    try {
      if (selectedInputDeviceId) {
        localStorage.setItem("mirante-voice-input", selectedInputDeviceId);
        if (selectedInputDeviceLabel) localStorage.setItem("mirante-voice-input-label", selectedInputDeviceLabel);
      } else {
        localStorage.removeItem("mirante-voice-input");
        localStorage.removeItem("mirante-voice-input-label");
        selectedInputDeviceLabel = "";
      }
    } catch (error) { reportClientError("voice_input_device_persist_error", error); }
    persistPreferredInputDeviceId(selectedInputDeviceId);
    voiceDevicesError = "";
    if (voiceTestRunning) stopVoiceTest();
    if (voiceState !== "connected") return;
    try {
      // Se a escolha deixou de existir, captureVoiceInputStream tenta uma vez
      // o microfone padrão e limpa a preferência antiga automaticamente.
      const nextStream = await captureVoiceInputStream({ expectedDeviceId: requestedDeviceId, selectionRevision });
      const usedDefaultFallback = voiceInputFallbackStreams.has(nextStream);
      voiceInputFallbackStreams.delete(nextStream);
      if (selectionRevision !== voiceInputSelectionRevision || (requestedDeviceId !== selectedInputDeviceId && !usedDefaultFallback)) {
        stopVoiceInputStream(nextStream);
        return;
      }
      const nextTrack = nextStream.getAudioTracks()[0];
      const previousStream = voiceLocalStream;
      const shouldRestoreAfterCaptureFailure = voiceMutedByCaptureFailure || voiceError.startsWith("Você entrou sem microfone");
      if (shouldRestoreAfterCaptureFailure) {
        voiceMuted = false;
        voiceMutedByCaptureFailure = false;
      }
      nextTrack.enabled = !(voiceMuted || voiceServerMuted);
      voiceLocalStream = nextStream;
      bindVoiceLocalTrack(nextTrack);
      if (!await syncVoiceLocalTrackToPeers()) throw new Error("Não foi possível publicar o microfone escolhido para todos os participantes.");
      stopVoiceInputStream(previousStream);
      clearVoiceActivityAnalyzer(voiceClientId);
      void attachVoiceActivityStream(voiceClientId, voiceLocalStream);
      ensureVoiceActivityTimer();
      if (shouldRestoreAfterCaptureFailure) {
        const local = voiceParticipants.get(voiceClientId);
        if (local) {
          const updated = { ...local, muted: voiceMuted || voiceServerMuted, serverMuted: voiceServerMuted };
          voiceParticipants = new Map(voiceParticipants).set(voiceClientId, updated);
          upsertVoiceRoomParticipant(voiceRoomId, updated);
        }
        sendVoice({ type: "voice-mute-state", muted: voiceMuted });
        voiceError = "";
      }
    } catch (error) {
      if (error?.name === "SelectedDeviceCaptureSupersededError") return;
      reportClientError("voice_input_device_apply_error", error, { deviceSelected: Boolean(selectedInputDeviceId) });
      voiceDevicesError = error.name === "NotAllowedError"
        ? "Permita o microfone para trocar de dispositivo."
        : ["NotFoundError", "OverconstrainedError"].includes(error?.name)
          ? "O microfone escolhido não está disponível. Atualize os dispositivos e tente novamente."
          : error.name === "SelectedDeviceMismatchError"
            ? "O navegador não entregou o microfone escolhido. A seleção foi preservada; atualize os dispositivos e tente novamente."
          : "Não foi possível trocar o microfone.";
    }
  }

  async function loadGroupAdministration() {
    if (!selectedGroupId) return;
    groupAdminError = "";
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/admin`);
      groupRoles = result.roles || [];
      groupInvites = result.invites || [];
      groupJoinRequests = result.joinRequests || [];
    } catch (error) { groupAdminError = error.message; }
  }

  function roleListAfterMove(roleId, targetIndex) {
    const currentIndex = groupRoles.findIndex((role) => role.id === roleId);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= groupRoles.length || currentIndex === targetIndex) return groupRoles;
    const nextRoles = [...groupRoles];
    const [movedRole] = nextRoles.splice(currentIndex, 1);
    nextRoles.splice(targetIndex, 0, movedRole);
    return nextRoles;
  }

  async function saveGroupRoleOrder(nextRoles, previousRoles = groupRoles) {
    if (!selectedGroupId || selectedGroup?.role !== "owner" || roleOrderSaving || nextRoles === previousRoles) return;
    roleOrderSaving = true;
    groupAdminError = "";
    groupRoles = nextRoles;
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/roles/order`, {
        method: "PATCH",
        body: JSON.stringify({ roleIds: nextRoles.map((role) => role.id) }),
      });
      const orderedRoles = result.roles || nextRoles;
      const sortOrders = new Map(orderedRoles.map((role, index) => [role.id, role.sortOrder ?? index]));
      groupRoles = orderedRoles;
      groupOverview = groupOverview ? {
        ...groupOverview,
        members: groupOverview.members.map((member) => ({
          ...member,
          roleSortOrder: member.roleId ? sortOrders.get(member.roleId) ?? member.roleSortOrder : member.roleSortOrder,
        })),
      } : groupOverview;
      notice = "Ordem dos cargos atualizada.";
    } catch (error) {
      groupRoles = previousRoles;
      groupAdminError = error.message;
    } finally {
      roleOrderSaving = false;
    }
  }

  function startRoleDrag(event, roleId) {
    if (selectedGroup?.role !== "owner" || roleOrderSaving) return;
    draggedRoleId = roleId;
    dragOverRoleId = roleId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", roleId);
  }

  function handleRoleDragOver(event, roleId) {
    if (!draggedRoleId || draggedRoleId === roleId || roleOrderSaving) return;
    event.dataTransfer.dropEffect = "move";
    dragOverRoleId = roleId;
  }

  async function dropRole(roleId) {
    const sourceRoleId = draggedRoleId;
    draggedRoleId = "";
    dragOverRoleId = "";
    if (!sourceRoleId || sourceRoleId === roleId || roleOrderSaving) return;
    const targetIndex = groupRoles.findIndex((role) => role.id === roleId);
    const previousRoles = groupRoles;
    await saveGroupRoleOrder(roleListAfterMove(sourceRoleId, targetIndex), previousRoles);
  }

  function endRoleDrag() {
    draggedRoleId = "";
    dragOverRoleId = "";
  }

  async function moveRole(roleId, direction) {
    if (selectedGroup?.role !== "owner" || roleOrderSaving) return;
    const currentIndex = groupRoles.findIndex((role) => role.id === roleId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= groupRoles.length) return;
    const previousRoles = groupRoles;
    await saveGroupRoleOrder(roleListAfterMove(roleId, targetIndex), previousRoles);
  }

  function handleAvatarChange(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    avatarError = "";
    if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type)) {
      avatarError = "Escolha uma imagem PNG, JPG, WEBP ou GIF.";
      event.currentTarget.value = "";
      return;
    }
    if (file.size > maxAvatarFileBytes) {
      avatarError = "A foto precisa ter no máximo 5 MB.";
      event.currentTarget.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { settingsAvatarData = String(reader.result || ""); };
    reader.onerror = () => { avatarError = "Não foi possível ler essa foto."; };
    reader.readAsDataURL(file);
  }

  function clearAvatar() {
    settingsAvatarData = "";
    avatarError = "";
    if (avatarFileInput) avatarFileInput.value = "";
  }

  function handleChannelAvatarChange(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    channelError = "";
    if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type)) {
      channelError = "Escolha uma imagem PNG, JPG, WEBP ou GIF para o canal.";
      event.currentTarget.value = "";
      return;
    }
    if (file.size > maxAvatarFileBytes) {
      channelError = "A foto do canal precisa ter no máximo 5 MB.";
      event.currentTarget.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { channelAvatarData = String(reader.result || ""); };
    reader.onerror = () => { channelError = "Não foi possível ler essa foto do canal."; };
    reader.readAsDataURL(file);
  }

  function clearChannelAvatar() {
    channelAvatarData = "";
    channelError = "";
    if (channelAvatarFileInput) channelAvatarFileInput.value = "";
  }

  function toggleChannelGame(game) {
    channelGames = channelGames.includes(game) ? channelGames.filter((item) => item !== game) : [...channelGames, game].slice(0, 8);
  }

  async function logout() {
    settingsError = "";
    try {
      if (voiceState === "connected") leaveVoiceRoom();
      if (broadcastState === "live" || broadcastState === "starting") await stopBroadcast("logout");
      await api("/api/auth/logout", { method: "POST" });
      user = null;
      groups = [];
      streams = [];
      groupOverview = null;
      selectedGroupId = null;
      selectedRoomId = null;
      view = "home";
      replaceBrowserPath("/login", { preserveQuery: false });
      notice = "Você saiu da sua conta.";
    } catch (error) {
      notice = error.message || "Não foi possível sair agora.";
    }
  }

  async function saveGroupSettings() {
    if (!selectedGroupId || groupSettingsName.trim().length < 2) return;
    settingsBusy = true;
    settingsError = "";
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}`, { method: "PATCH", body: JSON.stringify({ name: groupSettingsName.trim() }) });
      groups = groups.map((group) => group.id === selectedGroupId ? { ...group, name: result.group.name, slug: result.group.slug } : group);
      groupOverview = groupOverview ? { ...groupOverview, group: { ...groupOverview.group, ...result.group } } : groupOverview;
      notice = "Configurações do grupo salvas.";
    } catch (error) { settingsError = error.message; }
    finally { settingsBusy = false; }
  }

  async function createGroupRole() {
    if (!selectedGroupId || newRoleName.trim().length < 2) return;
    groupAdminError = "";
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/roles`, { method: "POST", body: JSON.stringify({ name: newRoleName.trim(), color: newRoleColor }) });
      groupRoles = [...groupRoles, result.role].sort((left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "pt-BR"));
      newRoleName = "";
      notice = "Cargo criado.";
    } catch (error) { groupAdminError = error.message; }
  }

  async function assignMemberRole(member, event) {
    if (!selectedGroupId || member.role === "owner") return;
    const roleId = event.currentTarget.value;
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/members/${encodeURIComponent(member.id)}/role`, { method: "PATCH", body: JSON.stringify({ roleId }) });
      const assignedRole = groupRoles.find((role) => role.id === result.roleId);
      groupOverview = { ...groupOverview, members: groupOverview.members.map((item) => item.id === member.id ? { ...item, roleId: result.roleId, roleName: assignedRole?.name || "Membro", roleColor: assignedRole?.color || "#5865f2", ...Object.fromEntries(rolePermissionOptions.map(({ key }) => [key, Boolean(assignedRole?.[key])] )) } : item) };
      notice = `Cargo de ${member.displayName} atualizado.`;
    } catch (error) { groupAdminError = error.message; }
  }

  async function updateRolePermission(role, permission, event) {
    if (!selectedGroupId || selectedGroup?.role !== "owner") return;
    const nextValue = event.currentTarget.checked;
    const nextPermissions = Object.fromEntries(rolePermissionOptions.map(({ key }) => [key, key === permission ? nextValue : Boolean(role[key])]));
    groupAdminError = "";
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/roles/${encodeURIComponent(role.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: role.name, color: role.color, ...nextPermissions }),
      });
      const updatedRole = result.role;
      groupRoles = groupRoles.map((item) => item.id === role.id ? { ...item, ...updatedRole } : item);
      groupOverview = {
        ...groupOverview,
        members: groupOverview.members.map((member) => member.roleId === role.id ? { ...member, ...updatedRole } : member),
      };
      notice = `Permissão “${rolePermissionOptions.find((item) => item.key === permission)?.label || permission}” do cargo ${role.name} atualizada.`;
    } catch (error) {
      event.currentTarget.checked = Boolean(role[permission]);
      groupAdminError = error.message;
    }
  }

  async function deleteGroupRole(role) {
    if (!selectedGroupId || !role || role.isDefault || selectedGroup?.role !== "owner") return;
    if (!window.confirm(`Excluir o cargo “${role.name}”? Os membros serão movidos para o cargo padrão.`)) return;
    groupAdminError = "";
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/roles/${encodeURIComponent(role.id)}`, { method: "DELETE" });
      const fallbackRole = groupRoles.find((item) => item.id === result.fallbackRoleId) || groupRoles.find((item) => item.isDefault);
      groupRoles = groupRoles.filter((item) => item.id !== role.id);
      selectedRoleId = fallbackRole?.id || "";
      groupOverview = {
        ...groupOverview,
        members: groupOverview.members.map((member) => member.roleId === role.id
          ? {
              ...member,
              roleId: fallbackRole?.id || result.fallbackRoleId,
              roleName: fallbackRole?.name || "Membro",
              roleColor: fallbackRole?.color || "#5865f2",
              ...Object.fromEntries(rolePermissionOptions.map(({ key }) => [key, Boolean(fallbackRole?.[key])])),
            }
          : member),
      };
      notice = `Cargo ${role.name} excluído.`;
    } catch (error) {
      groupAdminError = error.message;
    }
  }

  async function saveGroupRoleDetails() {
    if (!selectedGroupId || !selectedRole || selectedGroup?.role !== "owner" || roleEditName.trim().length < 2 || roleEditBusy) return;
    roleEditBusy = true;
    groupAdminError = "";
    try {
      const permissions = Object.fromEntries(rolePermissionOptions.map(({ key }) => [key, Boolean(selectedRole[key])]));
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/roles/${encodeURIComponent(selectedRole.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: roleEditName.trim(), color: roleEditColor, ...permissions }),
      });
      const updatedRole = result.role;
      groupRoles = groupRoles.map((role) => role.id === updatedRole.id ? { ...role, ...updatedRole } : role);
      groupOverview = {
        ...groupOverview,
        members: groupOverview.members.map((member) => member.roleId === updatedRole.id
          ? { ...member, roleName: updatedRole.name, roleColor: updatedRole.color, ...permissions }
          : member),
      };
      roleEditName = updatedRole.name;
      roleEditColor = updatedRole.color;
      notice = `Cargo ${updatedRole.name} atualizado.`;
    } catch (error) {
      groupAdminError = error.message;
    } finally {
      roleEditBusy = false;
    }
  }

  async function setRoleMember(role, member, checked) {
    if (!selectedGroupId || !role || !member || member.role === "owner" || selectedGroup?.role !== "owner") return;
    if (!checked && role.isDefault) return;
    const defaultRole = groupRoles.find((item) => item.isDefault);
    const roleId = checked ? role.id : defaultRole?.id || "";
    roleMemberActionId = member.id;
    groupAdminError = "";
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/members/${encodeURIComponent(member.id)}/role`, {
        method: "PATCH",
        body: JSON.stringify({ roleId }),
      });
      const assignedRole = groupRoles.find((item) => item.id === result.roleId) || defaultRole;
      groupOverview = {
        ...groupOverview,
        members: groupOverview.members.map((item) => item.id === member.id
          ? {
              ...item,
              roleId: result.roleId,
              roleName: assignedRole?.name || "Membro",
              roleColor: assignedRole?.color || "#5865f2",
              ...Object.fromEntries(rolePermissionOptions.map(({ key }) => [key, Boolean(assignedRole?.[key])])),
            }
          : item),
      };
      notice = checked ? `${member.displayName} entrou no cargo ${role.name}.` : `${member.displayName} voltou para ${assignedRole?.name || "Membro"}.`;
    } catch (error) {
      groupAdminError = error.message;
    } finally {
      roleMemberActionId = "";
    }
  }

  async function createGroupInvite() {
    if (!selectedGroupId || groupInviteCreating) return;
    groupInviteCreating = true;
    groupAdminError = "";
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/invites`, { method: "POST", body: JSON.stringify({ hours: 72, maxUses: 5 }) });
      groupInviteLink = `${window.location.origin}/?invite=${encodeURIComponent(result.token)}`;
      const copied = await copyText(groupInviteLink, "Convite criado e copiado.", "Convite criado. Copie o link manualmente.");
      await loadGroupAdministration();
      if (!copied) notice = "Convite criado. Copie o link manualmente.";
    } catch (error) { groupAdminError = error.message; }
    finally { groupInviteCreating = false; }
  }

  async function copyGroupInvite() {
    if (!groupInviteLink) return;
    await copyText(groupInviteLink, "Convite copiado.", "Não foi possível copiar o convite.");
  }

  async function deleteGroupInvite(invite) {
    if (!selectedGroupId || !invite?.tokenHash || !window.confirm("Revogar este convite? O link deixará de funcionar.")) return;
    groupInviteBusyId = invite.tokenHash;
    groupAdminError = "";
    try {
      await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/invites/${encodeURIComponent(invite.tokenHash)}`, { method: "DELETE" });
      groupInvites = groupInvites.filter((item) => item.tokenHash !== invite.tokenHash);
      notice = "Convite revogado.";
    } catch (error) { groupAdminError = error.message; }
    finally { groupInviteBusyId = ""; }
  }

  function openGroupContextMenu(event, group) {
    event.preventDefault();
    event.stopPropagation();
    closeVoiceContextMenu();
    const width = 244;
    const height = 286;
    groupContextMenu = {
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(event.clientY, Math.max(8, window.innerHeight - height - 8)),
      group,
    };
    void tick().then(() => document.querySelector(".group-context-menu")?.focus());
  }

  function closeGroupContextMenu() {
    groupContextMenu = null;
  }

  function handleGroupContextMenuKeydown(event) {
    if (event.key === "Escape") closeGroupContextMenu();
  }

  function openRoomContextMenu(event, room) {
    if (!room || !["text", "voice"].includes(room.kind)) return;
    event.preventDefault();
    event.stopPropagation();
    closeGroupContextMenu();
    closeVoiceContextMenu();
    const width = 244;
    const height = 238;
    roomContextMenu = {
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(event.clientY, Math.max(8, window.innerHeight - height - 8)),
      room,
    };
    void tick().then(() => document.querySelector(".room-context-menu")?.focus());
  }

  function closeRoomContextMenu() {
    roomContextMenu = null;
  }

  function handleRoomContextMenuKeydown(event) {
    if (event.key === "Escape") closeRoomContextMenu();
  }

  async function copyRoomLink(room) {
    const url = new URL(window.location.origin);
    url.searchParams.set("group", selectedGroupId || "");
    url.searchParams.set("room", room.id);
    await copyText(url.href, "Link do canal copiado.", "Não foi possível copiar o link do canal.");
    closeRoomContextMenu();
  }

  function openRoomForEditing(room) {
    if (!room || selectedGroup?.role !== "owner" || room.slug === "geral") return;
    roomDialogMode = "edit";
    editingRoomId = room.id;
    roomName = room.name;
    roomKind = room.kind;
    roomMaxParticipants = Number(room.maxParticipants) || 8;
    closeRoomContextMenu();
    showRoomDialog = true;
  }

  function deleteGroupRoom(room) {
    if (!room || selectedGroup?.role !== "owner" || room.slug === "geral") return;
    closeRoomContextMenu();
    deleteRoomTarget = room;
    deleteRoomError = "";
    showDeleteRoomDialog = true;
  }

  async function confirmDeleteGroupRoom() {
    const room = deleteRoomTarget;
    if (!room || deleteRoomBusy) return;
    deleteRoomBusy = true;
    deleteRoomError = "";
    try {
      await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/rooms/${encodeURIComponent(room.id)}`, { method: "DELETE" });
      await loadGroup(selectedGroupId);
      notice = `Canal #${room.name} excluído.`;
      showDeleteRoomDialog = false;
      deleteRoomTarget = null;
    } catch (error) {
      deleteRoomError = error.message || "Não foi possível excluir o canal.";
    } finally {
      deleteRoomBusy = false;
    }
  }

  function runRoomContextAction(action) {
    const room = roomContextMenu?.room;
    if (!room) return;
    if (action === "open") {
      closeRoomContextMenu();
      void selectRoom(room.id);
    } else if (action === "read") {
      knownGroupMessageIds = new Set([...knownGroupMessageIds, ...roomMessages.filter((message) => message.roomId === room.id).map((message) => message.id)]);
      closeRoomContextMenu();
      notice = `#${room.name} marcado como lido.`;
    } else if (action === "copy") {
      void copyRoomLink(room);
    } else if (action === "edit") {
      openRoomForEditing(room);
    } else if (action === "delete") {
      void deleteGroupRoom(room);
    }
  }

  async function runGroupContextAction(action) {
    const group = groupContextMenu?.group;
    closeGroupContextMenu();
    if (!group) return;
    if (selectedGroupId !== group.id) await loadGroup(group.id);
    setGroupsView();
    if (action === "open") return;
    if (action === "invite") return openInviteDialog();
    if (action === "invite-link") return createGroupInvite();
    if (action === "settings") return openSettings("group", "groups");
    if (action === "leave") return openLeaveGroupDialog();
    if (action === "delete") return openDeleteGroupDialog();
  }

  function openDeleteGroupDialog() {
    if (!selectedGroupId || selectedGroup?.role !== "owner") return;
    deleteGroupError = "";
    showDeleteGroupDialog = true;
  }

  async function deleteSelectedGroup() {
    if (!selectedGroupId || selectedGroup?.role !== "owner" || deleteGroupBusy) return;
    deleteGroupBusy = true;
    deleteGroupError = "";
    const deletedGroupName = selectedGroup?.name || "o grupo";
    try {
      if (voiceState === "connected" && voiceRoomId && voiceRooms.some((room) => room.id === voiceRoomId)) leaveVoiceRoom({ silent: true });
      await api(`/api/groups/${encodeURIComponent(selectedGroupId)}`, { method: "DELETE" });
      groups = groups.filter((group) => group.id !== selectedGroupId);
      groupOverview = null;
      selectedRoomId = null;
      selectedGroupId = groups[0]?.id || null;
      showDeleteGroupDialog = false;
      if (selectedGroupId) await loadGroup(selectedGroupId);
      else view = "home";
      notice = `${deletedGroupName} foi excluído.`;
    } catch (error) {
      deleteGroupError = error.message || "Não foi possível excluir o grupo agora.";
    } finally {
      deleteGroupBusy = false;
    }
  }

  function openInviteDialog() {
    inviteSearchQuery = "";
    inviteSearchResults = [];
    inviteSearchError = "";
    groupInviteLink = "";
    showInviteDialog = true;
  }

  async function searchUsers() {
    if (inviteSearchBusy) return;
    const query = inviteSearchQuery.trim();
    if (query.length < 2) {
      inviteSearchError = "Digite pelo menos 2 caracteres para pesquisar.";
      inviteSearchResults = [];
      return;
    }
    inviteSearchBusy = true;
    inviteSearchError = "";
    try {
      const result = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
      inviteSearchResults = result.users || [];
      if (!inviteSearchResults.length) inviteSearchError = "Nenhuma conta encontrada.";
    } catch (error) { inviteSearchError = error.message; }
    finally { inviteSearchBusy = false; }
  }

  async function inviteUser(target) {
    if (!selectedGroupId || !target?.id) return;
    inviteActionId = target.id;
    inviteSearchError = "";
    try {
      await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/member-invites`, { method: "POST", body: JSON.stringify({ userId: target.id }) });
      inviteSearchResults = inviteSearchResults.filter((item) => item.id !== target.id);
      notice = `Convite enviado para ${target.displayName}.`;
    } catch (error) { inviteSearchError = error.message; }
    finally { inviteActionId = ""; }
  }

  async function searchGroups() {
    if (groupSearchBusy) return;
    const query = groupSearchQuery.trim();
    groupSearchError = "";
    if (query.length < 2) {
      groupSearchResults = [];
      if (query) groupSearchError = "Digite pelo menos 2 caracteres para pesquisar.";
      return;
    }
    groupSearchBusy = true;
    try {
      const result = await api(`/api/groups/search?q=${encodeURIComponent(query)}`);
      groupSearchResults = result.groups || [];
      if (!groupSearchResults.length) groupSearchError = "Nenhum grupo encontrado.";
    } catch (error) { groupSearchError = error.message; }
    finally { groupSearchBusy = false; }
  }

  function openGroupSearchDialog() {
    groupSearchQuery = "";
    groupSearchResults = [];
    groupSearchError = "";
    showGroupSearchDialog = true;
  }

  async function requestGroupEntry(group) {
    if (!group?.id) return;
    groupJoinActionId = group.id;
    groupSearchError = "";
    try {
      await api(`/api/groups/${encodeURIComponent(group.id)}/join-requests`, { method: "POST" });
      groupSearchResults = groupSearchResults.map((item) => item.id === group.id ? { ...item, requestStatus: "pending" } : item);
      notice = `Solicitação enviada para ${group.name}.`;
    } catch (error) { groupSearchError = error.message; }
    finally { groupJoinActionId = ""; }
  }

  async function respondToGroupJoinRequest(joinRequest, status) {
    if (!selectedGroupId || !joinRequest?.id) return;
    groupJoinActionId = joinRequest.id;
    groupAdminError = "";
    try {
      await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/join-requests/${encodeURIComponent(joinRequest.id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      groupJoinRequests = groupJoinRequests.filter((item) => item.id !== joinRequest.id);
      if (status === "approved") await loadGroup(selectedGroupId);
      notice = status === "approved" ? `${joinRequest.displayName} entrou no grupo.` : "Solicitação recusada.";
    } catch (error) { groupAdminError = error.message; }
    finally { groupJoinActionId = ""; }
  }

  async function respondToInvite(invite, action) {
    const inviteId = invite?.entityId || invite?.id;
    if (!inviteId) return;
    inviteActionId = inviteId;
    try {
      await markNotificationRead(invite);
      await api(`/api/member-invites/${encodeURIComponent(inviteId)}/${action}`, { method: "POST" });
      await loadNotifications();
      if (action === "accept") {
        await loadGroups();
        notice = `Você entrou no grupo ${invite.groupName}.`;
      } else notice = "Convite recusado.";
    } catch (error) { notice = error.message; }
    finally { inviteActionId = ""; }
  }

  async function redeemPendingInvite() {
    if (!pendingInviteToken) return;
    if (!user) {
      notice = "Entre ou crie sua conta para aceitar este convite.";
      return;
    }
    const token = pendingInviteToken;
    try {
      const result = await api(`/api/invites/${encodeURIComponent(token)}/redeem`, { method: "POST" });
      pendingInviteToken = "";
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("invite");
      window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      await loadGroups();
      if (result.groupId) await loadGroup(result.groupId);
      setGroupsView();
      notice = "Você entrou no grupo pelo convite.";
    } catch (error) {
      notice = error.message;
    }
  }

  function sendBroadcast(message) {
    if (broadcastSocket?.readyState === WebSocket.OPEN) broadcastSocket.send(JSON.stringify(message));
  }

  function clearBroadcastCaptureRecoveryTimer() {
    if (broadcastCaptureRecoveryTimer) window.clearTimeout(broadcastCaptureRecoveryTimer);
    broadcastCaptureRecoveryTimer = null;
  }

  function handleBroadcastVideoTrackEnded(track) {
    const isActiveCaptureTrack = track && (
      broadcastStream?.getVideoTracks?.()[0] === track
      || broadcastDisplayStream?.getVideoTracks?.()[0] === track
      || broadcastCameraStream?.getVideoTracks?.()[0] === track
    );
    if (!isActiveCaptureTrack) return;
    const context = { roomId: broadcastRoomId, streamId: broadcastStreamId, sourceType: broadcastSourceType, mediaMode };
    const message = "A captura de vídeo foi encerrada. Troque a janela ou tela para continuar; a live ficará aberta por até 60 segundos.";
    reportClientError("broadcast_video_capture_ended", new Error(message), context);
    if (broadcastState === "starting") {
      void stopBroadcast("capture-ended-before-start");
      return;
    }
    if (broadcastState !== "live" || broadcastCaptureRecoveryTimer) return;
    broadcastAudioWarning = message;
    broadcastCaptureRecoveryTimer = window.setTimeout(() => {
      broadcastCaptureRecoveryTimer = null;
      if (broadcastState === "live" && !hasLiveBroadcastCapture()) void stopBroadcast("capture-timeout");
    }, 60_000);
  }

  function sendBroadcastChatMessage() {
    const body = broadcastChatDraft.trim();
    if (broadcastState !== "live" || !body) return;
    sendBroadcast({ type: "chat-message", body });
    broadcastChatDraft = "";
  }

  function sendVoice(message) {
    if (voiceSocket?.readyState === WebSocket.OPEN) voiceSocket.send(JSON.stringify(message));
  }

  function updateVoiceRoomSnapshot(roomId, updater) {
    if (!roomId || !groupOverview?.rooms?.length) return;
    groupOverview = {
      ...groupOverview,
      rooms: groupOverview.rooms.map((room) => room.id === roomId
        ? { ...room, participants: updater(Array.isArray(room.participants) ? room.participants : []) }
        : room),
    };
  }

  function uniqueVoiceParticipants(participants) {
    const unique = new Map();
    for (const participant of participants || []) {
      if (!participant?.id) continue;
      const key = participant.userId ? `user:${participant.userId}` : `id:${participant.id}`;
      const current = unique.get(key);
      if (!current || (participant.isLocal && !current.isLocal) || (!participant.connecting && current.connecting)) {
        unique.set(key, participant);
      }
    }
    return [...unique.values()];
  }

  function replaceVoiceRoomSnapshot(roomId, participants) {
    updateVoiceRoomSnapshot(roomId, () => uniqueVoiceParticipants(participants));
  }

  function upsertVoiceRoomParticipant(roomId, participant) {
    if (!participant?.id) return;
    updateVoiceRoomSnapshot(roomId, (participants) => uniqueVoiceParticipants([...participants, participant]));
  }

  function removeVoiceRoomParticipant(roomId, participantId, userId = null) {
    updateVoiceRoomSnapshot(roomId, (participants) => participants.filter((participant) => (
      participant.id !== participantId &&
      participant.id !== "local-pending" &&
      (!userId || participant.userId !== userId)
    )));
  }

  function mergeActiveVoicePresence(overview) {
    if (!overview?.rooms?.length || !voiceRoomId || !["connected", "connecting"].includes(voiceState)) return overview;
    return {
      ...overview,
      rooms: overview.rooms.map((room) => {
        if (room.id !== voiceRoomId) return room;
        const participants = (room.participants || []).filter((participant) => participant.userId !== user?.id);
        return { ...room, participants: uniqueVoiceParticipants([...participants, ...voiceParticipants.values()]) };
      }),
    };
  }

  async function loadIceConfiguration() {
    try {
      const response = await fetch("/ice-config", { cache: "no-store" });
      const config = await response.json();
      if (response.ok && Array.isArray(config?.iceServers) && config.iceServers.length) {
        rtcConfig = config;
        rtcConfigLoadedAt = Date.now();
      }
    } catch {
      // A conexão direta continua disponível com o STUN local padrão.
    }
  }

  async function refreshIceConfigurationIfNeeded(force = false) {
    if (!force && rtcConfigLoadedAt && Date.now() - rtcConfigLoadedAt < VOICE_ICE_REFRESH_MS) return;
    await loadIceConfiguration();
  }

  function voiceHasTurnServer() {
    return (rtcConfig?.iceServers || []).some((server) => {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      return urls.some((url) => /^turns?:/i.test(String(url || "")));
    });
  }

  function stopVoicePeerHealthTimer() {
    if (voicePeerHealthTimer) window.clearInterval(voicePeerHealthTimer);
    voicePeerHealthTimer = null;
  }

  function ensureVoicePeerHealthTimer() {
    if (!voicePeerHealthTimer) voicePeerHealthTimer = window.setInterval(checkVoicePeerAudioHealth, VOICE_PEER_HEALTH_POLL_MS);
  }

  async function checkVoicePeerAudioHealth() {
    if (voicePeerHealthInFlight || !voicePeerAudioHealth.size) return;
    voicePeerHealthInFlight = true;
    try {
      const now = Date.now();
      for (const [participantId, peer] of voicePeerConnections) {
        if (["connected", "completed"].includes(peer.connectionState) && !voicePeerAudioHealth.has(participantId)) {
          voicePeerAudioHealth.set(participantId, {
            firstTrackAt: now,
            lastProgressAt: now,
            lastBytes: 0,
            recoveryAttempted: false,
          });
          ensureVoicePeerHealthTimer();
        }
        const health = voicePeerAudioHealth.get(participantId);
        if (!health || health.recoveryAttempted || !["connected", "completed"].includes(peer.connectionState) || typeof peer.getStats !== "function") continue;
        const stats = await peer.getStats();
        let receivedProgress = 0;
        for (const report of stats.values()) {
          if (report.type !== "inbound-rtp" || (report.kind !== "audio" && report.mediaType !== "audio")) continue;
          receivedProgress = Math.max(
            receivedProgress,
            Number(report.bytesReceived || 0),
            Number(report.packetsReceived || 0),
          );
        }
        if (receivedProgress > health.lastBytes) {
          health.lastBytes = receivedProgress;
          health.lastProgressAt = now;
          continue;
        }
        if (now - health.firstTrackAt >= VOICE_PEER_AUDIO_GRACE_MS && now - health.lastProgressAt >= VOICE_PEER_AUDIO_GRACE_MS) {
          health.recoveryAttempted = true;
          voicePeerRelayRecoveryAttempted.add(participantId);
          reportClientError("voice_peer_audio_stalled", new Error("O par de voz conectou, mas não está recebendo áudio."), { participantId, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, forceRelay: voiceHasTurnServer() });
          void recoverVoicePeer(participantId, peer, { forceRelay: voiceHasTurnServer() });
        }
      }
    } catch (error) {
      reportClientError("voice_peer_audio_health_error", error, { voicePeers: voicePeerConnections.size });
    } finally {
      voicePeerHealthInFlight = false;
    }
  }

  function voicePeerShouldInitiate(participantId) {
    if (!voiceClientId || !participantId) return false;
    // Cada par escolhe o iniciador de forma determinística. Assim, a
    // negociação não depende da ordem em que voice-user-joined e voice-joined
    // chegaram quando várias pessoas entram quase ao mesmo tempo.
    return String(voiceClientId) < String(participantId);
  }

  function closeVoicePeer(participantId) {
    const disconnectTimer = voicePeerDisconnectTimers.get(participantId);
    if (disconnectTimer) clearTimeout(disconnectTimer);
    voicePeerDisconnectTimers.delete(participantId);
    const connectionTimer = voicePeerConnectionTimers.get(participantId);
    if (connectionTimer) clearTimeout(connectionTimer);
    voicePeerConnectionTimers.delete(participantId);
    const audioTrackTimer = voicePeerAudioTrackTimers.get(participantId);
    if (audioTrackTimer) clearTimeout(audioTrackTimer);
    voicePeerAudioTrackTimers.delete(participantId);
    voicePeerRecoveryInFlight.delete(participantId);
    voicePeerNegotiationInFlight.delete(participantId);
    const playbackTimer = voiceRemotePlaybackTimers.get(participantId);
    if (playbackTimer) clearTimeout(playbackTimer);
    voiceRemotePlaybackTimers.delete(participantId);
    voicePeerConnections.get(participantId)?.close();
    voicePeerConnections.delete(participantId);
    voicePendingCandidates.delete(participantId);
    voiceSignalQueues.delete(participantId);
    voicePendingSignals.delete(participantId);
    voicePeerAudioHealth.delete(participantId);
    voicePeerRelayRecoveryAttempted.delete(participantId);
    clearVoiceActivityAnalyzer(participantId);
    const remoteStream = voiceRemoteStreams.get(participantId);
    remoteStream?.getTracks?.().forEach((track) => {
      try { remoteStream.removeTrack(track); } catch {}
    });
    voiceRemoteStreams.delete(participantId);
    const audioBinding = voiceRemoteAudioBindings.get(participantId);
    if (audioBinding) {
      for (const [eventName, handler] of Object.entries(audioBinding).filter(([eventName]) => eventName !== "audio")) {
        audioBinding.audio?.removeEventListener(eventName, handler);
      }
    }
    voiceRemoteAudioBindings.delete(participantId);
    const audio = voiceRemoteAudio.get(participantId);
    if (audio) audio.srcObject = null;
    audio?.remove();
    voiceRemoteAudio.delete(participantId);
    if (!voiceRemoteAudio.size) voicePlaybackBlocked = false;
    if (!voicePeerAudioHealth.size) stopVoicePeerHealthTimer();
  }

  function updateVoicePlaybackState() {
    voicePlaybackBlocked = [...voiceRemoteAudio.values()].some((audio) => audio.paused && !audio.ended);
  }

  function scheduleVoiceRemotePlayback(participantId, delayMs = VOICE_REMOTE_PLAYBACK_RETRY_MS) {
    if (voiceDeafened || voiceState !== "connected" || voiceRemotePlaybackTimers.has(participantId)) return;
    const audio = voiceRemoteAudio.get(participantId);
    if (!audio?.srcObject || !audio.paused || audio.ended) return;
    const timer = window.setTimeout(() => {
      voiceRemotePlaybackTimers.delete(participantId);
      const currentAudio = voiceRemoteAudio.get(participantId);
      if (!currentAudio || currentAudio !== audio || voiceDeafened || voiceState !== "connected" || !currentAudio.paused || currentAudio.ended) return;
      void playVoiceRemoteAudio(participantId, currentAudio).catch((error) => {
        if (error?.name !== "NotAllowedError") scheduleVoiceRemotePlayback(participantId);
      });
    }, Math.max(100, delayMs));
    voiceRemotePlaybackTimers.set(participantId, timer);
  }

  function ensureVoiceRemoteAudio(participantId) {
    const current = voiceRemoteAudio.get(participantId);
    if (current) return current;
    const audio = document.createElement("audio");
    audio.className = "voice-remote-audio";
    audio.autoplay = true;
    audio.playsInline = true;
    audio.preload = "auto";
    audio.setAttribute("autoplay", "true");
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("aria-hidden", "true");
    const updatePlayback = () => updateVoicePlaybackState();
    const retryPlayback = () => {
      updateVoicePlaybackState();
      scheduleVoiceRemotePlayback(participantId);
    };
    audio.addEventListener("playing", updatePlayback);
    audio.addEventListener("pause", retryPlayback);
    audio.addEventListener("stalled", retryPlayback);
    audio.addEventListener("waiting", retryPlayback);
    audio.addEventListener("error", retryPlayback);
    voiceRemoteAudioBindings.set(participantId, {
      audio,
      playing: updatePlayback,
      pause: retryPlayback,
      stalled: retryPlayback,
      waiting: retryPlayback,
      error: retryPlayback,
    });
    document.body.appendChild(audio);
    voiceRemoteAudio.set(participantId, audio);
    return audio;
  }

  function ensureVoiceRemoteStream(participantId) {
    const current = voiceRemoteStreams.get(participantId);
    if (current?.getAudioTracks?.().some((track) => track.readyState === "live")) return current;
    const stream = new MediaStream();
    voiceRemoteStreams.set(participantId, stream);
    return stream;
  }

  async function playVoiceRemoteAudio(participantId, audio) {
    if (!audio) return;
    audio.muted = voiceDeafened || voiceLocallyMutedParticipants.has(voicePreferenceTargetId(participantId));
    audio.volume = effectiveVoiceOutputVolume(participantId);
    if (selectedOutputDeviceId && typeof audio.setSinkId === "function") {
      try {
        await audio.setSinkId(selectedOutputDeviceId);
      } catch (error) {
        reportClientError("voice_output_device_fallback", error, { participantId, deviceSelected: true });
        selectedOutputDeviceId = "";
        localStorage.removeItem("mirante-voice-output");
        await audio.setSinkId("default").catch(() => {});
      }
    }
    try {
      await audio.play();
      const playbackTimer = voiceRemotePlaybackTimers.get(participantId);
      if (playbackTimer) clearTimeout(playbackTimer);
      voiceRemotePlaybackTimers.delete(participantId);
      updateVoicePlaybackState();
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        voicePlaybackBlocked = true;
        voiceError = "O navegador bloqueou o áudio automático. Clique em “Ativar áudio da sala”.";
      } else {
        scheduleVoiceRemotePlayback(participantId);
      }
      throw error;
    }
  }

  function resumeVoiceRemoteAudio() {
    if (voiceDeafened) return;
    for (const [participantId, audio] of voiceRemoteAudio) {
      if (!audio.paused) continue;
      void playVoiceRemoteAudio(participantId, audio).catch((error) => {
        reportClientError("voice_remote_audio_play_error", error, { participantId, deviceSelected: Boolean(selectedOutputDeviceId) });
        if (error?.name !== "NotAllowedError") voiceError = "O áudio remoto não conseguiu iniciar. Verifique a saída de áudio selecionada.";
      });
    }
    window.setTimeout(updateVoicePlaybackState, 0);
  }

  function handleVoicePlaybackInteraction() {
    if (voiceRemoteAudio.size) resumeVoiceRemoteAudio();
    if (pendingNotificationSound) {
      const context = getVoiceSoundContext();
      if (context?.resume) {
        void context.resume().then(() => {
          if (pendingNotificationSound && soundEnabled("notification")) {
            pendingNotificationSound = false;
            playVoiceSound("notification");
          } else if (!soundEnabled("notification")) {
            pendingNotificationSound = false;
          }
        }).catch(() => {});
      }
    }
  }

  function syncVoiceParticipantSpeakingState(participantId, speaking) {
    if (!participantId) return;
    const nextSpeaking = Boolean(speaking);
    const participant = voiceParticipants.get(participantId);
    if (participant && participant.speaking !== nextSpeaking) {
      voiceParticipants = new Map(voiceParticipants).set(participantId, { ...participant, speaking: nextSpeaking });
    }
    if (voiceRoomId) {
      updateVoiceRoomSnapshot(voiceRoomId, (participants) => participants.map((item) => (
        item.id === participantId && item.speaking !== nextSpeaking
          ? { ...item, speaking: nextSpeaking }
          : item
      )));
    }
  }

  function markVoiceParticipantSpeaking(participantId, speaking, source = "analyser") {
    if (!participantId) return;
    // A borda não deve usar os dados acumulados do getStats(), que podem
    // chegar atrasados, nem o analisador do áudio reproduzido quando o
    // servidor já fornece o estado autoritativo desse participante.
    if (source === "rtc") return;
    if (source === "analyser" && participantId !== voiceClientId && voiceSpeakingSignalKnownParticipantIds.has(participantId)) return;
    const analyzer = voiceAnalyzers.get(participantId);
    const nextSpeaking = source === "signal" ? Boolean(speaking) : analyzer ? Boolean(analyzer.speaking) : false;
    const changed = speakingVoiceParticipantIds.has(participantId) !== nextSpeaking;
    if (changed) {
      const next = new Set(speakingVoiceParticipantIds);
      if (nextSpeaking) next.add(participantId);
      else next.delete(participantId);
      speakingVoiceParticipantIds = next;
    }
    syncVoiceParticipantSpeakingState(participantId, nextSpeaking);
  }

  function isVoiceParticipantSpeaking(participant) {
    return Boolean(participant?.id && (speakingVoiceParticipantIds.has(participant.id) || participant.speaking === true));
  }

  // O servidor já transmite voice-user-speaking para participantes remotos.
  // O analisador local continua necessário para a própria fala, mas manter
  // um AnalyserNode e um polling de 16 ms por participante remoto duplica o
  // trabalho e pode pressionar o renderer enquanto a janela está na bandeja.
  function detachVoiceActivityAnalyzer(participantId) {
    const analyzer = voiceAnalyzers.get(participantId);
    if (analyzer) {
      analyzer.track?.removeEventListener("ended", analyzer.onEnded);
      try { analyzer.source.disconnect(); } catch {}
      try { analyzer.analyser.disconnect(); } catch {}
      try { analyzer.silentGain.disconnect(); } catch {}
    }
    voiceAnalyzers.delete(participantId);
    voiceAnalyzerPendingIds.delete(participantId);
    voiceAnalyzerTokens.delete(participantId);
    voiceRtcStatSnapshots.delete(`activity:${participantId}`);
    for (const key of voiceRtcStatSnapshots.keys()) if (key.startsWith(`${participantId}:`)) voiceRtcStatSnapshots.delete(key);
    if (!voiceAnalyzers.size && voiceActivityTimer) {
      clearInterval(voiceActivityTimer);
      voiceActivityTimer = null;
    }
  }

  function clearVoiceActivityAnalyzer(participantId) {
    detachVoiceActivityAnalyzer(participantId);
    markVoiceParticipantSpeaking(participantId, false, "cleanup");
    markVoiceParticipantSpeaking(participantId, false, "rtc");
  }

  function scheduleVoicePeerRecovery(participantId, delayMs = 5000, forceRelay = false) {
    if (voicePeerDisconnectTimers.has(participantId)) return;
    const timer = window.setTimeout(() => {
      voicePeerDisconnectTimers.delete(participantId);
      const peer = voicePeerConnections.get(participantId);
      if (peer && ["failed", "disconnected"].includes(peer.connectionState)) void recoverVoicePeer(participantId, peer, { forceRelay });
    }, delayMs);
    voicePeerDisconnectTimers.set(participantId, timer);
  }

  async function recoverVoicePeer(participantId, peer, { forceRelay = false } = {}) {
    if (voicePeerRecoveryInFlight.has(participantId) || voiceState !== "connected" || voicePeerConnections.get(participantId) !== peer) return;
    voicePeerRecoveryInFlight.add(participantId);
    try {
      await refreshIceConfigurationIfNeeded(true);
      if (voicePeerConnections.get(participantId) !== peer || peer.connectionState === "closed") return;
      const recoveryConfig = forceRelay && voiceHasTurnServer()
        ? { ...rtcConfig, iceTransportPolicy: "relay" }
        : rtcConfig;
      if (forceRelay && voiceHasTurnServer()) {
        closeVoicePeer(participantId);
        // A recuperação pode ser disparada nos dois lados ao mesmo tempo.
        // Recriar ambos como iniciadores causa glare e deixa o par conectado
        // apenas em uma direção. Preserve o mesmo papel determinístico usado
        // na entrada inicial da sala.
        const initiator = voicePeerShouldInitiate(participantId);
        createVoicePeer(participantId, initiator, recoveryConfig);
        reportClientError("voice_peer_recovery_recreated", new Error("A conexão de áudio foi recriada usando TURN."), { participantId, forceRelay: true, initiator });
        return;
      }
      if (peer.signalingState !== "stable") {
        scheduleVoicePeerRecovery(participantId, 3000, forceRelay);
        return;
      }
      reportClientError("voice_peer_recovery_started", new Error("Renegociando a conexão de áudio."), { participantId, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState });
      if (typeof peer.restartIce === "function") peer.restartIce();
      const offer = await peer.createOffer({ iceRestart: true });
      await peer.setLocalDescription(offer);
      sendVoice({ type: "voice-signal", target: participantId, payload: { kind: "offer", sdp: peer.localDescription } });
    } catch (error) {
      reportClientError("voice_peer_recovery_error", error, { participantId, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState });
      scheduleVoicePeerRecovery(participantId, 10000, forceRelay);
    } finally {
      voicePeerRecoveryInFlight.delete(participantId);
    }
  }

  function getVoiceSoundContext() {
    if (typeof window === "undefined") return null;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    voiceSoundContext ||= new AudioContextConstructor();
    if (voiceSoundContext.state === "suspended") void voiceSoundContext.resume().catch(() => {});
    return voiceSoundContext;
  }

  function ensureVoiceActivityTimer() {
    if (!voiceActivityTimer) voiceActivityTimer = window.setInterval(pollVoiceActivity, VOICE_ACTIVITY_POLL_MS);
  }

  function publishVoiceSpeakingState(participantId, speaking) {
    voiceSpeakingPublisher.publish(participantId, speaking);
  }

  function clearVoiceSpeakingPublishTimer() {
    voiceSpeakingPublisher.reset();
  }

  function updateSoundPreference(key, value) {
    const next = { ...soundPreferences, [key]: value };
    soundPreferences = next;
    voiceSoundEffects = Boolean(next.enabled);
    localStorage.setItem("mirante-sound-preferences", JSON.stringify(next));
    localStorage.setItem("mirante-voice-sounds", String(next.enabled));
  }

  function soundEnabled(kind) {
    return Boolean(soundPreferences.enabled && soundPreferences[kind] !== false && !voiceDeafened);
  }

  function playVoiceSound(kind) {
    if (!soundEnabled(kind)) return;
    const context = getVoiceSoundContext();
    if (!context) return;
    if (kind === "notification" && context.state === "suspended") {
      pendingNotificationSound = true;
      return;
    }
    if (kind === "notification") pendingNotificationSound = false;
    const patterns = {
      enter: [{ frequency: 520, duration: 0.1, offset: 0 }, { frequency: 740, duration: 0.13, offset: 0.08 }],
      leave: [{ frequency: 660, duration: 0.1, offset: 0 }, { frequency: 440, duration: 0.15, offset: 0.08 }],
      mute: [{ frequency: 300, duration: 0.12, offset: 0 }],
      unmute: [{ frequency: 560, duration: 0.12, offset: 0 }],
      deafen: [{ frequency: 260, duration: 0.12, offset: 0 }],
      undeafen: [{ frequency: 520, duration: 0.12, offset: 0 }],
      message: [{ frequency: 880, duration: 0.08, offset: 0 }, { frequency: 1040, duration: 0.1, offset: 0.08 }],
      notification: [{ frequency: 740, duration: 0.09, offset: 0 }, { frequency: 988, duration: 0.12, offset: 0.09 }],
    };
    const now = context.currentTime;
    for (const tone of patterns[kind] || []) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.offset);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(180, tone.frequency * 0.92), now + tone.offset + tone.duration);
      gain.gain.setValueAtTime(0.0001, now + tone.offset);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.055 * soundPreferences.volume * voiceOutputVolume), now + tone.offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.offset + tone.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + tone.offset);
      oscillator.stop(now + tone.offset + tone.duration + 0.02);
    }
  }

  async function attachVoiceActivityStream(participantId, stream) {
    if (!participantId || !stream?.getAudioTracks?.().length || voiceAnalyzers.has(participantId) || voiceAnalyzerPendingIds.has(participantId)) return;
    // Para participantes remotos, o sinal do servidor é a fonte autoritativa.
    // Só criamos o analisador como fallback enquanto esse sinal não existe.
    if (participantId !== voiceClientId && voiceSpeakingSignalKnownParticipantIds.has(participantId)) return;
    const context = getVoiceSoundContext();
    if (!context) {
      reportClientError("voice_activity_analyzer_unavailable", new Error("O analisador de voz não está disponível neste navegador."), { participantId, isDesktop });
      return;
    }
    voiceAnalyzerPendingIds.add(participantId);
    const attachmentToken = Symbol(participantId);
    voiceAnalyzerTokens.set(participantId, attachmentToken);
    try {
      if (context.state === "suspended") await context.resume();
      if (voiceAnalyzerTokens.get(participantId) !== attachmentToken) return;
      const track = stream.getAudioTracks().find((candidate) => candidate.readyState === "live");
      if (!track) throw new Error("A faixa de áudio não está ativa para detectar fala.");
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      const silentGain = context.createGain();
       // 128 amostras em 48 kHz mantêm a detecção responsiva (~2,7 ms por
       // janela), reduzindo o atraso percebido sem polling agressivo.
       analyser.fftSize = 128;
      // A borda de fala não pode herdar a cauda do áudio renderizado. A
      // suavização padrão do analisador mantém energia antiga por mais tempo.
      analyser.smoothingTimeConstant = 0;
      silentGain.gain.value = 0;
      source.connect(analyser).connect(silentGain).connect(context.destination);
      const onEnded = () => {
        if (voiceAnalyzers.get(participantId)?.track !== track) return;
        clearVoiceActivityAnalyzer(participantId);
        reportClientError("voice_activity_track_ended", new Error("A faixa do microfone/áudio terminou durante a sala de voz."), { participantId, isDesktop, trackReadyState: track.readyState });
      };
      track.addEventListener("ended", onEnded, { once: true });
      voiceAnalyzers.set(participantId, {
        participantId,
        track,
        onEnded,
        source,
        analyser,
        silentGain,
        samples: new Float32Array(analyser.fftSize),
        speaking: false,
        silentSince: 0,
        noiseFloor: 0.004,
        previousSample: 0,
        previousAnalysisSample: 0,
        highpassState: 0,
        voiceBand: 0,
        highpassCoefficient: Math.exp((-2 * Math.PI * 140) / Math.max(context.sampleRate || 48000, 1)),
        voiceBandCoefficient: 1 - Math.exp((-2 * Math.PI * 4200) / Math.max(context.sampleRate || 48000, 1)),
        calibrationUntil: Date.now() + VOICE_ACTIVITY_CALIBRATION_MS,
        lastStateChangeAt: 0,
        lastDiagnosticAt: 0,
      });
      if (isDesktop) {
        const settings = track.getSettings?.() || {};
        reportClientError("voice_activity_analyzer_ready", new Error("Detector de fala inicializado."), { participantId, trackReadyState: track.readyState, trackEnabled: track.enabled, audioContextState: context.state, sampleRate: context.sampleRate, trackSampleRate: settings.sampleRate, channelCount: settings.channelCount, echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl });
      }
      ensureVoiceActivityTimer();
    } catch (error) {
      reportClientError("voice_activity_analyzer_error", error, { participantId, isDesktop, audioContextState: context.state });
    } finally {
      voiceAnalyzerPendingIds.delete(participantId);
      if (voiceAnalyzerTokens.get(participantId) === attachmentToken) voiceAnalyzerTokens.delete(participantId);
    }
  }

  function attachVoiceActivityDetector(participantId, audio) {
    if (participantId !== voiceClientId && voiceSpeakingSignalKnownParticipantIds.has(participantId)) return;
    void attachVoiceActivityStream(participantId, audio?.srcObject);
  }

  function pollVoiceActivity() {
    const now = Date.now();
    for (const state of voiceAnalyzers.values()) {
      state.analyser.getFloatTimeDomainData(state.samples);
      let energy = 0;
      for (const sample of state.samples) {
        energy += sample * sample;
      }
      const rms = Math.sqrt(energy / state.samples.length);
      // Calibra o ruído real do dispositivo antes de armar a detecção. Sem
      // isso, o ruído de fundo/codec pode cruzar o limiar e reiniciar o
      // temporizador de silêncio a cada ciclo, deixando a borda presa.
      if (now < state.calibrationUntil) {
        state.noiseFloor = state.noiseFloor * 0.85 + Math.min(rms, 0.03) * 0.15;
        state.silentSince = 0;
        if (state.speaking) {
          state.speaking = false;
          markVoiceParticipantSpeaking(state.participantId, false);
        }
        continue;
      }
      const useAutomaticSensitivity = voiceInputProfile !== "custom" || voiceSensitivityAuto;
      const sensitivity = useAutomaticSensitivity ? 0.5 : voiceSensitivity;
      const attackMultiplier = useAutomaticSensitivity ? 2.25 : 2.8 - sensitivity * 1.8;
      const releaseMultiplier = useAutomaticSensitivity ? 1.25 : 1.7 - sensitivity * 0.9;
      const attackBase = useAutomaticSensitivity ? 0.0015 : 0.004 - sensitivity * 0.0032;
      const releaseBase = useAutomaticSensitivity ? 0.0007 : 0.0015 - sensitivity * 0.0008;
      const attackThreshold = Math.max(0.003, state.noiseFloor * attackMultiplier + attackBase);
      const releaseThreshold = Math.max(0.0015, state.noiseFloor * releaseMultiplier + releaseBase);
      if (!state.speaking && rms < attackThreshold) state.noiseFloor = state.noiseFloor * 0.96 + Math.min(rms, 0.03) * 0.04;
      const wasSpeaking = state.speaking;
      let voiceBandEnergy = 0;
      let zeroCrossings = 0;
      let peak = 0;
      let previousSample = state.previousSample || 0;
      let previousAnalysisSample = state.previousAnalysisSample || 0;
      let highpassState = state.highpassState || 0;
      let voiceBand = state.voiceBand || 0;
      for (const sample of state.samples) {
        const absoluteSample = Math.abs(sample);
        peak = Math.max(peak, absoluteSample);
        const highpassed = state.highpassCoefficient * (highpassState + sample - previousSample);
        previousSample = sample;
        highpassState = highpassed;
        voiceBand += (highpassed - voiceBand) * state.voiceBandCoefficient;
        voiceBandEnergy += voiceBand * voiceBand;
        if ((sample >= 0) !== (previousAnalysisSample >= 0)) zeroCrossings += 1;
        previousAnalysisSample = sample;
      }
      state.previousSample = previousSample;
      state.previousAnalysisSample = previousAnalysisSample;
      state.highpassState = highpassState;
      state.voiceBand = voiceBand;
      const voiceBandRms = Math.sqrt(voiceBandEnergy / Math.max(state.samples.length, 1));
      const voiceBandRatio = voiceBandRms / Math.max(rms, 0.0001);
      const zeroCrossingRate = zeroCrossings / Math.max(state.samples.length, 1);
      const speechLike = voiceBandRatio >= 0.26 && zeroCrossingRate <= 0.48;
      const loudEnoughToOverrideBand = rms > attackThreshold * 1.8;
      const active = state.speaking
        ? rms > releaseThreshold && (voiceBandRatio >= 0.16 || rms > attackThreshold * 1.35)
        : rms > attackThreshold && (speechLike || loudEnoughToOverrideBand);
      const stateChanged = updateVoiceActivitySpeakingState(state, active, now, {
        releaseMs: VOICE_ACTIVITY_RELEASE_MS,
        minimumSpeakingMs: VOICE_ACTIVITY_MIN_STATE_MS,
        onsetGuardMs: VOICE_ACTIVITY_ONSET_GUARD_MS,
      });
      if (stateChanged) markVoiceParticipantSpeaking(state.participantId, state.speaking);
      if (wasSpeaking !== state.speaking && state.participantId === voiceClientId) {
        publishVoiceSpeakingState(state.participantId, state.speaking);
      }
      if (isDesktop && now - (state.lastDiagnosticAt || 0) >= 2000) {
        state.lastDiagnosticAt = now;
        reportClientError("voice_activity_sample", new Error("Amostra numérica do detector de fala."), { participantId: state.participantId, rms: Number(rms.toFixed(5)), peak: Number(peak.toFixed(5)), voiceBandRatio: Number(voiceBandRatio.toFixed(5)), zeroCrossingRate: Number(zeroCrossingRate.toFixed(5)), speechLike, attackThreshold: Number(attackThreshold.toFixed(5)), releaseThreshold: Number(releaseThreshold.toFixed(5)), noiseFloor: Number(state.noiseFloor.toFixed(5)), trackReadyState: state.track?.readyState, trackEnabled: state.track?.enabled });
      }
      if (isDesktop && wasSpeaking !== state.speaking) reportClientError("voice_activity_state", new Error(state.speaking ? "Detector de fala: falando." : "Detector de fala: silencioso."), { participantId: state.participantId, speaking: state.speaking, rms: Number(rms.toFixed(5)), peak: Number(peak.toFixed(5)), voiceBandRatio: Number(voiceBandRatio.toFixed(5)), zeroCrossingRate: Number(zeroCrossingRate.toFixed(5)), speechLike, attackThreshold: Number(attackThreshold.toFixed(5)), releaseThreshold: Number(releaseThreshold.toFixed(5)), noiseFloor: Number(state.noiseFloor.toFixed(5)), trackReadyState: state.track?.readyState, trackEnabled: state.track?.enabled });
    }
  }

  async function pollVoiceRtcActivity() {
    if (voiceRtcActivityPending || !voicePeerConnections.size) return;
    voiceRtcActivityPending = true;
    try {
      const detectedByParticipant = new Map();
      for (const [participantId, peer] of voicePeerConnections) {
        if (peer.connectionState === "closed" || typeof peer.getStats !== "function") continue;
        const stats = await peer.getStats();
        for (const report of stats.values()) {
          const isAudio = report.kind === "audio" || report.mediaType === "audio";
          const isInbound = report.type === "inbound-rtp" && isAudio;
          const isOutboundLocal = report.type === "outbound-rtp" && isAudio;
          if (!isInbound && !isOutboundLocal) continue;
          const targetParticipantId = isOutboundLocal ? voiceClientId : participantId;
          if (!targetParticipantId) continue;
          let active = detectedByParticipant.get(targetParticipantId) === true;
          if (typeof report.audioLevel === "number") {
            active ||= report.audioLevel > 0.045;
            detectedByParticipant.set(targetParticipantId, active);
            continue;
          }
          if (typeof report.totalAudioEnergy !== "number" || typeof report.totalSamplesDuration !== "number") continue;
          const snapshotKey = `${targetParticipantId}:${report.id}`;
          const previous = voiceRtcStatSnapshots.get(snapshotKey);
          voiceRtcStatSnapshots.set(snapshotKey, { energy: report.totalAudioEnergy, duration: report.totalSamplesDuration });
          if (!previous) continue;
          const energyDelta = Math.max(0, report.totalAudioEnergy - previous.energy);
          const durationDelta = Math.max(0, report.totalSamplesDuration - previous.duration);
          if (durationDelta > 0) {
            active ||= Math.sqrt(energyDelta / durationDelta) > 0.055;
            detectedByParticipant.set(targetParticipantId, active);
          }
        }
      }
      for (const participantId of new Set([...voicePeerConnections.keys(), voiceClientId].filter(Boolean))) {
        const active = detectedByParticipant.get(participantId) === true;
        const stateKey = `activity:${participantId}`;
        const state = voiceRtcStatSnapshots.get(stateKey) || { silentSince: 0, speaking: false };
        const now = Date.now();
        if (active) {
          state.silentSince = 0;
          state.speaking = true;
          markVoiceParticipantSpeaking(participantId, true, "rtc");
        } else if (state.speaking) {
          state.silentSince ||= now;
          if (now - state.silentSince > VOICE_ACTIVITY_RELEASE_MS) {
            state.speaking = false;
            markVoiceParticipantSpeaking(participantId, false, "rtc");
          }
        }
        voiceRtcStatSnapshots.set(`activity:${participantId}`, state);
      }
    } catch (error) {
      reportClientError("voice_rtc_activity_error", error, { isDesktop });
    } finally {
      voiceRtcActivityPending = false;
    }
  }

  function handleVoiceSoundEffectsChange(event) {
    updateSoundPreference("enabled", event.currentTarget.checked);
  }

  function handleSoundPreferenceChange(event, key) {
    updateSoundPreference(key, event.currentTarget.checked);
  }

  function handleSoundVolumeChange(event) {
    updateSoundPreference("volume", Math.min(1, Math.max(0, Number(event.currentTarget.value) / 100)));
  }

  function previewVoiceSound(kind) {
    const previous = soundPreferences;
    soundPreferences = { ...soundPreferences, enabled: true, [kind]: true };
    const context = getVoiceSoundContext();
    if (kind === "notification" && context?.state === "suspended" && context.resume) {
      void context.resume().then(() => {
        const previewPreferences = soundPreferences;
        soundPreferences = { ...soundPreferences, enabled: true, [kind]: true };
        playVoiceSound(kind);
        soundPreferences = previewPreferences;
      }).catch(() => {});
    } else playVoiceSound(kind);
    soundPreferences = previous;
  }

  function handleVoiceDragStart(event, participant) {
    if (!canMoveVoiceMembers) {
      event.preventDefault();
      return;
    }
    draggedVoiceParticipantId = participant.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", participant.id);
  }

  function handleVoiceDragEnd() {
    draggedVoiceParticipantId = "";
    voiceDropRoomId = "";
  }

  function openUserContextMenu(event, userLike, room = null) {
    event.preventDefault();
    event.stopPropagation();
    const width = 248;
    const height = 426;
    const participant = {
      ...userLike,
      id: userLike?.id || userLike?.userId,
      userId: userLike?.userId || userLike?.id,
    };
    voiceContextMenu = {
      x: Math.min(event.clientX, Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(event.clientY, Math.max(8, window.innerHeight - height - 8)),
      roomId: room?.id || null,
      participant,
    };
    void tick().then(() => document.querySelector(".voice-context-menu")?.focus());
  }

  function openVoiceContextMenu(event, room, participant) {
    openUserContextMenu(event, participant, room);
  }

  function closeVoiceContextMenu() {
    voiceContextMenu = null;
  }

  function handleVoiceContextMenuKeydown(event) {
    if (event.key === "Escape") closeVoiceContextMenu();
  }

  function handleGlobalVoiceContextMenu(event) {
    const target = event.target.closest?.(".channel-voice-member, .voice-chip");
    if (!target || !voiceRoomId) return;
    const participantName = target.querySelector("b")?.textContent?.trim() || target.childNodes[0]?.textContent?.trim() || target.textContent.trim().split("silencioso")[0].trim();
    const participant = [...voiceParticipants.values()].find((item) => voiceParticipantDisplayName(item) === participantName);
    if (participant) openVoiceContextMenu(event, activeVoiceRoom || selectedRoom, participant);
  }

  function handleGlobalRoomContextMenu(event) {
    const target = event.target.closest?.(".channel-item");
    const icon = target?.querySelector(".channel-icon")?.textContent?.trim();
    if (!target || !["#", "⌁"].includes(icon)) return;
    const roomName = target.children?.[1]?.textContent?.trim();
    const roomList = icon === "⌁" ? voiceRooms : textRooms;
    const room = roomList.find((candidate) => candidate.name === roomName);
    if (room) openRoomContextMenu(event, room);
  }

  async function openAccountDestination(destination) {
    showUserMenu = false;
    await openSettings("user");
    if (destination === "channel") {
      settingsSection = "channel";
      return;
    }
    if (destination === "preferences") {
      await tick();
      document.querySelector(".settings-layout .settings-content > form:nth-of-type(2)")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function handleGlobalAccountClick(event) {
    if (!event.target.closest?.(".account-menu-shell")) showUserMenu = false;
  }

  function handleGlobalUserClick(event) {
    const target = event.target.closest?.(".member-item, .channel-voice-member, .voice-chip");
    if (!target) return;
    const voiceTarget = target.matches(".channel-voice-member, .voice-chip");
    const displayName = voiceTarget
      ? target.querySelector("b")?.textContent?.trim() || target.textContent.trim().split("silencioso")[0].trim()
      : target.querySelector("strong")?.textContent?.trim();
    if (!displayName) return;
    if (voiceTarget) {
      const participants = voiceRooms.flatMap((room) => visibleVoiceParticipants(room));
      const participant = [...voiceParticipants.values(), ...participants].find((item) => voiceParticipantDisplayName(item) === displayName);
      if (participant) openVoiceContextMenu(event, activeVoiceRoom || selectedRoom, participant);
      return;
    }
    const member = groupMembers.find((item) => item.displayName === displayName);
    if (member) openUserContextMenu(event, member);
  }

  function showVoiceProfile(participant) {
    profilePreview = participant;
    closeVoiceContextMenu();
  }

  async function mentionVoiceParticipant(participant) {
    const textRoom = textRooms[0];
    if (!textRoom) return;
    selectedRoomId = textRoom.id;
    messageDraft = `${messageDraft.trim()}${messageDraft.trim() ? " " : ""}@${participant.username || participant.displayName || "usuario"} `;
    closeVoiceContextMenu();
    await tick();
    document.querySelector(".message-composer textarea")?.focus();
  }

  function setVoiceVolume(participantId, value) {
    const volume = Math.max(0, Math.min(1, Number(value) / 100));
    const targetUserId = voicePreferenceTargetId(participantId);
    if (!targetUserId) return;
    voiceVolumes = new VoicePreferenceMap(voiceVolumes).set(targetUserId, volume);
    const audio = voiceRemoteAudio.get(participantId);
    if (audio) audio.volume = effectiveVoiceOutputVolume(participantId);
    scheduleVoiceUserPreferencePersistence(targetUserId);
  }

  function isVoiceParticipantLocallyMuted(participantId) {
    return voiceLocallyMutedParticipants.has(voicePreferenceTargetId(participantId));
  }

  function toggleVoiceParticipantLocalMute(participantId) {
    if (!participantId) return;
    const targetUserId = voicePreferenceTargetId(participantId);
    if (!targetUserId) return;
    const next = new Set(voiceLocallyMutedParticipants);
    if (next.has(targetUserId)) next.delete(targetUserId);
    else next.add(targetUserId);
    voiceLocallyMutedParticipants = next;
    const audio = voiceRemoteAudio.get(participantId);
    if (audio) audio.muted = voiceDeafened || next.has(targetUserId);
    scheduleVoiceUserPreferencePersistence(targetUserId);
    closeVoiceContextMenu();
  }

  function toggleContextParticipantServerMute() {
    const context = voiceContextMenu;
    if (!context) return;
    const participant = context.participant;
    if (participant.isLocal) {
      toggleVoiceMute();
    } else if (canMoveVoiceMembers && context.roomId === voiceRoomId) {
      sendVoice({ type: "voice-mute", participantId: participant.id, muted: !participant.serverMuted });
    }
    closeVoiceContextMenu();
  }

  function disconnectContextParticipant() {
    const context = voiceContextMenu;
    if (!context) return;
    if (context.participant.isLocal) leaveVoiceRoom();
    else if (canMoveVoiceMembers && context.roomId === voiceRoomId) sendVoice({ type: "voice-disconnect", participantId: context.participant.id });
    closeVoiceContextMenu();
  }

  function moveContextParticipant(targetRoomId) {
    const context = voiceContextMenu;
    if (!context || !canMoveVoiceMembers || context.roomId !== voiceRoomId || targetRoomId === context.roomId) return;
    sendVoice({ type: "voice-move", participantId: context.participant.id, targetRoomId });
    closeVoiceContextMenu();
  }

  function handleVoiceDragOver(event, room) {
    if (!canMoveVoiceMembers || !draggedVoiceParticipantId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    voiceDropRoomId = room.id;
  }

  function handleVoiceDragLeave(event, room) {
    if (event.currentTarget === event.target && voiceDropRoomId === room.id) voiceDropRoomId = "";
  }

  function handleVoiceDrop(event, room) {
    if (!canMoveVoiceMembers) return;
    event.preventDefault();
    const participantId = event.dataTransfer.getData("text/plain") || draggedVoiceParticipantId;
    draggedVoiceParticipantId = "";
    voiceDropRoomId = "";
    if (!participantId || room.id === voiceRoomId) return;
    sendVoice({ type: "voice-move", participantId, targetRoomId: room.id });
  }

  function clearRecoveredVoiceError() {
    const transientErrors = new Set([
      "A conexão de áudio ainda não foi concluída. Tentando recuperar o áudio…",
      "A conexão de áudio foi estabelecida, mas a voz não chegou. Tentando recuperar…",
      "Não foi possível atravessar a rede para conectar o áudio. Verifique o TURN da VPS.",
      "A conexão de áudio com um participante apresentou uma falha. Tentando recuperar…",
    ]);
    if (!transientErrors.has(voiceError) || !voicePeerConnections.size) return;
    const allPeersRecovered = [...voicePeerConnections.entries()].every(([participantId, peer]) =>
      ["connected", "completed"].includes(peer?.connectionState) && voiceRemoteAudio.has(participantId),
    );
    if (allPeersRecovered) voiceError = "";
  }

  function createVoicePeer(participantId, initiator = false, peerConfig = rtcConfig) {
    if (voicePeerConnections.has(participantId)) return voicePeerConnections.get(participantId);
    const peer = new RTCPeerConnection({ ...peerConfig, iceCandidatePoolSize: 2 });
    voicePeerConnections.set(participantId, peer);
    const connectionTimer = window.setTimeout(() => {
      voicePeerConnectionTimers.delete(participantId);
      if (voicePeerConnections.get(participantId) !== peer || ["connected", "completed", "closed"].includes(peer.connectionState)) return;
      reportClientError("voice_peer_connection_timeout", new Error("O par de voz não concluiu a conexão a tempo."), { participantId, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, forceRelay: voiceHasTurnServer() });
      voiceError = "A conexão de áudio ainda não foi concluída. Tentando recuperar o áudio…";
      void recoverVoicePeer(participantId, peer, { forceRelay: true });
    }, VOICE_PEER_CONNECTION_TIMEOUT_MS);
    voicePeerConnectionTimers.set(participantId, connectionTimer);
    ensureVoiceActivityTimer();
    const localTrack = voiceLocalStream?.getAudioTracks?.().find((track) => track.readyState === "live");
    if (localTrack) {
      peer.addTrack(localTrack, voiceLocalStream);
      bindVoiceLocalTrack(localTrack);
    }
    peer.onicecandidate = (event) => { if (event.candidate) sendVoice({ type: "voice-signal", target: participantId, payload: { kind: "candidate", candidate: event.candidate } }); };
    peer.ontrack = (event) => {
      const audioTrackTimer = voicePeerAudioTrackTimers.get(participantId);
      if (audioTrackTimer) clearTimeout(audioTrackTimer);
      voicePeerAudioTrackTimers.delete(participantId);
      // Quando suportado pelo Chromium, elimina o atraso extra do buffer de
      // reprodução sem desativar a adaptação automática em redes instáveis.
      try {
        if (event.receiver && "playoutDelayHint" in event.receiver) event.receiver.playoutDelayHint = 0;
      } catch (error) {
        reportClientError("voice_playout_delay_hint_error", error, { participantId });
      }
      const remoteStream = ensureVoiceRemoteStream(participantId);
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) remoteStream.addTrack(event.track);
      const audio = ensureVoiceRemoteAudio(participantId);
      audio.muted = voiceDeafened || voiceLocallyMutedParticipants.has(voicePreferenceTargetId(participantId));
      audio.volume = effectiveVoiceOutputVolume(participantId);
      if (audio.srcObject !== remoteStream) audio.srcObject = remoteStream;
      event.track.addEventListener("ended", () => {
        if (voiceRemoteStreams.get(participantId) !== remoteStream) return;
        try { remoteStream.removeTrack(event.track); } catch {}
        if (!remoteStream.getAudioTracks().some((track) => track.readyState === "live")) {
          voicePeerAudioHealth.delete(participantId);
          scheduleVoiceRemotePlayback(participantId, 400);
        }
      }, { once: true });
      clearRecoveredVoiceError();
      const currentHealth = voicePeerAudioHealth.get(participantId);
      voicePeerAudioHealth.set(participantId, {
        firstTrackAt: currentHealth?.firstTrackAt || Date.now(),
        lastProgressAt: currentHealth?.lastProgressAt || Date.now(),
        lastBytes: currentHealth?.lastBytes || 0,
        recoveryAttempted: currentHealth?.recoveryAttempted || false,
      });
      ensureVoicePeerHealthTimer();
      attachVoiceActivityDetector(participantId, audio);
      void playVoiceRemoteAudio(participantId, audio).catch((error) => {
        reportClientError("voice_remote_audio_play_error", error, { participantId, deviceSelected: Boolean(selectedOutputDeviceId) });
        voiceError = "O áudio remoto foi conectado, mas não conseguiu tocar. Verifique a saída de áudio selecionada.";
      });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") {
        reportClientError("voice_peer_failed", new Error("A conexão de áudio falhou."), { participantId, iceConnectionState: peer.iceConnectionState });
        void recoverVoicePeer(participantId, peer, { forceRelay: true });
      } else if (peer.connectionState === "closed") closeVoicePeer(participantId);
      else if (peer.connectionState === "disconnected") scheduleVoicePeerRecovery(participantId, 1500, true);
      else {
        if (["connected", "completed"].includes(peer.connectionState)) {
          const connectionTimer = voicePeerConnectionTimers.get(participantId);
          if (connectionTimer) clearTimeout(connectionTimer);
          voicePeerConnectionTimers.delete(participantId);
          clearRecoveredVoiceError();
          if (!voiceRemoteAudio.has(participantId) && !voicePeerAudioTrackTimers.has(participantId)) {
            const audioTrackTimer = window.setTimeout(() => {
              voicePeerAudioTrackTimers.delete(participantId);
              if (voicePeerConnections.get(participantId) !== peer || voiceRemoteAudio.has(participantId) || peer.connectionState === "closed") return;
              reportClientError("voice_peer_audio_track_timeout", new Error("O par de voz conectou, mas não entregou a faixa de áudio remota."), { participantId, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, forceRelay: voiceHasTurnServer() });
              voiceError = "A conexão de áudio foi estabelecida, mas a voz não chegou. Tentando recuperar…";
              void recoverVoicePeer(participantId, peer, { forceRelay: true });
            }, VOICE_PEER_AUDIO_TRACK_TIMEOUT_MS);
            voicePeerAudioTrackTimers.set(participantId, audioTrackTimer);
          }
        }
        if (peer.connectionState === "connected" && !voicePeerAudioHealth.has(participantId)) {
          const now = Date.now();
          voicePeerAudioHealth.set(participantId, {
            firstTrackAt: now,
            lastProgressAt: now,
            lastBytes: 0,
            recoveryAttempted: false,
          });
          ensureVoicePeerHealthTimer();
        }
        const disconnectTimer = voicePeerDisconnectTimers.get(participantId);
        if (disconnectTimer) clearTimeout(disconnectTimer);
        voicePeerDisconnectTimers.delete(participantId);
      }
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "failed") {
        reportClientError("voice_ice_failed", new Error("A negociação ICE de áudio falhou."), { participantId });
        voiceError = "Não foi possível atravessar a rede para conectar o áudio. Verifique o TURN da VPS.";
        void recoverVoicePeer(participantId, peer, { forceRelay: true });
      } else if (peer.iceConnectionState === "disconnected") {
        scheduleVoicePeerRecovery(participantId, 1500, true);
      }
    };
    if (initiator) peer.createOffer().then(async (offer) => { await peer.setLocalDescription(offer); sendVoice({ type: "voice-signal", target: participantId, payload: { kind: "offer", sdp: peer.localDescription } }); }).catch((caught) => reportClientError("voice_offer_error", caught, { participantId }));
    return peer;
  }

  async function handleVoiceSignal(message) {
    const participantId = String(message?.from || "").trim();
    const payload = message?.payload;
    if (!voiceRoomId || !participantId || participantId === voiceClientId || !payload || typeof payload !== "object") return;
    // O servidor só encaminha sinais entre participantes da mesma sala, mas
    // o evento voice-user-joined chega por outro envio WebSocket. Em entradas
    // simultâneas, a oferta/candidato pode chegar antes da presença; guardar o
    // sinal evita que alguns pares do mesh nunca criem o áudio remoto.
    if (!voiceParticipants.has(participantId)) {
      voicePendingSignals.set(participantId, [...(voicePendingSignals.get(participantId) || []), message].slice(-96));
      return;
    }
    let peer = voicePeerConnections.get(participantId);
    if (peer?.connectionState === "closed") {
      closeVoicePeer(participantId);
      peer = null;
    }
    peer ||= createVoicePeer(participantId);
    if (!peer) return;
    if (payload.kind === "candidate") {
      if (!payload.candidate || typeof payload.candidate !== "object") return;
      if (peer.remoteDescription) await peer.addIceCandidate(payload.candidate).catch((error) => reportClientError("voice_candidate_error", error, { participantId }));
      else voicePendingCandidates.set(participantId, [...(voicePendingCandidates.get(participantId) || []), payload.candidate].slice(-64));
      return;
    }

    if (payload.kind === "offer") {
      // O mesmo par pode gerar uma oferta local durante uma troca de
      // microfone/reconexão. Recuar a oferta local permite aceitar a oferta
      // mais nova, em vez de deixar setRemoteDescription lançar
      // InvalidStateError e contaminar a sala inteira.
      if (peer.signalingState === "have-local-offer") await peer.setLocalDescription({ type: "rollback" });
      if (peer.signalingState === "have-remote-offer") return;
      await peer.setRemoteDescription(payload.sdp);
      if (voicePeerConnections.get(participantId) !== peer || peer.connectionState === "closed") return;
      for (const candidate of voicePendingCandidates.get(participantId) || []) await peer.addIceCandidate(candidate).catch((error) => reportClientError("voice_pending_candidate_error", error, { participantId }));
      voicePendingCandidates.delete(participantId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      if (voicePeerConnections.get(participantId) !== peer || peer.connectionState === "closed") return;
      sendVoice({ type: "voice-signal", target: participantId, payload: { kind: "answer", sdp: peer.localDescription } });
    } else if (payload.kind === "answer") {
      // Respostas antigas podem chegar depois de uma recuperação. Elas não
      // devem ser aplicadas a um peer que já voltou ao estado estável.
      if (peer.signalingState !== "have-local-offer") return;
      await peer.setRemoteDescription(payload.sdp);
      for (const candidate of voicePendingCandidates.get(participantId) || []) await peer.addIceCandidate(candidate).catch((error) => reportClientError("voice_pending_candidate_error", error, { participantId }));
      voicePendingCandidates.delete(participantId);
    }
  }

  function enqueueVoiceSignal(message) {
    const participantId = String(message?.from || "").trim();
    if (!participantId) return;
    const previous = voiceSignalQueues.get(participantId) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => handleVoiceSignal(message))
      .catch((error) => {
        reportClientError("voice_signal_processing_error", error, {
          roomId: voiceRoomId,
          participantId,
          signalKind: message?.payload?.kind || "unknown",
          signalingState: voicePeerConnections.get(participantId)?.signalingState || "closed",
        });
        if (voiceState === "connected" && voiceRoomId) voiceError = "A conexão de áudio com um participante apresentou uma falha. Tentando recuperar…";
      })
      .finally(() => {
        if (voiceSignalQueues.get(participantId) === next) voiceSignalQueues.delete(participantId);
      });
    voiceSignalQueues.set(participantId, next);
  }

  function connectVoiceSocket() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/signal`);
      voiceSocket = socket;
      let settled = false;
      const handshakeTimeout = window.setTimeout(() => {
        if (settled) return;
        const caught = new Error("A conexão da sala de voz demorou para responder.");
        reportClientError("voice_socket_connect_timeout", caught, { roomId: voiceRoomId });
        try { socket.close(); } catch {}
        settled = true;
        reject(caught);
      }, 12_000);
      const resolveConnection = () => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimeout);
        resolve(socket);
      };
      const rejectConnection = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimeout);
        reject(error);
      };
      socket.addEventListener("open", resolveConnection, { once: true });
      socket.addEventListener("error", () => { const caught = new Error("Não foi possível conectar à sala de voz."); reportClientError("voice_socket_connect_error", caught, { roomId: voiceRoomId }); rejectConnection(caught); }, { once: true });
      socket.addEventListener("message", async (event) => {
        if (voiceSocket !== socket) return;
        if (typeof event.data !== "string") return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "voice-joined") {
            voiceClientId = message.clientId;
            const localHasTrack = Boolean(voiceLocalStream?.getAudioTracks?.().find((track) => track.readyState === "live"));
            const localMuted = voiceMuted || !localHasTrack;
            const localParticipant = { id: voiceClientId, userId: user?.id || null, displayName: user?.displayName || "Você", username: user?.username || "você", avatarData: user?.avatarData || null, isLocal: true, muted: localMuted, serverMuted: false, deafened: false };
            voiceParticipants = new Map(uniqueVoiceParticipants([localParticipant, ...(message.participants || [])]).map((participant) => [participant.id, participant]));
            voiceState = "connected";
            voiceMuted = localMuted;
            voiceServerMuted = false;
            voiceDeafened = false;
            for (const participant of message.participants || []) {
              if (participant?.id) {
                voiceSpeakingSignalKnownParticipantIds = new Set(voiceSpeakingSignalKnownParticipantIds).add(participant.id);
              }
              if (participant.speaking) {
                markVoiceParticipantSpeaking(participant.id, true, "signal");
              }
            }
            writeVoiceReconnectSession({ groupId: selectedGroupId, voiceRoomId: message.voiceRoomId, groupName: selectedGroup?.name, roomName: selectedRoom?.name }, { show: false });
            attachVoiceActivityStream(voiceClientId, voiceLocalStream);
            replaceVoiceRoomSnapshot(message.voiceRoomId, [localParticipant, ...(message.participants || [])]);
            playVoiceSound("enter");
            for (const participant of message.participants || []) createVoicePeer(participant.id, voicePeerShouldInitiate(participant.id));
            void syncVoiceLocalTrackToPeers();
            if (!localHasTrack) sendVoice({ type: "voice-mute-state", muted: true });
          } else if (message.type === "voice-moved") {
            for (const participantId of voicePeerConnections.keys()) closeVoicePeer(participantId);
            removeVoiceRoomParticipant(message.previousRoomId, message.clientId, user?.id || null);
            voiceRoomId = message.voiceRoomId;
            voiceClientId = message.clientId;
            selectedRoomId = message.voiceRoomId;
            voiceServerMuted = Boolean(message.serverMuted);
            const movedTrack = voiceLocalStream?.getAudioTracks?.()[0];
            if (movedTrack) movedTrack.enabled = !(voiceMuted || voiceServerMuted);
            voiceParticipants = new Map(uniqueVoiceParticipants([{ id: voiceClientId, userId: user?.id || null, displayName: user?.displayName || "Você", username: user?.username || "você", isLocal: true, muted: voiceMuted || voiceServerMuted, serverMuted: voiceServerMuted, deafened: voiceDeafened }, ...(message.participants || [])]).map((participant) => [participant.id, participant]));
            voiceState = "connected";
            voiceError = "";
            for (const participant of message.participants || []) {
              if (participant?.id) {
                voiceSpeakingSignalKnownParticipantIds = new Set(voiceSpeakingSignalKnownParticipantIds).add(participant.id);
              }
              if (participant.speaking) {
                markVoiceParticipantSpeaking(participant.id, true, "signal");
              }
            }
            writeVoiceReconnectSession({ groupId: selectedGroupId, voiceRoomId: message.voiceRoomId, groupName: selectedGroup?.name, roomName: selectedRoom?.name }, { show: false });
            attachVoiceActivityStream(voiceClientId, voiceLocalStream);
            replaceVoiceRoomSnapshot(message.voiceRoomId, [...voiceParticipants.values()]);
            playVoiceSound("enter");
            for (const participant of message.participants || []) createVoicePeer(participant.id, voicePeerShouldInitiate(participant.id));
            void syncVoiceLocalTrackToPeers();
          } else if (message.type === "voice-user-joined") {
            voiceParticipants = new Map(uniqueVoiceParticipants([...voiceParticipants.values(), message.participant]).map((participant) => [participant.id, participant]));
            upsertVoiceRoomParticipant(voiceRoomId, message.participant);
            if (message.participant?.id) {
              voiceSpeakingSignalKnownParticipantIds = new Set(voiceSpeakingSignalKnownParticipantIds).add(message.participant.id);
              const pendingSignals = voicePendingSignals.get(message.participant.id) || [];
              voicePendingSignals.delete(message.participant.id);
              for (const pendingSignal of pendingSignals) enqueueVoiceSignal(pendingSignal);
              createVoicePeer(message.participant.id, voicePeerShouldInitiate(message.participant.id));
              void syncVoiceLocalTrackToPeers();
            }
            playVoiceSound("enter");
          } else if (message.type === "voice-user-left") {
            playVoiceSound("leave");
            const participantIdsToClose = new Set([message.participantId]);
            if (message.userId) {
              for (const participant of voiceParticipants.values()) {
                if (participant.userId === message.userId) participantIdsToClose.add(participant.id);
              }
            }
            const next = [...voiceParticipants.values()].filter((participant) => participant.id !== message.participantId && (!message.userId || participant.userId !== message.userId));
            voiceParticipants = new Map(next.map((participant) => [participant.id, participant]));
            for (const participantId of participantIdsToClose) {
              voiceSpeakingSignalKnownParticipantIds.delete(participantId);
              closeVoicePeer(participantId);
            }
            removeVoiceRoomParticipant(voiceRoomId, message.participantId, message.userId || null);
          } else if (message.type === "voice-user-muted") {
            const participant = voiceParticipants.get(message.participantId);
            if (participant) {
              const updated = { ...participant, muted: Boolean(message.muted), serverMuted: Boolean(message.serverMuted) };
              voiceParticipants = new Map(voiceParticipants).set(message.participantId, updated);
              upsertVoiceRoomParticipant(voiceRoomId, updated);
            }
          } else if (message.type === "voice-user-speaking") {
            const participantId = String(message.participantId || "");
            if (participantId) {
              voiceSpeakingSignalKnownParticipantIds = new Set(voiceSpeakingSignalKnownParticipantIds).add(participantId);
              if (participantId !== voiceClientId) detachVoiceActivityAnalyzer(participantId);
              markVoiceParticipantSpeaking(participantId, Boolean(message.speaking), "signal");
            }
          } else if (message.type === "voice-user-deafened") {
            const participant = voiceParticipants.get(message.participantId);
            if (participant) {
              const updated = { ...participant, deafened: Boolean(message.deafened) };
              voiceParticipants = new Map(voiceParticipants).set(message.participantId, updated);
              upsertVoiceRoomParticipant(voiceRoomId, updated);
            }
          } else if (message.type === "voice-force-mute") {
            const track = voiceLocalStream?.getAudioTracks()[0];
            const previousMuted = voiceMuted || voiceServerMuted;
            voiceServerMuted = Boolean(message.muted);
            if (track) track.enabled = !(voiceMuted || voiceServerMuted);
            const effectiveMuted = voiceMuted || voiceServerMuted;
            const local = voiceParticipants.get(voiceClientId);
            if (local) {
              const updated = { ...local, muted: effectiveMuted, serverMuted: voiceServerMuted };
              voiceParticipants = new Map(voiceParticipants).set(voiceClientId, updated);
              upsertVoiceRoomParticipant(voiceRoomId, updated);
            }
            sendVoice({ type: "voice-mute-state", muted: voiceMuted });
            if (effectiveMuted !== previousMuted) playVoiceSound(effectiveMuted ? "mute" : "unmute");
          } else if (message.type === "voice-disconnected") {
            voiceError = message.message || "Você foi desconectado da sala de voz.";
            clearVoiceReconnectSession();
            leaveVoiceRoom({ silent: true });
            if (message.reason === "replaced") void refreshGroupOverview();
          } else if (message.type === "voice-signal") {
            enqueueVoiceSignal(message);
          } else if (message.type === "voice-signal-error") {
            const participantId = String(message.target || "").trim();
            voiceError = message.message || "A sinalização do áudio está sendo recuperada.";
            if (participantId) scheduleVoicePeerRecovery(participantId, 800, true);
          } else if (message.type === "voice-error" || message.type === "error") {
            voiceError = message.message || "Não foi possível entrar na sala de voz.";
            // Erros de moderação (mover, desconectar ou silenciar) não devem
            // derrubar quem continua autorizado a permanecer na sala.
            if (message.type === "error" || !message.action) leaveVoiceRoom();
          }
        } catch (caught) {
          reportClientError("voice_message_error", caught, { roomId: voiceRoomId });
          voiceError = "A sinalização da sala de voz retornou uma mensagem inválida.";
        }
      });
      socket.addEventListener("error", () => reportClientError("voice_socket_error", new Error("A conexão da sala de voz falhou."), { roomId: voiceRoomId }));
      socket.addEventListener("close", (event) => {
        if (!settled) rejectConnection(new Error("A conexão da sala de voz foi encerrada antes de conectar."));
        if (voiceSocket !== socket) return;
        if (event.code === 4001) {
          clearVoiceReconnectSession();
          voiceError = "Esta conta entrou na sala em outra janela.";
          leaveVoiceRoom({ silent: true });
          void refreshGroupOverview();
          return;
        }
        reportClientError("voice_socket_closed", new Error("A conexão da sala de voz foi encerrada."), { roomId: voiceRoomId });
        if (voiceState === "connected" || voiceState === "connecting") {
          writeVoiceReconnectSession({ groupId: selectedGroupId, voiceRoomId, groupName: selectedGroup?.name, roomName: activeVoiceRoom?.name || selectedRoom?.name });
          voiceError = "A conexão da sala de voz foi encerrada. Tentando reconectar…";
          leaveVoiceRoom({ preserveLocalStream: true, preserveReconnect: true, silent: true });
          scheduleVoiceReconnect(1500);
        }
      });
    });
  }

  function scheduleVoiceReconnect(delayMs = 1500) {
    if (voiceReconnectTimer || voiceReconnectBusy || !voiceReconnectSession || !user || !navigator.onLine) return;
    voiceReconnectTimer = window.setTimeout(() => {
      voiceReconnectTimer = null;
      void reconnectSavedVoiceRoom({ automatic: true });
    }, delayMs);
  }

  async function reconnectSavedVoiceRoom({ automatic = false } = {}) {
    if (voiceReconnectBusy || !voiceReconnectSession || !user || !navigator.onLine) return false;
    const saved = voiceReconnectSession;
    voiceReconnectBusy = true;
    voiceReconnectVisible = true;
    setGroupsView();
    try {
      await loadGroup(saved.groupId);
      const room = groupOverview?.rooms?.find((candidate) => candidate.id === saved.voiceRoomId && candidate.kind === "voice");
      if (!room) throw new Error("A sala de voz salva não está mais disponível neste grupo.");
      selectedGroupId = saved.groupId;
      selectedRoomId = room.id;
      await tick();
      const joined = await joinVoiceRoom({ reconnecting: true });
      if (!joined) throw new Error(voiceError || "Não foi possível reconectar à sala de voz.");
      return true;
    } catch (error) {
      reportClientError("voice_reconnect_error", error, { automatic, groupId: saved.groupId, voiceRoomId: saved.voiceRoomId, online: navigator.onLine });
      voiceError = error.message || "Não foi possível reconectar à sala de voz.";
      voiceReconnectVisible = true;
      if (automatic && navigator.onLine) scheduleVoiceReconnect(5000);
      return false;
    } finally {
      voiceReconnectBusy = false;
    }
  }

  function handleVoiceNetworkOffline() {
    if (!voiceRoomId || !["connected", "connecting"].includes(voiceState)) return;
    writeVoiceReconnectSession({
      groupId: selectedGroupId,
      voiceRoomId,
      groupName: selectedGroup?.name,
      roomName: activeVoiceRoom?.name || selectedRoom?.name,
    });
    voiceError = "Sem conexão com a internet. O Telai tentará reconectar quando ela voltar.";
    leaveVoiceRoom({ preserveLocalStream: true, preserveReconnect: true, silent: true });
  }

  function handleVoiceNetworkOnline() {
    if (voiceReconnectSession && user) scheduleVoiceReconnect(800);
  }

  async function handleVoiceDeviceChange() {
    const hadSelectedInput = Boolean(selectedInputDeviceId);
    await loadAudioDevices(false);
    const localTrack = voiceLocalStream?.getAudioTracks?.()[0];
    const selectedInputWasRemoved = hadSelectedInput && !selectedInputDeviceId;
    if (voiceState === "connected" && (selectedInputWasRemoved || !localTrack || localTrack.readyState !== "live")) {
      await recoverVoiceInputTrack(selectedInputWasRemoved ? "selected_device_removed" : "device_change");
    }
  }

  function voiceMicrophoneJoinMessage(error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      return "Você entrou sem microfone porque o acesso foi bloqueado. Permita o microfone nas configurações do navegador e tente selecionar novamente.";
    }
    if (error?.voiceInputFallbackAttempted) {
      return "Você entrou sem microfone porque o microfone padrão também não está disponível. Verifique as permissões do Windows e escolha outro dispositivo em Áudio e voz.";
    }
    if (["NotFoundError", "OverconstrainedError"].includes(error?.name)) {
      return "Você entrou sem microfone porque o dispositivo escolhido não está disponível. Abra Áudio e voz, atualize os dispositivos e tente novamente.";
    }
    if (error?.name === "NotReadableError") {
      return "Você entrou sem microfone porque o dispositivo está sendo usado por outro aplicativo. Feche o outro uso e tente novamente.";
    }
    return "Você entrou sem microfone. Abra Áudio e voz para testar ou escolher outro dispositivo.";
  }

  async function joinVoiceRoom({ reconnecting = false } = {}) {
    if (!selectedRoom || selectedRoom.kind !== "voice" || !selectedGroupId) return;
    if (voiceRoomId === selectedRoom.id) {
      return;
    }
    if (voiceState === "connecting") return;
    const targetRoomId = selectedRoom.id;
    const targetGroupId = selectedGroupId;
    leaveVoiceRoom({ preserveLocalStream: true, preserveReconnect: true, silent: true });
    getVoiceSoundContext();
    voiceState = "connecting";
    voiceError = "";
    voiceRoomId = targetRoomId;
    voiceParticipants = new Map([[
      "local-pending",
      {
        id: "local-pending",
        userId: user?.id || null,
        displayName: user?.displayName || "Você",
        username: user?.username || "você",
        avatarData: user?.avatarData || null,
        isLocal: true,
        muted: voiceMuted,
        deafened: voiceDeafened,
        connecting: true,
      },
    ]]);
    upsertVoiceRoomParticipant(targetRoomId, [...voiceParticipants.values()][0]);
    try {
      await refreshIceConfigurationIfNeeded();
      await connectVoiceSocket();
      let microphoneJoinError = null;
      try {
        const existingTrack = voiceLocalStream?.getAudioTracks?.().find((track) => track.readyState === "live");
        if (!existingTrack || !voiceInputStreamMatchesSelectedDevice(voiceLocalStream)) {
          stopVoiceInputStream(voiceLocalStream);
          voiceLocalStream = await captureVoiceInputStream();
        }
        const liveTrack = voiceLocalStream?.getAudioTracks?.().find((track) => track.readyState === "live");
        if (!liveTrack) throw new Error("O microfone não ficou disponível para a sala de voz.");
        liveTrack.enabled = true;
        bindVoiceLocalTrack(liveTrack);
        voiceMuted = false;
        voiceMutedByCaptureFailure = false;
      } catch (error) {
        // A captura não pode impedir a entrada na sala: o usuário ainda deve
        // conseguir ouvir quem já está conectado e corrigir o microfone por
        // dentro das configurações, sem cair silenciosamente no padrão do SO.
        microphoneJoinError = error;
        reportClientError("voice_microphone_unavailable_on_join", error, { roomId: targetRoomId, deviceSelected: Boolean(selectedInputDeviceId) });
        stopVoiceInputStream(voiceLocalStream);
        voiceLocalStream = null;
        voiceMuted = true;
        voiceMutedByCaptureFailure = true;
      }
      sendVoice({ type: "voice-join", voiceRoomId: targetRoomId, groupId: targetGroupId });
      if (microphoneJoinError) voiceError = voiceMicrophoneJoinMessage(microphoneJoinError);
      return true;
    } catch (error) {
      reportClientError("voice_join_error", error, { roomId: targetRoomId, groupId: targetGroupId });
      voiceError = error.name === "NotAllowedError" ? "Permita o microfone para entrar nesta sala." : error.message;
      leaveVoiceRoom({ preserveLocalStream: reconnecting, preserveReconnect: reconnecting, silent: true });
      return false;
    }
  }

  function leaveVoiceRoom({ preserveLocalStream = false, preserveReconnect = false, silent = false } = {}) {
    const wasInVoice = voiceState === "connected" || voiceState === "connecting";
    releasePushToTalk();
    clearVoiceSpeakingPublishTimer();
    const previousVoiceRoomId = voiceRoomId;
    const previousVoiceClientId = voiceClientId;
    if (previousVoiceRoomId) {
      removeVoiceRoomParticipant(previousVoiceRoomId, previousVoiceClientId, user?.id || null);
      sendVoice({ type: "voice-leave" });
    }
    for (const participantId of voicePeerConnections.keys()) closeVoicePeer(participantId);
    clearVoiceActivityAnalyzer(previousVoiceClientId);
    if (!preserveLocalStream) {
      stopVoiceInputStream(voiceLocalStream);
      voiceLocalStream = null;
    }
    voiceSocket?.close();
    voiceSocket = null;
    voiceRoomId = null;
    voiceClientId = null;
    voiceParticipants = new Map();
    voicePlaybackBlocked = false;
    speakingVoiceParticipantIds = new Set();
    voiceSpeakingSignalKnownParticipantIds = new Set();
    voiceRtcSpeakingParticipantIds = new Set();
    voiceRtcStatSnapshots.clear();
    voicePeerAudioHealth.clear();
    voicePeerRelayRecoveryAttempted.clear();
    voiceSignalQueues.clear();
    voicePendingSignals.clear();
    stopVoicePeerHealthTimer();
    voiceState = "idle";
    voiceMuted = false;
    voiceMutedByCaptureFailure = false;
    voiceServerMuted = false;
    voiceDeafened = false;
    if (!preserveReconnect) clearVoiceReconnectSession();
    if (wasInVoice && !silent) playVoiceSound("leave");
  }

  function toggleVoiceMute() {
    setVoiceMuted(!voiceMuted);
  }

  function setVoiceMuted(nextMuted) {
    const track = voiceLocalStream?.getAudioTracks()[0];
    if (!track || !voiceClientId) return false;
    const local = voiceParticipants.get(voiceClientId);
    if (!nextMuted && (voiceServerMuted || local?.serverMuted)) return false;
    voiceMuted = Boolean(nextMuted);
    track.enabled = !(voiceMuted || voiceServerMuted);
    if (local) {
      const updated = { ...local, muted: voiceMuted || Boolean(local.serverMuted) };
      voiceParticipants = new Map(voiceParticipants).set(voiceClientId, updated);
      upsertVoiceRoomParticipant(voiceRoomId, updated);
    }
    sendVoice({ type: "voice-mute-state", muted: voiceMuted });
    playVoiceSound(voiceMuted ? "mute" : "unmute");
    return true;
  }

  function pushToTalkLabel(code) {
    const labels = { Space: "Espaço", ControlLeft: "Ctrl esquerdo", ControlRight: "Ctrl direito", ShiftLeft: "Shift esquerdo", ShiftRight: "Shift direito", AltLeft: "Alt esquerdo", AltRight: "Alt direito", Escape: "Esc", Enter: "Enter", Tab: "Tab", Backspace: "Backspace" };
    if (labels[code]) return labels[code];
    if (code?.startsWith("Key")) return code.slice(3);
    if (code?.startsWith("Digit")) return code.slice(5);
    return code || "Nenhuma tecla";
  }

  function startPushToTalkCapture() {
    pushToTalkCapturing = true;
    settingsError = "Pressione uma tecla agora. Esc cancela.";
  }

  async function syncDesktopPushToTalkKey() {
    if (!window.miranteDesktop?.setPushToTalkKey) {
      desktopPushToTalkGlobal = false;
      return;
    }
    try {
      const result = await window.miranteDesktop.setPushToTalkKey(pushToTalkEnabled ? pushToTalkKey : "");
      desktopPushToTalkGlobal = Boolean(result?.ok && result?.global);
      if (!result?.ok && pushToTalkKey) settingsError = result.message || "Não foi possível registrar essa tecla global.";
    } catch {
      desktopPushToTalkGlobal = false;
    }
  }

  async function syncDesktopMuteShortcut() {
    if (!window.miranteDesktop?.setMuteShortcut) {
      desktopMuteShortcutGlobal = false;
      return;
    }
    try {
      const result = await window.miranteDesktop.setMuteShortcut(muteShortcut);
      desktopMuteShortcutGlobal = Boolean(result?.ok && result?.global);
      if (!result?.ok && muteShortcut) settingsError = result.message || "Não foi possível registrar o atalho de mudo.";
    } catch {
      desktopMuteShortcutGlobal = false;
    }
  }

  async function syncDesktopShortcuts() {
    await Promise.all([syncDesktopPushToTalkKey(), syncDesktopMuteShortcut()]);
  }

  function handleDesktopPushToTalk(payload = {}) {
    if (voiceState !== "connected") return;
    const active = Boolean(payload.active);
    if (active && !setVoiceMuted(false)) return;
    if (!active) setVoiceMuted(true);
    pushToTalkActive = active;
  }

  function clearPushToTalkKey() {
    if (pushToTalkActive) {
      pushToTalkActive = false;
      setVoiceMuted(true);
    }
    pushToTalkKey = "";
    localStorage.removeItem("mirante-push-to-talk");
    void syncDesktopPushToTalkKey();
    settingsError = "Tecla de push-to-talk removida. Clique em Salvar preferências.";
  }

  function togglePushToTalk(event) {
    pushToTalkEnabled = Boolean(event.currentTarget.checked);
    localStorage.setItem("mirante-push-to-talk-enabled", String(pushToTalkEnabled));
    if (!pushToTalkEnabled && pushToTalkActive) {
      pushToTalkActive = false;
      setVoiceMuted(true);
    }
    void syncDesktopPushToTalkKey();
  }

  function shortcutLabel(shortcut) {
    if (shortcut?.startsWith("mouse:")) {
      const button = Number(shortcut.slice(6));
      return { 0: "Botão esquerdo", 1: "Botão do meio", 2: "Botão direito", 3: "Botão lateral 1", 4: "Botão lateral 2" }[button] || `Botão ${button + 1}`;
    }
    return pushToTalkLabel(shortcut);
  }

  function startMuteShortcutCapture() {
    muteShortcutCapturing = true;
    settingsError = "Pressione uma tecla ou botão do mouse agora. Esc cancela.";
  }

  function clearMuteShortcut() {
    muteShortcutCapturing = false;
    muteShortcut = "";
    localStorage.removeItem("mirante-mute-shortcut");
    void syncDesktopMuteShortcut();
    settingsError = "Atalho de mudo removido. Clique em Salvar preferências.";
  }

  function isEditableElement(element) {
    return Boolean(element?.matches?.("input, textarea, select, [contenteditable='true']"));
  }

  const reservedSystemShortcutCodes = new Set(["AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "Tab"]);

  function isReservedSystemShortcut(event) {
    return reservedSystemShortcutCodes.has(event?.code) || Boolean(event?.altKey || event?.metaKey);
  }

  function handlePushToTalkKeyDown(event) {
    if (pushToTalkCapturing) {
      if (event.code === "Escape") {
        event.preventDefault();
        pushToTalkCapturing = false;
        settingsError = "Escolha de tecla cancelada.";
      } else if (isReservedSystemShortcut(event)) {
        settingsError = "Alt, Windows e Tab ficam reservados para o sistema. Escolha outra tecla.";
      } else if (event.code) {
        event.preventDefault();
        pushToTalkKey = event.code;
        pushToTalkCapturing = false;
        localStorage.setItem("mirante-push-to-talk", pushToTalkKey);
        void syncDesktopPushToTalkKey();
        settingsError = `Tecla ${pushToTalkLabel(pushToTalkKey)} definida. Clique em Salvar preferências.`;
      }
      return;
    }
    if (isDesktop && desktopPushToTalkGlobal && !pushToTalkCapturing) return;
    if (!pushToTalkEnabled || !pushToTalkKey || event.code !== pushToTalkKey || event.repeat || isEditableElement(event.target) || isReservedSystemShortcut(event)) return;
    event.preventDefault();
    if (!pushToTalkActive && setVoiceMuted(false)) pushToTalkActive = true;
  }

  function handleMuteShortcutKeyDown(event) {
    if (muteShortcutCapturing) {
      if (event.code === "Escape") {
        event.preventDefault();
        muteShortcutCapturing = false;
        settingsError = "Escolha de atalho cancelada.";
      } else if (isReservedSystemShortcut(event)) {
        settingsError = "Alt, Windows e Tab ficam reservados para o sistema. Escolha outra tecla ou um botão lateral do mouse.";
      } else if (event.code) {
        event.preventDefault();
        muteShortcut = event.code;
        muteShortcutCapturing = false;
        localStorage.setItem("mirante-mute-shortcut", muteShortcut);
        void syncDesktopMuteShortcut();
        settingsError = `Atalho ${shortcutLabel(muteShortcut)} definido. Clique em Salvar preferências.`;
      }
      return;
    }
    if (isDesktop && desktopMuteShortcutGlobal) return;
    if (!muteShortcut || muteShortcut.startsWith("mouse:") || event.code !== muteShortcut || event.repeat || isEditableElement(event.target) || isReservedSystemShortcut(event)) return;
    event.preventDefault();
    toggleVoiceMute();
  }

  function handleMuteShortcutMouseDown(event) {
    if (muteShortcutCapturing) {
      if (event.button < 3) {
        settingsError = "Para evitar cliques acidentais, use um botão lateral do mouse (4 ou 5).";
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      muteShortcut = `mouse:${event.button}`;
      muteShortcutCapturing = false;
      localStorage.setItem("mirante-mute-shortcut", muteShortcut);
      void syncDesktopMuteShortcut();
      settingsError = `Atalho ${shortcutLabel(muteShortcut)} definido. Clique em Salvar preferências.`;
      return;
    }
    if (!muteShortcut?.startsWith("mouse:") || isEditableElement(event.target) || Number(muteShortcut.slice(6)) !== event.button) return;
    event.preventDefault();
    toggleVoiceMute();
  }

  function handleDesktopMuteShortcut() {
    if (voiceState === "connected") toggleVoiceMute();
  }

  function handlePushToTalkKeyUp(event) {
    if (event.code !== pushToTalkKey || !pushToTalkActive) return;
    // Libere o microfone mesmo se Alt/Windows foi pressionado durante o PTT.
    // A soltura continua disponível ao sistema operacional.
    if (!isReservedSystemShortcut(event)) event.preventDefault();
    pushToTalkActive = false;
    setVoiceMuted(true);
  }

  function releasePushToTalk() {
    if (!pushToTalkActive) return;
    pushToTalkActive = false;
    setVoiceMuted(true);
  }

  function toggleVoiceDeafen() {
    const nextDeafened = !voiceDeafened;
    voiceDeafened = nextDeafened;
    for (const [participantId, audio] of voiceRemoteAudio) audio.muted = voiceDeafened || voiceLocallyMutedParticipants.has(voicePreferenceTargetId(participantId));
    if (!nextDeafened) resumeVoiceRemoteAudio();
    const local = voiceParticipants.get(voiceClientId);
    if (local) {
      const updated = { ...local, deafened: voiceDeafened };
      voiceParticipants = new Map(voiceParticipants).set(voiceClientId, updated);
      upsertVoiceRoomParticipant(voiceRoomId, updated);
    }
    sendVoice({ type: "voice-deafen-state", deafened: voiceDeafened });
    playVoiceSound(nextDeafened ? "deafen" : "undeafen");
  }

  function openVoiceSettings() {
    void openSettings("user", "groups").then(() => loadAudioDevices(true));
    settingsSection = "voice";
  }

  async function selectRoom(roomId) {
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!room) return;
    selectedRoomId = room.id;
    watchingGroupLiveStreamId = "";
    showMobileChannels = false;
    mentionSuggestions = [];
    mentionStartIndex = -1;
    if (room.kind === "voice") {
      // O Electron pode bloquear o AudioContext depois de qualquer await.
      // Inicialize-o ainda dentro do gesto que abriu o canal para que o VAD
      // consiga ler o microfone assim que a sala conectar.
      getVoiceSoundContext();
    }
    await tick();
    if (room.kind === "text" && selectedRoomId === room.id) {
      messageComposerInput?.focus();
      void scrollGroupMessagesToBottom({ force: true });
    }
    if (room.kind === "voice") {
      if (selectedRoomId === room.id) await joinVoiceRoom();
    }
  }

  function watchSelectedRoomLive(streamId = selectedRoomLiveStream?.id) {
    const stream = selectedRoomLiveStreams.find((candidate) => candidate.id === streamId);
    if (!stream || stream.createdBy === user?.id) return;
    watchingGroupLiveStreamId = stream.id;
  }

  function closeSelectedRoomLive() {
    watchingGroupLiveStreamId = "";
  }

  function visibleVoiceParticipants(room) {
    if (!room) return [];
    if (room.id === voiceRoomId && (voiceState === "connected" || voiceState === "connecting")) {
      // Enquanto a sala está conectada, os ids do socket de voz são a fonte
      // autoritativa. O overview pode conter um clientId antigo do mesmo
      // usuário; se ele vencer a deduplicação, a borda de fala é aplicada ao
      // id correto mas renderizada em outro elemento.
      return uniqueVoiceParticipants([
        ...voiceParticipants.values(),
        ...(room.participants || []).filter((participant) => participant.userId !== user?.id),
      ]);
    }
    return uniqueVoiceParticipants((room.participants || []).map((participant) => (
      participant.userId === user?.id
        ? { ...participant, remoteSession: true, displayName: `${participant.displayName || user?.displayName || "Você"} · outra janela` }
        : participant
    )));
  }

  function voiceParticipantDisplayName(participant) {
    const name = participant?.displayName || (participant?.isLocal ? user?.displayName || user?.username : "Participante") || "Participante";
    return name;
  }

  function privateLiveForParticipant(participant, roomId) {
    if (!participant?.userId || !roomId) return null;
    return groupLiveStreams.find((stream) => stream.visibility === "private" && stream.voiceRoomId === roomId && stream.createdBy === participant.userId) || null;
  }

  function selectSettingsSection(section, tab = "user") {
    settingsSection = section;
    settingsTab = tab;
    void tick().then(() => settingsPageElement?.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function clearBroadcastPeerRetry(viewerId) {
    const timer = broadcastPeerRetryTimers.get(viewerId);
    if (timer) window.clearTimeout(timer);
    broadcastPeerRetryTimers.delete(viewerId);
  }

  async function flushBroadcastPendingCandidates(viewerId, peer) {
    const candidates = pendingBroadcastCandidates.get(viewerId) || [];
    pendingBroadcastCandidates.delete(viewerId);
    for (const candidate of candidates) {
      await peer.addIceCandidate(candidate).catch((error) => reportClientError("broadcast_pending_candidate_error", error, { roomId: broadcastRoomId, mediaMode }));
    }
  }

  function scheduleBroadcastPeerRetry(viewerId, delayMs = 8_000) {
    if (!viewerId || broadcastPeerRetryTimers.has(viewerId)) return;
    const timer = window.setTimeout(() => {
      broadcastPeerRetryTimers.delete(viewerId);
      if (broadcastState !== "live" || broadcastSocket?.readyState !== WebSocket.OPEN) return;
      const peer = peerConnections.get(viewerId);
      if (!peer || ["connected", "completed"].includes(peer.connectionState)) return;
      peer.close();
      peerConnections.delete(viewerId);
      pendingBroadcastCandidates.delete(viewerId);
      void negotiateBroadcastPeer(viewerId);
    }, delayMs);
    broadcastPeerRetryTimers.set(viewerId, timer);
  }

  async function negotiateBroadcastPeer(viewerId) {
    if (!viewerId || !broadcastStream || mediaMode !== "p2p") return;
    const existingNegotiation = broadcastPeerNegotiations.get(viewerId);
    if (existingNegotiation) return existingNegotiation;
    const negotiation = (async () => {
      const peer = createBroadcastPeer(viewerId);
      sendBroadcast({ type: "quality-lock", target: viewerId, quality: selectedQuality });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (peerConnections.get(viewerId) !== peer || broadcastSocket?.readyState !== WebSocket.OPEN) return;
      sendBroadcast({ type: "signal", target: viewerId, payload: { kind: "offer", sdp: peer.localDescription } });
      scheduleBroadcastPeerRetry(viewerId);
    })().catch((error) => {
      reportClientError("broadcast_offer_error", error, { roomId: broadcastRoomId, mediaMode });
      scheduleBroadcastPeerRetry(viewerId, 1_500);
    }).finally(() => {
      broadcastPeerNegotiations.delete(viewerId);
    });
    broadcastPeerNegotiations.set(viewerId, negotiation);
    return negotiation;
  }

  function createBroadcastPeer(viewerId) {
    if (peerConnections.has(viewerId)) return peerConnections.get(viewerId);
    const peer = new RTCPeerConnection({ ...rtcConfig, iceCandidatePoolSize: 4 });
    peerConnections.set(viewerId, peer);
    const streamTracks = broadcastStream?.getTracks?.() || [];
    const audioTracks = streamTracks.filter((track) => track.kind === "audio");
    streamTracks.filter((track) => track.kind !== "audio").forEach((track) => peer.addTrack(track, broadcastStream));
    if (audioTracks.length) audioTracks.forEach((track) => peer.addTrack(track, broadcastStream));
    else {
      // Reserve o m-line de áudio na primeira oferta. Sem isso, ativar o
      // microfone depois que a live já tem espectadores exigiria uma nova
      // negociação; a troca local da faixa, sozinha, não chega ao viewer.
      try { peer.addTransceiver("audio", { direction: "sendonly" }); } catch (error) {
        reportClientError("broadcast_audio_transceiver_error", error, { viewerId });
      }
    }
    // O espectador pode ficar em "Automática" e não enviar uma mensagem de
    // qualidade antes da primeira oferta. Aplique o teto localmente antes de
    // negociar para nunca iniciar um encoder ilimitado por acidente.
    applyBroadcastPeerQuality(peer, "auto");
    peer.onicecandidate = (event) => { if (event.candidate) sendBroadcast({ type: "signal", target: viewerId, payload: { kind: "candidate", candidate: event.candidate } }); };
    peer.onconnectionstatechange = () => {
      if (["connected", "completed"].includes(peer.connectionState)) {
        clearBroadcastPeerRetry(viewerId);
      } else if (["failed", "closed"].includes(peer.connectionState)) {
        peer.close();
        if (peerConnections.get(viewerId) === peer) peerConnections.delete(viewerId);
        pendingBroadcastCandidates.delete(viewerId);
        scheduleBroadcastPeerRetry(viewerId, 1_500);
      } else if (peer.connectionState === "disconnected") {
        scheduleBroadcastPeerRetry(viewerId, 2_500);
      }
    };
    return peer;
  }

  function applyBroadcastPeerQuality(peer, quality) {
    if (!peer || mediaMode !== "p2p") return;
    const profile = quality === "auto"
      ? (qualityProfiles[selectedQuality] || qualityProfiles.balanced)
      : (qualityProfiles[quality] || qualityProfiles.balanced);
    for (const sender of peer.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) continue;
      const settings = sender.track.getSettings?.() || {};
      const sourceWidth = Number(settings.width) || profile.width;
      const sourceHeight = Number(settings.height) || profile.height;
      const scaleResolutionDownBy = Math.max(1, sourceWidth / profile.width, sourceHeight / profile.height);
      parameters.encodings = parameters.encodings.map((encoding) => ({
        ...encoding,
        maxBitrate: profile.maxBitrate,
        maxFramerate: profile.maxFramerate,
        scaleResolutionDownBy,
      }));
      sender.setParameters(parameters).catch((error) => reportClientError("broadcast_quality_apply_error", error, { quality, peer: Boolean(peer) }));
    }
  }

  async function handleBroadcastSignal(message) {
    const peer = createBroadcastPeer(message.from);
    if (message.payload?.kind === "answer") {
      await peer.setRemoteDescription(message.payload.sdp);
      await flushBroadcastPendingCandidates(message.from, peer);
    } else if (message.payload?.kind === "candidate") {
      if (peer.remoteDescription) {
        await peer.addIceCandidate(message.payload.candidate).catch((error) => reportClientError("broadcast_candidate_error", error, { roomId: broadcastRoomId, mediaMode }));
      } else {
        pendingBroadcastCandidates.set(message.from, [...(pendingBroadcastCandidates.get(message.from) || []), message.payload.candidate].slice(-64));
      }
    }
  }

  function relayMimeForStream(stream) {
    const candidates = stream?.getAudioTracks().length
      ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8"]
      : ["video/webm;codecs=vp8", "video/webm;codecs=vp8,opus"];
    return candidates.find((mimeType) => window.MediaRecorder?.isTypeSupported(mimeType)) || "";
  }

  async function stopRelayRecorder() {
    const recorder = relayRecorder;
    relayRecorder = null;
    if (!recorder || recorder.state === "inactive") return;
    await new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
      try { recorder.stop(); } catch { resolve(); }
    });
  }

  async function startRelayRecorder() {
    const mimeType = relayMimeForStream(broadcastStream);
    if (!mimeType) throw new Error("Este navegador não suporta o formato relay WebM VP8.");
    const profile = qualityProfiles[selectedQuality];
    let recorder;
    try {
      recorder = new MediaRecorder(broadcastStream, { mimeType, videoBitsPerSecond: profile.maxBitrate, audioBitsPerSecond: 128_000 });
    } catch (caught) { throw new Error(caught.message || "Não foi possível iniciar a transmissão relay."); }
    relayRecorder = recorder;
    relaySendChain = Promise.resolve();
    recorder.addEventListener("dataavailable", (event) => {
      if (!event.data?.size || recorder !== relayRecorder || broadcastSocket?.readyState !== WebSocket.OPEN) return;
      relaySendChain = relaySendChain.then(async () => {
        if (recorder !== relayRecorder || broadcastSocket.bufferedAmount > 768 * 1024) return;
        broadcastSocket.send(await event.data.arrayBuffer());
      }).catch(() => { if (recorder === relayRecorder) broadcastAudioWarning = "Não foi possível enviar a transmissão relay."; });
    });
    recorder.start(200);
    sendBroadcast({ type: "relay-start", mimeType });
  }

  function connectBroadcastSocket() {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/signal`);
      broadcastSocket = socket;
      let settled = false;
      const handshakeTimeout = window.setTimeout(() => {
        if (settled) return;
        const caught = new Error("A conexão da transmissão demorou para responder.");
        reportClientError("broadcast_socket_connect_timeout", caught, { roomId: broadcastRoomId });
        try { socket.close(); } catch {}
        settled = true;
        reject(caught);
      }, 12_000);
      const resolveConnection = () => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimeout);
        resolve(socket);
      };
      const rejectConnection = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimeout);
        reject(error);
      };
      socket.addEventListener("open", resolveConnection, { once: true });
      socket.addEventListener("error", () => rejectConnection(new Error("Não foi possível conectar ao servidor de transmissão.")), { once: true });
      socket.addEventListener("message", (event) => {
        void (async () => {
          if (typeof event.data !== "string") return;
          let message;
          try {
            message = JSON.parse(event.data);
          } catch {
            return;
          }
          if (message.type === "viewer-joined" && mediaMode === "p2p") {
            await negotiateBroadcastPeer(message.viewerId);
          } else if (message.type === "viewer-left") {
            clearBroadcastPeerRetry(message.viewerId);
            pendingBroadcastCandidates.delete(message.viewerId);
            peerConnections.get(message.viewerId)?.close();
            peerConnections.delete(message.viewerId);
          } else if (message.type === "viewer-count") {
            viewerCount = message.count || 0;
          } else if (message.type === "chat-history") {
            // O histórico não deve disparar sons ao conectar ou reconectar a live.
            broadcastChatMessages = (message.messages || []).filter(Boolean).slice(-100);
            broadcastChatMessageIds = new Set(broadcastChatMessages.map((chatMessage) => chatMessage?.id).filter(Boolean));
            await tick();
            if (broadcastChatListElement) broadcastChatListElement.scrollTop = broadcastChatListElement.scrollHeight;
          } else if (message.type === "chat-message" && message.message) {
            const chatMessage = message.message;
            if (chatMessage.id && !broadcastChatMessageIds.has(chatMessage.id)) {
              broadcastChatMessageIds = new Set([...broadcastChatMessageIds, chatMessage.id]);
              broadcastChatMessages = [...broadcastChatMessages, chatMessage].slice(-100);
              await tick();
              if (broadcastChatListElement) broadcastChatListElement.scrollTop = broadcastChatListElement.scrollHeight;
              const isOwnMessage = chatMessage.userId === user?.id || chatMessage.username === user?.username;
              if (!isOwnMessage) playVoiceSound("message");
            }
          } else if (message.type === "signal" && mediaMode === "p2p") {
            await handleBroadcastSignal(message);
          } else if (message.type === "error") {
            broadcastError = message.message || "O servidor recusou a transmissão.";
            broadcastState = "error";
          }
        })().catch((error) => {
          reportClientError("broadcast_message_error", error, { roomId: broadcastRoomId, mediaMode });
          if (broadcastSocket === socket && broadcastState === "live") {
            broadcastError = error?.message || "A conexão da transmissão encontrou um erro.";
          }
        });
      });
      socket.addEventListener("error", () => reportClientError("broadcast_socket_error", new Error("A conexão da transmissão falhou."), { roomId: broadcastRoomId }));
      socket.addEventListener("close", () => {
        if (!settled) rejectConnection(new Error("A conexão da transmissão foi encerrada antes de conectar."));
        if (broadcastState === "live") {
          reportClientError("broadcast_socket_closed", new Error("A conexão da transmissão foi encerrada."), { roomId: broadcastRoomId });
          broadcastError = "A conexão com o servidor foi encerrada.";
        }
      });
    });
  }

  async function attachBroadcastPreview() {
    await tick();
    if (!broadcastVideo || !broadcastStream) return;
    broadcastVideo.muted = true;
    broadcastVideo.playsInline = true;
    const sourceChanged = broadcastVideo.srcObject !== broadcastStream;
    if (sourceChanged) {
      broadcastVideo.srcObject = broadcastStream;
      if (broadcastVideo.readyState < 1) await new Promise((resolve) => {
          let timeoutId;
          const finish = () => {
            clearTimeout(timeoutId);
            broadcastVideo.removeEventListener("loadedmetadata", finish);
            resolve();
          };
          timeoutId = window.setTimeout(finish, 1_000);
          broadcastVideo.addEventListener("loadedmetadata", finish, { once: true });
        });
    }
    if (!broadcastVideo.paused) return;
    try {
      await broadcastVideo.play();
    } catch (error) {
      reportClientError("broadcast_preview_play_error", error, { roomId: broadcastRoomId });
      notice = "A prévia foi conectada, mas o navegador bloqueou a reprodução automática. Clique no vídeo para reproduzir.";
    }
  }

  function enqueueWindowAudio(chunk) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk?.buffer || chunk || []);
    const frameCount = Math.floor(bytes.byteLength / 4);
    if (!frameCount) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const samples = new Float32Array(frameCount * 2);
    for (let frame = 0; frame < frameCount; frame += 1) {
      samples[frame * 2] = view.getInt16(frame * 4, true) / 32768;
      samples[frame * 2 + 1] = view.getInt16(frame * 4 + 2, true) / 32768;
    }
    windowAudioQueue.push({ samples, frameCount, offset: 0 });
    windowAudioQueuedFrames += frameCount;
    while (windowAudioQueuedFrames > 96000 && windowAudioQueue.length > 1) {
      const discarded = windowAudioQueue.shift();
      windowAudioQueuedFrames -= discarded.frameCount - discarded.offset;
    }
  }

  function fillWindowAudio(event) {
    const left = event.outputBuffer.getChannelData(0);
    const right = event.outputBuffer.numberOfChannels > 1 ? event.outputBuffer.getChannelData(1) : left;
    for (let frame = 0; frame < left.length; frame += 1) {
      const current = windowAudioQueue[0];
      if (!current) {
        left[frame] = 0;
        if (right !== left) right[frame] = 0;
        continue;
      }
      const sampleOffset = current.offset * 2;
      left[frame] = current.samples[sampleOffset] || 0;
      if (right !== left) right[frame] = current.samples[sampleOffset + 1] || 0;
      current.offset += 1;
      windowAudioQueuedFrames -= 1;
      if (current.offset >= current.frameCount) windowAudioQueue.shift();
    }
  }

  async function stopWindowAudioBridge() {
    windowAudioUnsubscribe?.();
    windowAudioUnsubscribe = null;
    windowAudioQueue = [];
    windowAudioQueuedFrames = 0;
    windowAudioProcessor?.disconnect();
    windowAudioProcessor = null;
    windowAudioDestination = null;
    if (windowAudioContext) {
      await windowAudioContext.close().catch(() => {});
      windowAudioContext = null;
    }
    try { await window.miranteDesktop?.stopWindowAudio?.(); } catch {}
  }

  async function startWindowAudioBridge(processId) {
    if (!window.miranteDesktop?.startWindowAudio || !processId) return null;
    await stopWindowAudioBridge();
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("Este app não possui suporte ao áudio isolado da janela.");
    const context = new AudioContextConstructor({ sampleRate: 48000 });
    const destination = context.createMediaStreamDestination();
    const processor = context.createScriptProcessor(4096, 2, 2);
    windowAudioContext = context;
    windowAudioDestination = destination;
    windowAudioProcessor = processor;
    processor.onaudioprocess = fillWindowAudio;
    processor.connect(destination);
    windowAudioUnsubscribe = window.miranteDesktop.onWindowAudioChunk?.(enqueueWindowAudio) || null;
    await context.resume();
    try {
      const result = await window.miranteDesktop.startWindowAudio(processId);
      if (!result?.ok) throw new Error(result?.message || "Não foi possível capturar o áudio da janela.");
      return destination.stream.getAudioTracks()[0] || null;
    } catch (error) {
      await stopWindowAudioBridge();
      throw error;
    }
  }

  async function startSystemAudioBridge() {
    if (!window.miranteDesktop?.startSystemAudio) return null;
    await stopWindowAudioBridge();
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("Este app não possui suporte ao áudio filtrado do computador.");
    const context = new AudioContextConstructor({ sampleRate: 48000 });
    const destination = context.createMediaStreamDestination();
    const processor = context.createScriptProcessor(4096, 2, 2);
    windowAudioContext = context;
    windowAudioDestination = destination;
    windowAudioProcessor = processor;
    processor.onaudioprocess = fillWindowAudio;
    processor.connect(destination);
    windowAudioUnsubscribe = window.miranteDesktop.onWindowAudioChunk?.(enqueueWindowAudio) || null;
    await context.resume();
    try {
      const result = await window.miranteDesktop.startSystemAudio();
      if (!result?.ok) throw new Error(result?.message || "Não foi possível capturar o áudio filtrado do computador.");
      return destination.stream.getAudioTracks()[0] || null;
    } catch (error) {
      await stopWindowAudioBridge();
      throw error;
    }
  }

  async function handleWindowAudioStatus(status = {}) {
    if (!broadcastStream || broadcastState !== "live" || !["ended", "error"].includes(status.status)) return;
    const currentStream = broadcastStream;
    currentStream.getAudioTracks().forEach((track) => track.stop());
    await stopWindowAudioBridge();
    try {
      const fallbackStream = await buildBroadcastOutputStream({
        displayStream: broadcastDisplayStream,
        cameraStream: broadcastCameraStream,
        microphoneStream: broadcastMicrophoneStream,
        sourceAudioTrack: null,
        profile: qualityProfiles[selectedQuality],
      });
      await replaceBroadcastTracks(fallbackStream);
      if (broadcastStream === currentStream) broadcastStream = fallbackStream;
      broadcastAudioWarning = status.status === "ended"
        ? "A captura de áudio da janela foi encerrada. A transmissão de vídeo continua ativa."
        : "A captura de áudio da janela falhou. A transmissão de vídeo continua ativa.";
      reportClientError("window_audio_capture_ended", new Error(broadcastAudioWarning), { status: status.status, processId: activeDisplayProcessId });
    } catch (error) {
      reportClientError("window_audio_fallback_error", error, { status: status.status, processId: activeDisplayProcessId });
    }
  }

  function requestBroadcastStart(sourceType = "screen") {
    if (broadcastState === "live") {
      view = "broadcast";
      notice = "Você já está transmitindo. Use “Voltar à live” ou encerre a transmissão antes de iniciar outra.";
      return;
    }
    if (broadcastState === "starting" || broadcastState === "stopping") {
      notice = broadcastState === "stopping"
        ? "A live anterior ainda está sendo encerrada. Aguarde um instante para iniciar outra."
        : "Sua transmissão ainda está sendo preparada. Aguarde um instante.";
      return;
    }
    if (sourceType !== "camera" && !(view === "groups" && selectedRoom?.kind === "voice" && selectedGroupId)) {
      openPublicBroadcastSetup();
      return;
    }
    pendingBroadcastSourceType = sourceType === "camera" ? "camera" : "screen";
    if (view === "groups" && selectedRoom?.kind === "voice" && selectedGroupId) {
      broadcastVisibility = "private";
      pendingBroadcastContext = { groupId: selectedGroupId, voiceRoomId: selectedRoom.id };
      showBroadcastVisibilityDialog = true;
      return;
    }
    pendingBroadcastContext = null;
    broadcastSourceType = pendingBroadcastSourceType;
    broadcastState = "idle";
    view = "broadcast";
    notice = "Escolha o áudio, a câmera e o microfone. Depois clique em iniciar a transmissão.";
  }

  function openPublicBroadcastSetup() {
    broadcastVisibility = "public";
    publicBroadcastTitle = broadcastTitle || `Transmissão de ${user?.displayName || user?.username || "usuário"}`;
    publicBroadcastSourceKind = "screen";
    publicBroadcastMicrophoneEnabled = false;
    publicBroadcastCameraEnabled = false;
    publicBroadcastCameraDeviceId = broadcastCameraDeviceId || "";
    publicBroadcastQuality = selectedQuality === "high" ? "balanced" : selectedQuality;
    showPublicBroadcastSetup = true;
  }

  function cancelPublicBroadcastSetup() {
    if (broadcastState === "starting") return;
    showPublicBroadcastSetup = false;
  }

  function publicBroadcastAudioLabel(sourceKind = publicBroadcastSourceKind) {
    if (sourceKind === "screen") return isDesktop ? "Áudio do computador, com Telai e Discord excluídos" : "Áudio do computador, conforme o seletor do navegador";
    if (sourceKind === "app") return "Áudio somente do aplicativo escolhido";
    return "Áudio somente da janela escolhida";
  }

  function publicBroadcastSourceLabel(sourceKind = publicBroadcastSourceKind) {
    if (sourceKind === "screen") return "Tela inteira";
    if (sourceKind === "app") return "Aplicativo";
    return "Janela";
  }

  async function confirmPublicBroadcastSetup() {
    const title = publicBroadcastTitle.trim();
    if (!title) {
      broadcastError = "Informe um título para a transmissão.";
      return;
    }
    broadcastError = "";
    broadcastTitle = title;
    selectedQuality = publicBroadcastQuality;
    audioMode = publicBroadcastSourceKind === "screen" ? "system" : "source";
    broadcastMicrophoneEnabled = publicBroadcastMicrophoneEnabled;
    broadcastCameraEnabled = publicBroadcastCameraEnabled;
    broadcastCameraDeviceId = publicBroadcastCameraEnabled ? publicBroadcastCameraDeviceId : "";
    broadcastSelectionKind = publicBroadcastSourceKind;
    showPublicBroadcastSetup = false;
    pendingBroadcastContext = null;
    pendingBroadcastSourceType = "screen";
    broadcastSourceType = "screen";
    broadcastState = "idle";
    view = "broadcast";
    notice = `Escolha a fonte de vídeo para ${publicBroadcastSourceLabel(publicBroadcastSourceKind).toLocaleLowerCase()}.`;
    await beginBroadcast({ sourceType: "screen", visibility: "public", title });
  }

  function waitForPublicBroadcastReview() {
    showPublicBroadcastReview = true;
    return new Promise((resolve, reject) => {
      publicBroadcastReviewSelection = { resolve, reject };
    });
  }

  function confirmPublicBroadcastReview() {
    showPublicBroadcastReview = false;
    publicBroadcastReviewSelection?.resolve(true);
    publicBroadcastReviewSelection = null;
  }

  function cancelPublicBroadcastReview() {
    showPublicBroadcastReview = false;
    publicBroadcastReviewSelection?.reject(new DOMException("Revisão da transmissão cancelada.", "AbortError"));
    publicBroadcastReviewSelection = null;
  }

  function broadcastCaptureErrorMessage(error, sourceType = "screen") {
    const errorName = String(error?.name || "");
    const errorMessage = String(error?.message || "").toLowerCase();
    if (errorName === "NotAllowedError" || errorName === "AbortError" || errorMessage.includes("permission denied")) {
      return sourceType === "camera"
        ? "O acesso à câmera foi recusado ou cancelado. Permita a câmera no navegador e tente novamente."
        : "A seleção da tela foi recusada ou cancelada. Escolha uma janela ou tela e tente novamente.";
    }
    if (errorName === "NotFoundError") {
      return sourceType === "camera"
        ? "Nenhuma câmera disponível foi encontrada. Conecte uma câmera e tente novamente."
        : "Nenhuma tela ou janela disponível foi encontrada. Tente novamente.";
    }
    if (errorName === "NotReadableError") {
      return "O sistema não conseguiu acessar a fonte escolhida. Feche outro aplicativo que esteja usando-a e tente novamente.";
    }
    return error?.message || "Não foi possível iniciar a transmissão. Tente novamente.";
  }

  function broadcastMissingAudioMessage() {
    if (isDesktop) {
      return "O Windows não entregou áudio para esta captura. Verifique se o aplicativo tem volume e tente escolher a tela ou janela novamente.";
    }
    return broadcastDisplaySurface === "screen" || broadcastSelectionKind === "screen"
      ? "O navegador entregou a imagem, mas não o áudio. Ao escolher a tela inteira, marque “Compartilhar áudio do sistema” no seletor do navegador e tente novamente. O filtro Telai/Discord é exclusivo do app Windows."
      : "O navegador entregou a imagem, mas não o áudio. Ao escolher a janela, marque “Compartilhar áudio” no seletor do navegador e tente novamente.";
  }

  function requestCameraBroadcastStart() {
    requestBroadcastStart("camera");
  }

  function captureVideoConstraints(profile, { display = false } = {}) {
    const constraints = {
      width: { ideal: profile.width, max: profile.width },
      height: { ideal: profile.height, max: profile.height },
      frameRate: { ideal: profile.maxFramerate, max: profile.maxFramerate },
    };
    // Alguns Chromium entregam a tela inteira na resolução nativa do monitor
    // e só reduzem depois no encoder. Solicitar o redimensionamento na origem
    // evita trazer 4K para a composição quando a live é 720p/1080p.
    if (display) constraints.resizeMode = { ideal: "crop-and-scale" };
    return constraints;
  }

  function captureSettingsExceedProfile(track, profile) {
    const settings = track?.getSettings?.() || {};
    return [
      [settings.width, profile.width],
      [settings.height, profile.height],
      [settings.frameRate, profile.maxFramerate],
    ].some(([actual, maximum]) => Number.isFinite(Number(actual)) && Number(actual) > maximum + 1);
  }

  async function constrainCapturedVideoTrack(track, profile) {
    if (!track) throw new Error("A fonte escolhida não forneceu vídeo.");
    if (typeof track.applyConstraints !== "function") {
      throw new Error("Seu navegador não permite limitar a captura desta janela. Atualize o navegador e tente novamente.");
    }
    const attempts = [profile, profile === qualityProfiles.economy ? null : qualityProfiles.economy].filter(Boolean);
    let lastError = null;
    for (const attempt of attempts) {
      try {
        await track.applyConstraints(captureVideoConstraints(attempt, { display: true }));
        if (!captureSettingsExceedProfile(track, attempt)) {
          if (attempt !== profile) notice = "A captura foi ajustada para o modo econômico para manter o navegador estável.";
          return attempt;
        }
        lastError = new Error("O navegador manteve a janela acima do limite solicitado.");
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(lastError?.name === "OverconstrainedError"
      ? "O navegador não conseguiu reduzir a resolução desta janela. Escolha Econômica ou feche outros jogos e tente novamente."
      : "Não foi possível preparar a captura desta janela com segurança. Tente novamente em qualidade Econômica.");
  }

  async function constrainCapturedStream(stream, profile) {
    try {
      await constrainCapturedVideoTrack(stream?.getVideoTracks?.()[0], profile);
      return stream;
    } catch (error) {
      stream?.getTracks?.().forEach((track) => track.stop());
      throw error;
    }
  }

  function displayMediaConstraints(profile) {
    const desktopSystemAudio = Boolean(window.miranteDesktop?.isDesktop && audioMode === "system");
    return {
      video: captureVideoConstraints(profile, { display: true }),
      // No desktop, o áudio do computador inteiro passa pelo bridge WASAPI
      // filtrado para não vazar as janelas do Telai e do Discord.
      audio: audioMode === "none" || desktopSystemAudio
        ? false
        : { suppressLocalAudioPlayback: false },
      systemAudio: audioMode === "system" ? "include" : "exclude",
      windowAudio: audioMode === "system" ? "system" : "window",
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
    };
  }

  async function captureDisplayStream(profile) {
    const constraints = displayMediaConstraints(profile);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      return constrainCapturedStream(stream, profile);
    } catch (error) {
      const canUseLegacyDesktopCapture = window.miranteDesktop?.isDesktop
        && typeof window.miranteDesktop.getDisplayMediaSources === "function"
        && ["NotSupportedError", "NotReadableError", "TypeError"].includes(error?.name);
      if (!canUseLegacyDesktopCapture) throw error;
    }

    // Compatibilidade para versões do Windows/Electron que não conseguem
    // iniciar o fluxo moderno de getDisplayMedia.
    const sources = await window.miranteDesktop.getDisplayMediaSources();
    if (!sources?.length) throw new Error("Nenhuma tela ou janela disponível para compartilhar.");
    const source = await new Promise((resolve, reject) => {
      displaySources = sources;
      displaySourceFilter = broadcastSelectionKind === "screen" ? "screen" : "window";
      showDisplayPicker = true;
      displaySourceSelection = { resolve, reject };
    });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // O fallback legado precisa pedir explicitamente o loopback do
        // desktop; sem esta trilha a tela inteira chega ao WebRTC sem áudio.
        audio: audioMode === "system" && !window.miranteDesktop?.isDesktop
          ? { mandatory: { chromeMediaSource: "desktop" } }
          : false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: source.id,
            minWidth: profile.width,
            maxWidth: profile.width,
            minHeight: profile.height,
            maxHeight: profile.height,
            maxFrameRate: profile.maxFramerate,
          },
        },
      });
      return constrainCapturedStream(stream, profile);
    } catch (error) {
      if (!["NotSupportedError", "NotReadableError", "TrackStartError"].includes(error?.name)) throw error;
      throw new Error("O sistema não conseguiu iniciar a captura desta tela ou janela. Tente novamente ou atualize o aplicativo.");
    } finally {
      showDisplayPicker = false;
      displaySources = [];
      displaySourceFilter = "all";
    }
  }

  async function refreshBroadcastDevices() {
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      permissionStream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      if (error?.name !== "NotAllowedError") reportClientError("broadcast_camera_permission_refresh", error);
    }
    await loadAudioDevices(true);
  }

  async function captureBroadcastMicrophoneStream() {
    const requestedInputDeviceId = selectedInputDeviceId;
    const rawStream = await navigator.mediaDevices.getUserMedia({ audio: selectedVoiceAudioConstraints(), video: false });
    const microphoneTrack = rawStream.getAudioTracks()[0];
    if (!microphoneTrack) {
      rawStream.getTracks().forEach((track) => track.stop());
      throw new Error("Nenhum microfone foi encontrado para a transmissão.");
    }
    try {
      rememberCapturedInputDevice(microphoneTrack, requestedInputDeviceId);
      // A transmissão usa o mesmo microfone já capturado, sem criar um
      // segundo pipeline de processamento de áudio.
      const processedStream = await processVoiceInputStream(rawStream);
      broadcastMicrophoneStream = processedStream;
      return processedStream;
    } catch (error) {
      stopVoiceInputStream(rawStream);
      throw error;
    }
  }

  async function captureBroadcastCameraStream(profile) {
    const video = captureVideoConstraints(profile);
    if (broadcastCameraDeviceId) video.deviceId = { exact: broadcastCameraDeviceId };
    const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error("A câmera escolhida não forneceu vídeo.");
    }
    return stream;
  }

  async function stopBroadcastAudioMix() {
    const destination = broadcastAudioMixDestination;
    broadcastAudioMixDestination = null;
    try { destination?.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
    const context = broadcastAudioMixContext;
    broadcastAudioMixContext = null;
    try { await context?.close?.(); } catch {}
  }

  async function mixBroadcastAudio(...tracks) {
    const audioTracks = tracks.filter(Boolean);
    await stopBroadcastAudioMix();
    if (!audioTracks.length) return null;
    if (audioTracks.length === 1) return audioTracks[0];
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return audioTracks[0];
    const context = new AudioContextConstructor({ latencyHint: "interactive" });
    try {
      await context.resume();
      const destination = context.createMediaStreamDestination();
      audioTracks.forEach((track) => {
        const source = context.createMediaStreamSource(new MediaStream([track]));
        const gain = context.createGain();
        gain.gain.value = 1;
        source.connect(gain).connect(destination);
      });
      broadcastAudioMixContext = context;
      broadcastAudioMixDestination = destination;
      return destination.stream.getAudioTracks()[0] || audioTracks[0];
    } catch (error) {
      try { await context.close(); } catch {}
      reportClientError("broadcast_audio_mix_fallback", error, { trackCount: audioTracks.length });
      return audioTracks[0];
    }
  }

  async function waitForBroadcastVideoFrame(video, label) {
    const hasFrame = () => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
    if (hasFrame()) return;
    await new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => finish(new Error(`A fonte ${label} não entregou um frame de vídeo.`)), 5000);
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        video.removeEventListener("loadedmetadata", check);
        video.removeEventListener("loadeddata", check);
        video.removeEventListener("canplay", check);
        video.removeEventListener("playing", check);
      };
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const check = () => {
        if (hasFrame()) finish();
      };
      video.addEventListener("loadedmetadata", check);
      video.addEventListener("loadeddata", check);
      video.addEventListener("canplay", check);
      video.addEventListener("playing", check);
      if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(check);
      check();
    });
  }

  async function createBroadcastVideoComposition(displayStream, cameraStream, profile, cameraPosition = broadcastCameraPosition) {
    const displayTrack = displayStream?.getVideoTracks?.()[0] || null;
    const cameraTrack = cameraStream?.getVideoTracks?.()[0] || null;
    if (!displayTrack && !cameraTrack) throw new Error("A transmissão não recebeu uma fonte de vídeo.");
    const displaySettings = displayTrack?.getSettings?.() || {};
    const displayWidth = Number(displaySettings.width);
    const displayHeight = Number(displaySettings.height);
    const hasDisplayDimensions = Number.isFinite(displayWidth) && Number.isFinite(displayHeight);
    const needsDisplayDownscale = Boolean(displayTrack && (
      !hasDisplayDimensions || displayWidth > profile.width + 1 || displayHeight > profile.height + 1
    ));
    // Sem compartilhamento de tela não há composição para fazer: preserve a
    // trilha da câmera e evite criar um canvas desnecessário.
    if (!displayTrack && cameraTrack) return cameraTrack;
    // Quando a tela já está dentro do perfil e não há câmera para sobrepor,
    // mantenha a trilha original. Em monitores 4K, porém, o Chromium pode
    // ignorar o maxWidth/maxHeight da captura; nesse caso a tela precisa
    // passar por uma composição limitada antes de chegar ao WebRTC.
    if (!cameraTrack && !needsDisplayDownscale) return displayTrack || cameraTrack;
    if (typeof HTMLCanvasElement === "undefined" || typeof document.createElement("canvas").captureStream !== "function") {
      throw new Error("Este navegador não permite combinar a tela com a câmera.");
    }
    const displayVideo = document.createElement("video");
    const cameraVideo = document.createElement("video");
    const canvas = document.createElement("canvas");
    let outputStream = null;
    let composition = null;
    // Nunca crie um canvas com as dimensões nativas do monitor. Em uma tela
    // 3840x2160 isso duplicava o custo de composição antes do encoder,
    // mesmo quando a live estava configurada para 1080p.
    const width = Math.max(320, Math.round(profile.width));
    const height = Math.max(180, Math.round(profile.height));
    canvas.width = width;
    canvas.height = height;
    const compositionVideos = [displayTrack ? displayVideo : null, cameraTrack ? cameraVideo : null].filter(Boolean);
    for (const video of compositionVideos) {
      video.className = "telai-broadcast-composition-video";
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.position = "fixed";
      video.style.left = "-10000px";
      video.style.top = "-10000px";
      video.style.width = "320px";
      video.style.height = "180px";
      video.style.opacity = "0";
      video.style.pointerEvents = "none";
      document.body.appendChild(video);
    }
    try {
      if (displayTrack) displayVideo.srcObject = displayStream;
      if (cameraTrack) cameraVideo.srcObject = cameraStream;
      await Promise.all(compositionVideos.map((video) => video.play()));
      await Promise.all([
        ...(displayTrack ? [waitForBroadcastVideoFrame(displayVideo, "a tela compartilhada")] : []),
        ...(cameraTrack ? [waitForBroadcastVideoFrame(cameraVideo, "a câmera")] : []),
      ]);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar a composição da câmera.");
      const cameraSettings = cameraTrack?.getSettings?.() || {};
      const cameraWidth = cameraTrack ? Math.max(160, Math.round(width * 0.27)) : 0;
      const cameraHeight = cameraTrack
        ? Math.max(90, Math.round(cameraWidth * (Number(cameraSettings.height) / Math.max(Number(cameraSettings.width), 1) || 9 / 16)))
        : 0;
      const margin = Math.max(18, Math.round(width * 0.018));
      const frameInterval = 1000 / Math.max(1, Number(profile.maxFramerate) || 30);
      let lastDrawAt = -Infinity;
      const draw = (timestamp = performance.now()) => {
        if (broadcastVideoComposition !== composition) return;
        if (timestamp - lastDrawAt >= frameInterval - 0.5) {
          lastDrawAt = timestamp;
          context.fillStyle = "#050a14";
          context.fillRect(0, 0, width, height);
          if (displayVideo.readyState >= 2 && displayVideo.videoWidth > 0) {
            context.drawImage(displayVideo, 0, 0, width, height);
          }
          if (cameraTrack) {
            const position = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(cameraPosition) ? cameraPosition : "bottom-right";
            const x = position.endsWith("right") ? width - cameraWidth - margin : margin;
            const y = position.startsWith("bottom") ? height - cameraHeight - margin : margin;
            context.save();
            context.fillStyle = "rgba(5, 10, 20, .9)";
            context.beginPath();
            context.roundRect?.(x - 6, y - 6, cameraWidth + 12, cameraHeight + 12, 14);
            if (!context.roundRect) context.rect(x - 6, y - 6, cameraWidth + 12, cameraHeight + 12);
            context.fill();
            context.restore();
            if (cameraVideo.readyState >= 2 && cameraVideo.videoWidth > 0) context.drawImage(cameraVideo, x, y, cameraWidth, cameraHeight);
          }
        }
        broadcastVideoComposition.rafId = window.requestAnimationFrame(draw);
      };
      outputStream = canvas.captureStream(profile.maxFramerate);
      const outputTrack = outputStream.getVideoTracks()[0];
      composition = { canvas, context, displayVideo, cameraVideo, videos: compositionVideos, outputStream, outputTrack, rafId: 0 };
      // A troca de fonte pode acontecer enquanto a composição anterior ainda
      // existe. Só a descarte depois que a nova composição estiver pronta, para
      // que uma falha preserve a live atual e não deixe elementos órfãos.
      stopBroadcastVideoComposition(composition);
      broadcastVideoComposition = composition;
      draw();
      return outputTrack;
    } catch (error) {
      if (broadcastVideoComposition === composition && composition) {
        broadcastVideoComposition = null;
        if (composition.rafId) window.cancelAnimationFrame(composition.rafId);
        try { composition.outputStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      }
      try { outputStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      for (const video of compositionVideos) {
        try { video.pause(); video.srcObject = null; video.remove(); } catch {}
      }
      throw error;
    }
  }

  function stopBroadcastVideoComposition(preserve = null) {
    const composition = broadcastVideoComposition;
    broadcastVideoComposition = null;
    if (composition && composition !== preserve) {
      if (composition.rafId) window.cancelAnimationFrame(composition.rafId);
      try { composition.outputStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
    }
    const videos = new Set([
      ...(composition && composition !== preserve ? composition.videos || [composition.displayVideo, composition.cameraVideo] : []),
      ...document.querySelectorAll("video.telai-broadcast-composition-video"),
    ]);
    for (const video of videos) {
      if (preserve?.videos?.includes(video)) continue;
      try { video.pause(); video.srcObject = null; video.remove(); } catch {}
    }
  }

  async function buildBroadcastOutputStream({ displayStream = null, cameraStream = null, sourceAudioTrack = null, microphoneStream = null, profile, cameraPosition = broadcastCameraPosition }) {
    const videoTrack = await createBroadcastVideoComposition(displayStream, cameraStream, profile, cameraPosition);
    const microphoneTrack = microphoneStream?.getAudioTracks?.()[0] || null;
    const audioTrack = await mixBroadcastAudio(sourceAudioTrack, microphoneTrack);
    return new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]);
  }

  function openLeaveGroupDialog() {
    if (!selectedGroupId || selectedGroup?.role === "owner") return;
    leaveGroupError = "";
    showLeaveGroupDialog = true;
  }

  async function leaveSelectedGroup() {
    if (!selectedGroupId || selectedGroup?.role === "owner" || leaveGroupBusy) return;
    leaveGroupBusy = true;
    leaveGroupError = "";
    const leavingGroupName = selectedGroup?.name || "o grupo";
    try {
      if (voiceState === "connected") leaveVoiceRoom();
      await api(`/api/groups/${encodeURIComponent(selectedGroupId)}/membership`, { method: "DELETE" });
      groups = groups.filter((group) => group.id !== selectedGroupId);
      groupOverview = null;
      selectedRoomId = null;
      selectedGroupId = groups[0]?.id || null;
      showLeaveGroupDialog = false;
      if (selectedGroupId) await loadGroup(selectedGroupId);
      else view = "home";
      notice = `Você saiu de ${leavingGroupName}.`;
    } catch (error) {
      leaveGroupError = error.message || "Não foi possível sair do grupo agora.";
    } finally {
      leaveGroupBusy = false;
    }
  }

  async function replaceBroadcastTracks(nextStream) {
    const nextTracks = {
      video: nextStream?.getVideoTracks()[0] || null,
      audio: nextStream?.getAudioTracks()[0] || null,
    };
    const operations = [];
    let audioTrackAdded = false;
    for (const peer of peerConnections.values()) {
      for (const [kind, track] of Object.entries(nextTracks)) {
        const senders = peer.getSenders().filter((candidate) => candidate.track?.kind === kind);
        const reservedSender = kind === "audio"
          ? peer.getTransceivers?.().find((transceiver) => transceiver.sender?.track?.kind === kind || transceiver.receiver?.track?.kind === kind)?.sender
          : null;
        const [sender, ...duplicates] = senders.length ? senders : (reservedSender ? [reservedSender] : []);
        if (sender) operations.push(sender.replaceTrack(track));
        else if (track) {
          peer.addTrack(track, nextStream);
          if (kind === "audio") audioTrackAdded = true;
        }
        for (const duplicate of duplicates) operations.push(duplicate.replaceTrack(null));
      }
    }
    await Promise.all(operations);
    if (nextTracks.audio && mediaMode === "p2p") {
      // Quando a live começou sem áudio, o m-line reservado precisa receber
      // uma oferta atualizada para o viewer começar a entregar a nova faixa.
      // Também cobre navegadores que não propagam replaceTrack(null -> live)
      // sem renegociação explícita.
      audioTrackAdded = true;
    }
    if (audioTrackAdded) {
      await Promise.all([...peerConnections.keys()].map(async (viewerId) => {
        const peer = peerConnections.get(viewerId);
        if (!peer || ["closed", "failed"].includes(peer.connectionState) || peer.signalingState !== "stable") return;
        await negotiateBroadcastPeer(viewerId);
      }));
    }
  }

  async function rebuildBroadcastOutput({ cameraStream = broadcastCameraStream, microphoneStream = broadcastMicrophoneStream, sourceAudioTrack = broadcastSourceAudioTrack, cameraPosition = broadcastCameraPosition } = {}) {
    if (broadcastState !== "live" || broadcastMediaSwitching) return false;
    const previousStream = broadcastStream;
    const previousComposition = broadcastVideoComposition;
    const wasRelay = mediaMode === "relay" && relayRecorder?.state === "recording";
    let nextStream = null;
    broadcastMediaSwitching = true;
    try {
      nextStream = await buildBroadcastOutputStream({
        displayStream: broadcastDisplayStream,
        cameraStream,
        sourceAudioTrack,
        microphoneStream,
        cameraPosition,
        profile: qualityProfiles[selectedQuality],
      });
      // Quando a câmera é removida, a composição antiga não é descartada
      // automaticamente porque a nova saída usa diretamente a tela.
      if (!cameraStream && previousComposition) stopBroadcastVideoComposition();
      if (wasRelay) await stopRelayRecorder();
      await replaceBroadcastTracks(nextStream);
      broadcastStream = nextStream;
      broadcastSourceAudioTrack = sourceAudioTrack;
      await attachBroadcastPreview();
      if (wasRelay) await startRelayRecorder();
      const activeSourceTracks = new Set([
        ...(broadcastDisplayStream?.getTracks?.() || []),
        ...(broadcastCameraStream?.getTracks?.() || []),
        ...(broadcastMicrophoneStream?.getTracks?.() || []),
      ]);
      if (previousStream && previousStream !== nextStream) previousStream.getTracks().forEach((track) => {
        if (!activeSourceTracks.has(track)) track.stop();
      });
      return true;
    } catch (error) {
      if (wasRelay && !relayRecorder && broadcastStream) {
        try { await startRelayRecorder(); } catch (relayError) { reportClientError("broadcast_relay_restart_error", relayError, { mediaMode }); }
      }
      nextStream?.getTracks?.().forEach((track) => track.stop());
      broadcastError = error.message || "Não foi possível atualizar os dispositivos da transmissão.";
      reportClientError("broadcast_media_switch_error", error, { camera: Boolean(cameraStream), microphone: Boolean(microphoneStream) });
      return false;
    } finally {
      broadcastMediaSwitching = false;
    }
  }

  async function handleBroadcastCameraChange(event) {
    const requestedDeviceId = String(event.currentTarget?.value || "");
    const previousCameraDeviceId = broadcastCameraDeviceId;
    const previousCameraEnabled = broadcastCameraEnabled;
    broadcastCameraDeviceId = requestedDeviceId;
    if (!requestedDeviceId && broadcastSourceType === "screen") broadcastCameraEnabled = false;
    if (broadcastState !== "live") return;
    if (broadcastSourceType === "camera" && !requestedDeviceId) {
      broadcastError = "A transmissão por câmera precisa manter uma câmera selecionada.";
      return;
    }
    if (broadcastSourceType === "screen" && !broadcastCameraEnabled && requestedDeviceId) {
      notice = "Câmera selecionada. Ative “Incluir minha câmera” para adicioná-la à transmissão.";
      return;
    }
    const previousCameraStream = broadcastCameraStream;
    let nextCameraStream = null;
    try {
      if (requestedDeviceId) nextCameraStream = await captureBroadcastCameraStream(qualityProfiles[selectedQuality]);
      const applied = await rebuildBroadcastOutput({ cameraStream: nextCameraStream });
      if (!applied) {
        if (nextCameraStream) nextCameraStream.getTracks().forEach((track) => track.stop());
        broadcastCameraEnabled = previousCameraEnabled;
        return;
      }
      broadcastCameraStream = nextCameraStream;
      previousCameraStream?.getTracks?.().forEach((track) => track.stop());
      notice = requestedDeviceId ? "Câmera trocada sem interromper a live." : "Câmera removida sem interromper a live.";
    } catch (error) {
      nextCameraStream?.getTracks?.().forEach((track) => track.stop());
      broadcastCameraDeviceId = previousCameraDeviceId;
      broadcastCameraEnabled = previousCameraEnabled;
      broadcastError = error.message || "Não foi possível trocar a câmera.";
      reportClientError("broadcast_camera_switch_error", error, { deviceId: requestedDeviceId });
    }
  }

  async function handleBroadcastCameraToggle(event) {
    const requestedEnabled = Boolean(event.currentTarget?.checked);
    const previousEnabled = broadcastCameraEnabled;
    const previousCameraStream = broadcastCameraStream;
    broadcastCameraEnabled = requestedEnabled;
    if (broadcastState !== "live") return;
    let nextCameraStream = null;
    try {
      if (requestedEnabled) nextCameraStream = await captureBroadcastCameraStream(qualityProfiles[selectedQuality]);
      const applied = await rebuildBroadcastOutput({ cameraStream: nextCameraStream });
      if (!applied) {
        broadcastCameraEnabled = previousEnabled;
        nextCameraStream?.getTracks?.().forEach((track) => track.stop());
        return;
      }
      broadcastCameraStream = nextCameraStream;
      previousCameraStream?.getTracks?.().forEach((track) => track.stop());
      notice = requestedEnabled ? "Câmera incluída na transmissão." : "Câmera removida da transmissão.";
    } catch (error) {
      broadcastCameraEnabled = previousEnabled;
      nextCameraStream?.getTracks?.().forEach((track) => track.stop());
      broadcastError = error.message || "Não foi possível atualizar a câmera.";
      reportClientError("broadcast_camera_toggle_error", error, { enabled: requestedEnabled, deviceId: broadcastCameraDeviceId });
    }
  }

  async function handleBroadcastCameraPositionChange(event) {
    const positions = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
    const requestedPosition = String(event.currentTarget?.value || "bottom-right");
    if (!positions.has(requestedPosition)) return;
    const previousPosition = broadcastCameraPosition;
    broadcastCameraPosition = requestedPosition;
    if (broadcastState !== "live" || broadcastSourceType !== "screen" || !broadcastCameraStream) return;
    const applied = await rebuildBroadcastOutput({ cameraPosition: requestedPosition });
    if (!applied) {
      broadcastCameraPosition = previousPosition;
      return;
    }
    notice = "Posição da câmera atualizada sem interromper a live.";
  }

  async function handleBroadcastMicrophoneChange(event) {
    if (event.currentTarget?.classList?.contains("broadcast-microphone-enabled")) {
      broadcastMicrophoneEnabled = Boolean(event.currentTarget.checked);
    } else {
      selectedInputDeviceId = String(event.currentTarget?.value || "");
    }
    if (broadcastState !== "live") return;
    const previousMicrophoneStream = broadcastMicrophoneStream;
    let nextMicrophoneStream = null;
    try {
      if (broadcastMicrophoneEnabled) nextMicrophoneStream = await captureBroadcastMicrophoneStream();
      const applied = await rebuildBroadcastOutput({ microphoneStream: nextMicrophoneStream });
      if (!applied) {
        if (nextMicrophoneStream) stopVoiceInputStream(nextMicrophoneStream);
        return;
      }
      broadcastMicrophoneStream = nextMicrophoneStream;
      if (previousMicrophoneStream && previousMicrophoneStream !== nextMicrophoneStream) stopVoiceInputStream(previousMicrophoneStream);
      notice = broadcastMicrophoneEnabled
        ? "Microfone trocado sem interromper a live."
        : "Microfone desativado sem interromper a live.";
    } catch (error) {
      nextMicrophoneStream && stopVoiceInputStream(nextMicrophoneStream);
      broadcastMicrophoneStream = previousMicrophoneStream;
      broadcastMicrophoneEnabled = Boolean(previousMicrophoneStream);
      broadcastError = error.message || "Não foi possível trocar o microfone.";
      reportClientError("broadcast_microphone_switch_error", error, { requestedDeviceId: selectedInputDeviceId });
    }
  }

  async function handleBroadcastAudioModeChange(event) {
    const previousAudioMode = audioMode;
    audioMode = String(event.currentTarget?.value || "source");
    if (broadcastState !== "live" || broadcastSourceType !== "screen") return;
    const applied = await applyLiveBroadcastAudioMode();
    if (!applied) {
      audioMode = previousAudioMode;
      broadcastError ||= "A fonte não foi trocada; o áudio anterior continua ativo.";
    }
  }

  async function applyLiveBroadcastAudioMode() {
    if (broadcastState !== "live" || broadcastSourceType !== "screen") return false;
    if (broadcastSourceSwitching || broadcastMediaSwitching) return false;
    let sourceAudioTrack = null;
    try {
      if (audioMode === "none") {
        await stopWindowAudioBridge();
        broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
      } else if (audioMode === "source") {
        if (broadcastDisplaySurface === "screen") {
          const selectedAudioSource = await requestBroadcastAudioSource();
          if (selectedAudioSource?.processId && window.miranteDesktop?.isDesktop) {
            broadcastAudioProcessId = selectedAudioSource.processId;
            broadcastAudioSourceName = selectedAudioSource.name;
            broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
            sourceAudioTrack = await startWindowAudioBridge(selectedAudioSource.processId);
          } else {
            audioMode = "none";
            await stopWindowAudioBridge();
            broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
            broadcastAudioWarning = "Nenhum aplicativo disponível para o áudio isolado. A live continuará sem áudio do computador.";
          }
        } else if (window.miranteDesktop?.isDesktop && activeDisplayProcessId) {
          sourceAudioTrack = await startWindowAudioBridge(activeDisplayProcessId);
          broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
        } else {
          sourceAudioTrack = broadcastDisplayStream?.getAudioTracks?.()[0] || null;
        }
      } else {
        if (window.miranteDesktop?.isDesktop) {
          broadcastDisplayStream?.getAudioTracks?.().forEach((track) => track.stop());
          try {
            sourceAudioTrack = await startSystemAudioBridge();
            if (!sourceAudioTrack) throw new Error("O Windows não encontrou aplicativos para incluir no áudio filtrado.");
          } catch (error) {
            audioMode = "none";
            sourceAudioTrack = null;
            broadcastAudioWarning = `${error.message || "Não foi possível preparar o áudio filtrado."} A live continuará sem áudio do computador.`;
          }
        } else {
          sourceAudioTrack = broadcastDisplayStream?.getAudioTracks?.()[0] || null;
          if (!sourceAudioTrack) throw new Error(broadcastMissingAudioMessage());
          await stopWindowAudioBridge();
        }
      }
      const applied = await rebuildBroadcastOutput({ sourceAudioTrack });
      if (applied) {
        broadcastSourceAudioTrack = sourceAudioTrack;
        notice = audioMode === "none"
          ? "Áudio do computador desativado sem interromper a live."
          : "Áudio da transmissão atualizado sem interromper a live.";
      }
      return applied;
    } catch (error) {
      reportClientError("broadcast_audio_switch_error", error, { audioMode });
      broadcastError = error.message || "Não foi possível trocar o áudio da transmissão.";
      return false;
    }
  }

  async function switchBroadcastSource() {
    if (broadcastState !== "live" || broadcastSourceType !== "screen" || broadcastSourceSwitching) return;
    broadcastSourceSwitching = true;
    broadcastError = "";
    broadcastAudioWarning = "";
    const previousStream = broadcastStream;
    const previousDisplayStream = broadcastDisplayStream;
    const previousCameraStream = broadcastCameraStream;
    const previousProcessId = activeDisplayProcessId;
    const previousAudioMode = audioMode;
    const wasRelay = mediaMode === "relay" && relayRecorder?.state === "recording";
    let capturedStream = null;
    let nextStream = null;
    try {
      const profile = qualityProfiles[selectedQuality];
      capturedStream = await captureDisplayStream(profile);
      const nextVideoTrack = capturedStream.getVideoTracks()[0];
      if (!nextVideoTrack) throw new Error("A nova fonte não forneceu vídeo.");
      const displaySurface = nextVideoTrack.getSettings?.().displaySurface;
      if (displaySurface === "monitor" || displaySurface === "screen") {
        broadcastDisplaySurface = "screen";
      } else if (displaySurface) {
        broadcastDisplaySurface = "window";
      }
      const nextProcessId = selectedDisplayProcessId;
      let sourceAudioTrack = audioMode === "none" ? null : capturedStream.getAudioTracks()[0] || null;
      if (window.miranteDesktop?.isDesktop && audioMode === "system") {
        capturedStream.getAudioTracks().forEach((track) => track.stop());
        try {
          sourceAudioTrack = await startSystemAudioBridge();
          if (!sourceAudioTrack) throw new Error("O Windows não encontrou aplicativos para incluir no áudio filtrado.");
        } catch (error) {
          audioMode = "none";
          sourceAudioTrack = null;
          broadcastAudioWarning = `${error.message || "Não foi possível preparar o áudio filtrado."} A troca seguirá sem áudio do computador.`;
        }
      } else if (window.miranteDesktop?.isDesktop && audioMode === "source" && broadcastDisplaySurface === "screen") {
        const selectedAudioSource = await requestBroadcastAudioSource();
        capturedStream.getAudioTracks().forEach((track) => track.stop());
        if (selectedAudioSource?.processId) {
          broadcastAudioProcessId = selectedAudioSource.processId;
          broadcastAudioSourceName = selectedAudioSource.name;
          sourceAudioTrack = await startWindowAudioBridge(selectedAudioSource.processId);
        } else {
          await stopWindowAudioBridge();
          audioMode = "none";
          sourceAudioTrack = null;
          broadcastAudioWarning = "A troca seguirá sem áudio do computador. Escolha um aplicativo para incluir somente o áudio dele.";
        }
      } else if (window.miranteDesktop?.isDesktop && audioMode === "source") {
        if (nextProcessId) {
          const windowAudioTrack = await startWindowAudioBridge(nextProcessId);
          capturedStream.getAudioTracks().forEach((track) => track.stop());
          sourceAudioTrack = windowAudioTrack || null;
        } else {
          await stopWindowAudioBridge();
          capturedStream.getAudioTracks().forEach((track) => track.stop());
          sourceAudioTrack = null;
          broadcastAudioWarning = "Não foi possível identificar o processo da janela. A troca seguirá sem áudio da fonte para não capturar o computador inteiro.";
        }
      } else if (window.miranteDesktop?.isDesktop) {
        await stopWindowAudioBridge();
      }
      if (audioMode !== "none" && !sourceAudioTrack && !isDesktop) {
        throw new Error(broadcastMissingAudioMessage());
      }
      nextStream = await buildBroadcastOutputStream({
        displayStream: capturedStream,
        cameraStream: previousCameraStream,
        sourceAudioTrack,
        microphoneStream: broadcastMicrophoneStream,
        profile,
      });
      if (wasRelay) await stopRelayRecorder();
      await replaceBroadcastTracks(nextStream);
      broadcastStream = nextStream;
      broadcastDisplayStream = capturedStream;
      broadcastSourceAudioTrack = sourceAudioTrack;
      activeDisplayProcessId = nextProcessId;
      nextVideoTrack.contentHint = "detail";
      nextVideoTrack.addEventListener("ended", () => { handleBroadcastVideoTrackEnded(nextVideoTrack); }, { once: true });
      clearBroadcastCaptureRecoveryTimer();
      previousStream?.getTracks().forEach((track) => track.stop());
      if (previousDisplayStream && previousDisplayStream !== capturedStream) previousDisplayStream.getTracks().forEach((track) => track.stop());
      await attachBroadcastPreview();
      if (wasRelay) await startRelayRecorder();
      notice = "Fonte da transmissão trocada sem encerrar a live.";
      return true;
    } catch (error) {
      capturedStream?.getTracks().forEach((track) => track.stop());
      stopBroadcastVideoComposition();
      if (previousStream && broadcastState === "live") {
        try {
          let restoredSourceAudioTrack = audioMode === "none" ? null : broadcastSourceAudioTrack || previousDisplayStream?.getAudioTracks?.()[0] || null;
          if (window.miranteDesktop?.isDesktop && previousAudioMode === "system") {
            try { restoredSourceAudioTrack = await startSystemAudioBridge(); } catch {}
          } else if (window.miranteDesktop?.isDesktop && audioMode === "source" && previousProcessId) {
            restoredSourceAudioTrack = await startWindowAudioBridge(previousProcessId);
          }
          const restoredStream = await buildBroadcastOutputStream({
            displayStream: previousDisplayStream,
            cameraStream: previousCameraStream,
            sourceAudioTrack: restoredSourceAudioTrack,
            microphoneStream: broadcastMicrophoneStream,
            profile: qualityProfiles[selectedQuality],
          });
          await replaceBroadcastTracks(restoredStream);
          broadcastStream = restoredStream;
          broadcastDisplayStream = previousDisplayStream;
          broadcastSourceAudioTrack = restoredSourceAudioTrack;
          broadcastCameraStream = previousCameraStream;
          activeDisplayProcessId = previousProcessId;
          await attachBroadcastPreview();
          if (wasRelay) await startRelayRecorder();
        } catch (restoreError) {
          broadcastError = restoreError.message || "Não foi possível restaurar a transmissão anterior.";
        }
      }
      if (error.name !== "NotAllowedError") broadcastError = error.message || "Não foi possível trocar a fonte da transmissão.";
      return false;
    } finally {
      showDisplayPicker = false;
      displaySources = [];
      selectedDisplayProcessId = activeDisplayProcessId;
      broadcastSourceSwitching = false;
    }
  }

  function cancelBroadcastVisibility() {
    showBroadcastVisibilityDialog = false;
    pendingBroadcastContext = null;
  }

  function confirmBroadcastVisibility() {
    const context = pendingBroadcastContext || {};
    const sourceType = pendingBroadcastSourceType;
    const nextContext = { ...context, visibility: broadcastVisibility };
    showBroadcastVisibilityDialog = false;
    pendingBroadcastContext = nextContext;
    broadcastSourceType = sourceType;
    broadcastState = "idle";
    view = "broadcast";
    notice = "Escolha uma tela, janela ou aplicativo para iniciar a transmissão.";
    void tick().then(() => beginBroadcast({ sourceType, ...nextContext }));
  }

  async function beginBroadcast(options = {}) {
    if (broadcastState === "live") {
      await returnToBroadcast();
      notice = "Você já está transmitindo. Encerre a live atual antes de iniciar outra.";
      return;
    }
    if (broadcastState === "starting" || broadcastState === "stopping") {
      notice = broadcastState === "stopping"
        ? "A live anterior ainda está sendo encerrada. Aguarde um instante para iniciar outra."
        : "Sua transmissão ainda está sendo preparada. Aguarde um instante.";
      return;
    }
    const visibility = options.visibility === "private" ? "private" : "public";
    if (options.title) broadcastTitle = String(options.title).trim().slice(0, 120);
    const groupId = visibility === "private" ? options.groupId || null : null;
    const voiceRoomId = visibility === "private" ? options.voiceRoomId || null : null;
    const sourceType = options.sourceType === "camera" ? "camera" : "screen";
    pendingBroadcastContext = null;
    broadcastError = "";
    broadcastAudioWarning = "";
    broadcastChatMessages = [];
    broadcastChatMessageIds = new Set();
    broadcastChatDraft = "";
    broadcastSourceType = sourceType;
    broadcastDisplaySurface = null;
    selectedDisplayProcessId = null;
    broadcastDisplayStream = null;
    broadcastCameraStream = null;
    broadcastSourceAudioTrack = null;
    broadcastAudioProcessId = null;
    broadcastAudioSourceName = "";
    broadcastMicrophoneStream = null;
    broadcastState = "starting";
    view = "broadcast";
    try {
      if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) throw new Error("A captura de tela exige HTTPS ou localhost.");
      const profile = qualityProfiles[selectedQuality];
      let sourceAudioTrack = null;
      if (sourceType === "camera") {
        broadcastCameraStream = await captureBroadcastCameraStream(profile);
      } else {
        broadcastDisplayStream = await captureDisplayStream(profile);
        const displaySurface = broadcastDisplayStream.getVideoTracks?.()[0]?.getSettings?.().displaySurface;
        if (displaySurface === "monitor" || displaySurface === "screen") broadcastDisplaySurface = "screen";
        else if (displaySurface) broadcastDisplaySurface = "window";
        const capturedAudioTracks = broadcastDisplayStream.getAudioTracks();
        sourceAudioTrack = audioMode === "none" ? null : capturedAudioTracks[0] || null;
        if (audioMode === "system" && window.miranteDesktop?.isDesktop) {
          capturedAudioTracks.forEach((track) => track.stop());
          try {
            sourceAudioTrack = await startSystemAudioBridge();
            if (!sourceAudioTrack) throw new Error("O Windows não encontrou aplicativos para incluir no áudio filtrado.");
          } catch (error) {
            audioMode = "none";
            sourceAudioTrack = null;
            broadcastAudioWarning = `${error.message || "Não foi possível preparar o áudio filtrado."} A transmissão continuará sem áudio do computador.`;
          }
        } else if (broadcastDisplaySurface === "screen" && audioMode === "source" && window.miranteDesktop?.isDesktop) {
          const selectedAudioSource = await requestBroadcastAudioSource();
          if (selectedAudioSource?.processId) {
            broadcastAudioProcessId = selectedAudioSource.processId;
            broadcastAudioSourceName = selectedAudioSource.name;
            const applicationAudioTrack = await startWindowAudioBridge(selectedAudioSource.processId);
            capturedAudioTracks.forEach((track) => track.stop());
            sourceAudioTrack = applicationAudioTrack || null;
          } else {
            audioMode = "none";
            capturedAudioTracks.forEach((track) => track.stop());
            sourceAudioTrack = null;
            broadcastAudioWarning = "A transmissão seguirá sem áudio do computador. Escolha um aplicativo para incluir somente o áudio dele.";
          }
        }
        if (window.miranteDesktop?.isDesktop && audioMode === "source" && broadcastDisplaySurface !== "screen") {
          // No app desktop, o bridge WASAPI is a áudio isolado da janela.
          // A trilha entregue pelo Chromium é descartada para não vazar o
          // áudio do computador inteiro para a transmissão.
          if (selectedDisplayProcessId) {
            try {
              const windowAudioTrack = await startWindowAudioBridge(selectedDisplayProcessId);
              capturedAudioTracks.forEach((track) => track.stop());
              sourceAudioTrack = windowAudioTrack || null;
            } catch (error) {
              capturedAudioTracks.forEach((track) => track.stop());
              sourceAudioTrack = null;
              broadcastAudioWarning = error.message || "Não foi possível isolar o áudio da janela escolhida.";
            }
          } else {
            capturedAudioTracks.forEach((track) => track.stop());
            sourceAudioTrack = null;
            broadcastAudioWarning = "Não foi possível identificar o processo da janela. A transmissão seguirá sem áudio da fonte para não capturar o computador inteiro.";
          }
        } else if (audioMode === "none") {
          capturedAudioTracks.forEach((track) => track.stop());
        }
      }
      if (sourceType === "screen" && window.miranteDesktop?.isDesktop && audioMode !== "none" && !sourceAudioTrack) {
        broadcastAudioWarning ||= "O Windows não entregou áudio para esta captura. Verifique o volume do jogo e tente escolher a janela novamente.";
      }
      if (sourceType === "screen" && audioMode !== "none" && !sourceAudioTrack && !isDesktop) {
        throw new Error(broadcastMissingAudioMessage());
      }
      if (visibility === "public" && sourceType === "screen") await waitForPublicBroadcastReview();
      broadcastCameraEnabled = sourceType === "camera" || Boolean(broadcastCameraEnabled);
      if (sourceType === "screen" && broadcastCameraEnabled) {
        try {
          broadcastCameraStream = await captureBroadcastCameraStream(profile);
        } catch (error) {
          broadcastAudioWarning ||= "A câmera não pôde ser iniciada; a transmissão continuará somente com a tela.";
          reportClientError("broadcast_camera_capture_error", error, { deviceId: broadcastCameraDeviceId });
        }
      }
      if (broadcastMicrophoneEnabled) {
        try {
          await captureBroadcastMicrophoneStream();
        } catch (error) {
          if (sourceType === "camera") throw error;
          broadcastAudioWarning ||= "O microfone não pôde ser iniciado; a transmissão continuará sem sua voz.";
          reportClientError("broadcast_microphone_capture_error", error, { requestedDeviceId: selectedInputDeviceId });
        }
      }
      broadcastStream = await buildBroadcastOutputStream({
        displayStream: broadcastDisplayStream,
        cameraStream: broadcastCameraStream,
        sourceAudioTrack,
        microphoneStream: broadcastMicrophoneStream,
        profile,
      });
      broadcastSourceAudioTrack = sourceAudioTrack;
      const videoTrack = broadcastStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("A fonte escolhida não forneceu vídeo.");
      activeDisplayProcessId = selectedDisplayProcessId;
      broadcastDisplayStream?.getVideoTracks?.()[0]?.addEventListener("ended", () => { handleBroadcastVideoTrackEnded(broadcastDisplayStream?.getVideoTracks?.()[0]); }, { once: true });
      broadcastCameraStream?.getVideoTracks?.()[0]?.addEventListener("ended", () => { handleBroadcastVideoTrackEnded(broadcastCameraStream?.getVideoTracks?.()[0]); }, { once: true });
      if (videoTrack && "contentHint" in videoTrack) videoTrack.contentHint = "detail";
      videoTrack?.addEventListener("ended", () => { handleBroadcastVideoTrackEnded(videoTrack); }, { once: true });
      const roomId = randomRoom();
      const streamResult = await api("/api/streams", { method: "POST", body: JSON.stringify({ roomName: roomId, title: broadcastTitle, visibility, groupId, voiceRoomId }) });
      broadcastRoomId = roomId;
      broadcastStreamId = streamResult.stream.id;
      broadcastInvite = `${window.location.origin}${streamResult.stream.publicPath || `/?room=${roomId}&mode=viewer`}`;
      await connectBroadcastSocket();
      sendBroadcast({ type: "join", role: "host", roomId });
      if (mediaMode === "relay") await startRelayRecorder();
      broadcastState = "live";
      await attachBroadcastPreview();
      await loadStreams();
      if (visibility === "private" && groupId) {
        await loadGroup(groupId);
        selectedRoomId = voiceRoomId || selectedRoomId;
      }
    } catch (error) {
      reportClientError("broadcast_start_error", error, { sourceType, visibility, mediaMode });
      const canceled = ["NotAllowedError", "AbortError"].includes(error?.name);
      await stopRelayRecorder();
      broadcastError = canceled ? "" : broadcastCaptureErrorMessage(error, sourceType);
      broadcastState = canceled ? "idle" : "error";
      if (canceled) {
        notice = sourceType === "camera"
          ? "Acesso à câmera cancelado. Quando quiser, tente iniciar a transmissão novamente."
          : "Seleção da tela cancelada. Quando quiser, escolha uma janela ou tela para iniciar.";
      }
      showDisplayPicker = false;
      displaySources = [];
      selectedDisplayProcessId = null;
      activeDisplayProcessId = null;
      await stopWindowAudioBridge();
      stopVoiceInputStream(broadcastMicrophoneStream);
      broadcastMicrophoneStream = null;
      stopBroadcastVideoComposition();
      await stopBroadcastAudioMix();
      broadcastDisplayStream?.getTracks?.().forEach((track) => track.stop());
      broadcastCameraStream?.getTracks?.().forEach((track) => track.stop());
      broadcastDisplayStream = null;
      broadcastCameraStream = null;
      broadcastCameraEnabled = false;
      broadcastSourceAudioTrack = null;
      broadcastDisplaySurface = null;
      broadcastStream?.getTracks().forEach((track) => track.stop());
      broadcastStream = null;
      broadcastAudioWarning = "";
      if (broadcastStreamId) {
        const failedStreamId = broadcastStreamId;
        try {
          await api(`/api/streams/${failedStreamId}/end`, { method: "POST" });
          broadcastStreamId = "";
        } catch (cleanupError) {
          reportClientError("broadcast_start_cleanup_error", cleanupError, { streamId: failedStreamId, mediaMode });
          broadcastError = `${broadcastError || "A transmissão falhou."} O servidor ainda não confirmou o encerramento; tente confirmar novamente.`;
        }
      }
      broadcastSocket?.close();
      broadcastSocket = null;
    }
  }

  async function stopBroadcast(reason = "user") {
    if (broadcastStopPromise) return broadcastStopPromise;
    const endingStreamId = broadcastStreamId;
    clearBroadcastCaptureRecoveryTimer();
    const stopPromise = (async () => {
      broadcastState = "stopping";

      try { await stopRelayRecorder(); } catch (error) { console.warn("Falha ao parar o gravador da live:", error); }
      try { sendBroadcast({ type: "stop", reason }); sendBroadcast({ type: "leave" }); } catch (error) { console.warn("Falha ao avisar o encerramento da live:", error); }

      const socket = broadcastSocket;
      broadcastSocket = null;
      try { socket?.close(); } catch (error) { console.warn("Falha ao fechar a conexão da live:", error); }
      for (const peer of peerConnections.values()) {
        for (const sender of peer.getSenders?.() || []) {
          try { await sender.replaceTrack(null); } catch {}
        }
        try { peer.close(); } catch (error) { console.warn("Falha ao fechar conexão de espectador:", error); }
      }
      peerConnections.clear();
      for (const timer of broadcastPeerRetryTimers.values()) window.clearTimeout(timer);
      broadcastPeerRetryTimers.clear();
      pendingBroadcastCandidates.clear();
      broadcastPeerNegotiations.clear();

      try { await stopWindowAudioBridge(); } catch (error) { console.warn("Falha ao parar o áudio da janela:", error); }
      const stream = broadcastStream;
      broadcastStream = null;
      if (broadcastVideo) broadcastVideo.srcObject = null;
      try { stream?.getTracks().forEach((track) => track.stop()); } catch (error) { console.warn("Falha ao liberar a captura da live:", error); }
      stopVoiceInputStream(broadcastMicrophoneStream);
      broadcastMicrophoneStream = null;
      stopBroadcastVideoComposition();
      await stopBroadcastAudioMix();
      try { broadcastDisplayStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      try { broadcastCameraStream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      broadcastDisplayStream = null;
      broadcastCameraStream = null;
      broadcastCameraEnabled = false;
      broadcastSourceAudioTrack = null;
      let endConfirmed = !endingStreamId;
      if (endingStreamId) {
        try {
          await api(`/api/streams/${endingStreamId}/end`, { method: "POST" });
          endConfirmed = true;
        } catch (error) {
          endConfirmed = false;
          reportClientError("broadcast_end_confirmation_error", error, { streamId: endingStreamId, mediaMode });
          broadcastError = "A captura local foi encerrada, mas o servidor não confirmou o fim da live. Tente confirmar novamente.";
        }
      }

      broadcastStreamId = endConfirmed ? "" : endingStreamId;
      broadcastRoomId = "";
      broadcastInvite = "";
      viewerCount = 0;
      broadcastChatMessages = [];
      broadcastChatMessageIds = new Set();
      broadcastChatDraft = "";
      broadcastSourceType = "screen";
      broadcastDisplaySurface = null;
      broadcastSelectedSourceName = "";
      broadcastSelectionKind = "screen";
      activeDisplayProcessId = null;
      broadcastSourceSwitching = false;
      broadcastMediaSwitching = false;
      broadcastState = endConfirmed ? "idle" : "error";
      await loadStreams().catch((error) => console.warn("Falha ao atualizar as lives depois do encerramento:", error));
      if (selectedGroupId) await refreshGroupOverview().catch((error) => console.warn("Falha ao atualizar o grupo depois do encerramento:", error));
    })().catch((error) => {
      reportClientError("broadcast_stop_error", error, { streamId: endingStreamId, mediaMode });
      console.error("Erro inesperado ao encerrar a live:", error);
      broadcastState = endingStreamId ? "error" : "idle";
      broadcastError = endingStreamId ? "Não foi possível confirmar o encerramento da transmissão. Tente novamente." : "";
      notice = endingStreamId ? "A live precisa de confirmação do servidor." : "A transmissão foi encerrada.";
    });
    broadcastStopPromise = stopPromise;
    try {
      return await stopPromise;
    } finally {
      if (broadcastStopPromise === stopPromise) broadcastStopPromise = null;
    }
  }

  async function copyBroadcastInvite() {
    if (!broadcastInvite) return;
    await copyText(broadcastInvite, "Link da transmissão copiado.", "Não foi possível copiar o link da transmissão.");
  }

  function hasLiveBroadcastCapture() {
    const sourceTracks = [
      broadcastDisplayStream?.getVideoTracks?.()[0],
      broadcastCameraStream?.getVideoTracks?.()[0],
    ].filter(Boolean);
    if (sourceTracks.length) return sourceTracks.some((track) => track.readyState === "live");
    return Boolean(broadcastStream?.getVideoTracks().some((track) => track.readyState === "live"));
  }

  async function returnToBroadcast() {
    view = "broadcast";
    if (hasLiveBroadcastCapture()) {
      broadcastState = "live";
      await attachBroadcastPreview();
      return;
    }
    await loadStreams().catch(() => {});
    const ownStream = streams.find((stream) => stream.channelUsername === user?.username)
      || groupOverview?.streams?.find((stream) => stream.channelUsername === user?.username);
    if (ownStream) {
      broadcastStreamId = ownStream.id;
      broadcastRoomId = ownStream.roomName || "";
      broadcastTitle = ownStream.title || broadcastTitle;
      broadcastInvite = `${window.location.origin}${ownStream.publicPath || ""}`;
      broadcastState = "error";
      broadcastError = "A live ainda aparece ativa, mas a captura local foi perdida. Você pode encerrá-la aqui ou iniciar uma nova captura.";
    } else {
      broadcastState = "idle";
      broadcastError = "";
    }
  }

  async function returnFromViewer() {
    isViewer = false;
    viewerRoomId = "";
    viewerStreamPath = "";
    viewerStream = null;
    window.history.pushState({}, "", "/");
    view = broadcastState === "live" ? "broadcast" : "home";
    if (broadcastState === "live") await attachBroadcastPreview();
  }

  async function navigateFromViewer(nextView) {
    isViewer = false;
    viewerRoomId = "";
    viewerStreamPath = "";
    viewerStream = null;
    window.history.pushState({}, "", "/");
    view = nextView;
    if (nextView === "live") await loadStreams().catch(() => {});
    if (nextView === "notifications") await loadNotifications().catch(() => {});
    if (nextView === "direct") await loadDirectConversations().catch(() => {});
    if (nextView === "groups" && selectedGroupId) await loadGroup(selectedGroupId);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const body = messageDraft.trim();
    if (!selectedGroupId || !body || selectedRoom?.kind !== "text") return;
    const groupId = selectedGroupId;
    const roomId = selectedRoomId;
    const pendingId = `pending-${Date.now()}`;
    const pendingMessage = {
      id: pendingId,
      roomId,
      body,
      displayName: user.displayName,
      username: user.username,
      userId: user.id,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    if (groupOverview?.group?.id === groupId) {
      groupOverview = { ...groupOverview, messages: [...(groupOverview.messages || []), pendingMessage].slice(-80) };
    }
    messageDraft = "";
    await scrollGroupMessagesToBottom({ force: true });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(groupId)}/messages`, { method: "POST", body: JSON.stringify({ body, roomId }) });
      if (selectedGroupId === groupId && groupOverview?.group?.id === groupId && result.message) {
        knownGroupMessageIds = new Set([...knownGroupMessageIds, result.message.id]);
        const messages = groupOverview.messages || [];
        const pendingStillVisible = messages.some((message) => message.id === pendingId);
        groupOverview = { ...groupOverview, messages: pendingStillVisible ? messages.map((message) => message.id === pendingId ? result.message : message) : [...messages, result.message].slice(-80) };
        await scrollGroupMessagesToBottom({ force: true });
      }
    } catch (error) {
      if (selectedGroupId === groupId && groupOverview?.group?.id === groupId) {
        groupOverview = { ...groupOverview, messages: (groupOverview.messages || []).filter((message) => message.id !== pendingId) };
      }
      messageDraft = body;
      notice = error.message;
    }
  }

  function clearMentionSuggestions() {
    mentionSuggestions = [];
    mentionStartIndex = -1;
    mentionActiveIndex = 0;
  }

  function updateMentionSuggestions(event) {
    const input = event.currentTarget;
    const cursor = input.selectionStart ?? messageDraft.length;
    const draft = input.value;
    const beforeCursor = draft.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([\p{L}\p{N}_.-]*)$/u);
    if (!match) {
      clearMentionSuggestions();
      return;
    }
    const query = (match[1] || "").toLocaleLowerCase();
    mentionStartIndex = cursor - query.length - 1;
    mentionSuggestions = groupMembers
      .filter((member) => {
        const username = String(member.username || "").toLocaleLowerCase();
        const displayName = String(member.displayName || "").toLocaleLowerCase();
        return !query || username.includes(query) || displayName.includes(query);
      })
      .slice(0, 6);
    mentionActiveIndex = Math.min(mentionActiveIndex, Math.max(mentionSuggestions.length - 1, 0));
    if (!mentionSuggestions.length) mentionStartIndex = -1;
  }

  async function insertMention(member) {
    if (!member || !messageComposerInput || mentionStartIndex < 0) return;
    const cursor = messageComposerInput.selectionStart ?? messageDraft.length;
    const mentionName = member.username || member.displayName || "usuario";
    const nextDraft = `${messageDraft.slice(0, mentionStartIndex)}@${mentionName} ${messageDraft.slice(cursor)}`;
    const nextCursor = mentionStartIndex + mentionName.length + 2;
    messageDraft = nextDraft;
    clearMentionSuggestions();
    await tick();
    messageComposerInput?.focus();
    messageComposerInput?.setSelectionRange(nextCursor, nextCursor);
  }

  function handleMessageKeydown(event) {
    if (mentionSuggestions.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        mentionActiveIndex = (mentionActiveIndex + direction + mentionSuggestions.length) % mentionSuggestions.length;
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        void insertMention(mentionSuggestions[mentionActiveIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        clearMentionSuggestions();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    authBusy = true;
    authError = "";
    const isLogin = authMode === "login";
    const payload = isLogin
      ? { username: loginUsername, password: loginPassword }
      : { displayName: registerDisplayName, username: registerUsername, password: registerPassword, termsAccepted: registerLegalAccepted, privacyAccepted: registerLegalAccepted };
    try {
      const result = await api(isLogin ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      user = result.user;
      canonicalizeAuthenticatedRoute();
      await refresh();
      await redeemPendingInvite();
      await openPendingChannelRoute();
    } catch (error) {
      authError = error.message;
    } finally {
      authBusy = false;
    }
  }

  function startOAuth(provider) {
    window.location.assign(`/api/auth/${provider}`);
  }

  function selectView(next) {
    multistreamOpen = false;
    showGlobalSidebar = false;
    if (next === "groups") {
      setGroupsView({ openWorkspace: false });
      void loadGroups().catch((error) => { notice = error.message; });
    }
    else view = next;
    if (next === "live") void loadStreams().catch((error) => { notice = error.message; });
    if (next === "notifications") void loadNotifications().catch((error) => { notificationsError = error.message; });
    if (next === "direct") void loadDirectConversations().catch((error) => { directConversationError = error.message; });
    if (["friends", "following"].includes(next)) void loadSocial().catch((error) => { socialError = error.message; });
  }

  function setGroupsView({ openWorkspace = true } = {}) {
    if (view !== "groups" && !compactViewport) globalSidebarCollapsed = true;
    showGlobalSidebar = false;
    view = "groups";
    groupsWorkspaceOpen = openWorkspace;
    if (!openWorkspace) {
      groupPickerQuery = "";
      showMobileChannels = false;
      showMobileMembers = false;
    }
  }

  function currentReleaseNotes() {
    const platform = isDesktop ? "desktop" : "web";
    const version = isDesktop ? desktopVersion : WEB_VERSION;
    const notes = RELEASE_NOTES[platform]?.[version];
    return notes ? { platform, version, ...notes } : null;
  }

  function runtimeVersion() {
    return isDesktop ? desktopVersion : WEB_VERSION;
  }

  function releaseNotesStorageKey(account = user) {
    const accountKey = account?.id || account?.username;
    const platform = isDesktop ? "desktop" : "web";
    return accountKey ? `mirante-release-notes-seen:${platform}:${accountKey}` : "";
  }

  function openReleaseNotes() {
    const notes = currentReleaseNotes();
    if (!notes) {
      notice = "Ainda não há notas cadastradas para esta versão.";
      return;
    }
    releaseNotes = notes;
    showReleaseNotes = true;
    showUserMenu = false;
  }

  function maybeShowReleaseNotes(account) {
    const notes = currentReleaseNotes();
    const storageKey = releaseNotesStorageKey(account);
    if (!notes || !storageKey) return;
    try {
      if (localStorage.getItem(storageKey) !== notes.version) {
        releaseNotes = notes;
        showReleaseNotes = true;
      }
    } catch {}
  }

  function dismissReleaseNotes() {
    const storageKey = releaseNotesStorageKey();
    if (storageKey && releaseNotes?.version) {
      try { localStorage.setItem(storageKey, releaseNotes.version); } catch {}
    }
    showReleaseNotes = false;
  }

  async function openGroupWorkspace(groupId) {
    if (!groupId) return;
    setGroupsView();
    // Abra o workspace imediatamente e carregue o resumo pesado em segundo
    // plano. Assim a navegação responde mesmo quando o grupo tem muitos
    // membros, mensagens ou transmissões ativas.
    void loadGroup(groupId);
  }

  function toggleGlobalNavigation() {
    if (compactViewport) {
      showGlobalSidebar = !showGlobalSidebar;
      return;
    }
    globalSidebarCollapsed = !globalSidebarCollapsed;
  }

  function handleLegalConsentAccepted(event) {
    if (!user || !event.detail) return;
    user = { ...user, legal: event.detail };
  }

  function handleDesktopUpdate(payload = {}) {
    // A checagem acontece em segundo plano; só exibimos o resultado ou uma ação necessária.
    desktopUpdate = payload.status === "checking"
      ? { ...desktopUpdate, status: "idle" }
      : { ...desktopUpdate, ...payload };
  }

  function handleDesktopTrayAction(action) {
    if (action === "toggle-mute") {
      if (voiceState !== "connected") {
        notice = "Entre em uma sala de voz para controlar o microfone.";
        return;
      }
      toggleVoiceMute();
    } else if (action === "toggle-deafen") {
      if (voiceState !== "connected") {
        notice = "Entre em uma sala de voz para controlar o áudio.";
        return;
      }
      toggleVoiceDeafen();
    }
  }

  function desktopUpdateLabel() {
    if (!isDesktop) return `Web ${WEB_VERSION}`;
    if (desktopUpdate.status === "available") return `Nova versão${desktopUpdate.version ? ` v${desktopUpdate.version}` : ""}`;
    if (desktopUpdate.status === "downloading") return `Baixando${desktopUpdate.percent ? ` ${desktopUpdate.percent}%` : "…"}`;
    if (desktopUpdate.status === "downloaded") return `Pronta${desktopUpdate.version ? ` v${desktopUpdate.version}` : ""}`;
    if (desktopUpdate.status === "current") return "Atualizado";
    if (desktopUpdate.status === "error") return "Não foi possível verificar";
    return "Atualizações automáticas";
  }

  async function loadDesktopVersion() {
    if (!window.miranteDesktop?.isDesktop) return;
    try {
      desktopVersion = await window.miranteDesktop.getVersion() || APP_VERSION;
    } catch {
      desktopVersion = APP_VERSION;
    }
    try {
      await window.miranteDesktop.checkForUpdates();
    } catch (error) {
      handleDesktopUpdate({ status: "error", message: error?.message || "Não foi possível verificar atualizações." });
    }
  }

  async function loadDesktopLaunchAtLogin() {
    if (!window.miranteDesktop?.getLaunchAtLogin) return;
    try {
      const result = await window.miranteDesktop.getLaunchAtLogin();
      if (result?.supported) launchAtLogin = Boolean(result.enabled);
    } catch {
      launchAtLoginError = "Não foi possível consultar a inicialização do Telai.";
    }
  }

  async function loadDesktopHardwareAcceleration() {
    if (!window.miranteDesktop?.getHardwareAcceleration) return;
    try {
      const result = await window.miranteDesktop.getHardwareAcceleration();
      if (result?.ok) hardwareAccelerationMode = result.mode === "disabled" ? "disabled" : "auto";
    } catch {
      hardwareAccelerationError = "Não foi possível consultar a aceleração gráfica.";
    }
  }

  async function setHardwareAcceleration(event) {
    if (!window.miranteDesktop?.setHardwareAcceleration) return;
    const nextMode = event.currentTarget.value === "disabled" ? "disabled" : "auto";
    const previousMode = hardwareAccelerationMode;
    hardwareAccelerationBusy = true;
    hardwareAccelerationError = "";
    try {
      const result = await window.miranteDesktop.setHardwareAcceleration(nextMode);
      if (!result?.ok) throw new Error(result?.message || "Não foi possível salvar o modo de compatibilidade.");
      hardwareAccelerationMode = nextMode;
      notice = nextMode === "disabled"
        ? "A aceleração gráfica será desativada ao reiniciar o Telai."
        : "A aceleração gráfica será reativada ao reiniciar o Telai.";
    } catch (error) {
      hardwareAccelerationMode = previousMode;
      hardwareAccelerationError = error?.message || "Não foi possível salvar o modo de compatibilidade.";
    } finally {
      hardwareAccelerationBusy = false;
    }
  }

  async function toggleLaunchAtLogin(event) {
    if (!window.miranteDesktop?.setLaunchAtLogin) return;
    const nextValue = Boolean(event.currentTarget.checked);
    launchAtLoginBusy = true;
    launchAtLoginError = "";
    try {
      const result = await window.miranteDesktop.setLaunchAtLogin(nextValue);
      if (!result?.ok) throw new Error(result?.message || "Não foi possível alterar a inicialização do Telai.");
      launchAtLogin = Boolean(result.enabled);
      notice = launchAtLogin ? "O Telai iniciará com o computador." : "O Telai não iniciará mais com o computador.";
    } catch (error) {
      launchAtLogin = !nextValue;
      launchAtLoginError = error?.message || "Não foi possível alterar a inicialização do Telai.";
    } finally {
      launchAtLoginBusy = false;
    }
  }

  async function updateDesktopApp() {
    try {
      if (desktopUpdate.status === "available") {
        handleDesktopUpdate({ status: "downloading", percent: 0 });
        await window.miranteDesktop.downloadUpdate();
      } else if (desktopUpdate.status === "downloaded") {
        await window.miranteDesktop.installUpdate();
      } else {
        handleDesktopUpdate({ status: "idle", message: "" });
        await window.miranteDesktop.checkForUpdates();
      }
    } catch (error) {
      handleDesktopUpdate({ status: "error", message: error?.message || "Não foi possível atualizar agora." });
    }
  }

  function resolveBroadcastAudioSource(source) {
    if (!source?.processId) return null;
    return {
      processId: Number(source.processId),
      name: String(source.name || source.processName || "aplicativo").trim(),
    };
  }

  async function requestBroadcastAudioSource() {
    if (!window.miranteDesktop?.getDisplayMediaSources) return null;
    const sources = await window.miranteDesktop.getDisplayMediaSources();
    const candidates = (sources || []).filter((source) => source?.kind === "window" && source?.processId && !/(discord|telai|mirante)/i.test(`${source.processName || ""} ${source.name || ""}`));
    broadcastAudioSources = candidates;
    if (!candidates.length) return null;
    showBroadcastAudioPicker = true;
    return new Promise((resolve, reject) => {
      broadcastAudioSelection = { resolve, reject };
    });
  }

  function selectBroadcastAudioSource(source) {
    const selected = resolveBroadcastAudioSource(source);
    showBroadcastAudioPicker = false;
    broadcastAudioSources = [];
    broadcastAudioSelection?.resolve(selected);
    broadcastAudioSelection = null;
  }

  function skipBroadcastAudioSource() {
    showBroadcastAudioPicker = false;
    broadcastAudioSources = [];
    broadcastAudioSelection?.resolve(null);
    broadcastAudioSelection = null;
  }

  function cancelBroadcastAudioPicker() {
    skipBroadcastAudioSource();
  }

  function selectDisplaySource(source) {
    if (!window.miranteDesktop?.isDesktop) return;
    showDisplayPicker = false;
    displaySources = [];
    broadcastDisplaySurface = source.kind === "screen" ? "screen" : "window";
    broadcastSelectedSourceName = source.name || (source.kind === "screen" ? "Tela inteira" : "Janela escolhida");
    selectedDisplayProcessId = source.processId || null;
    displaySourceSelection?.resolve(source);
    displaySourceSelection = null;
    displaySourceFilter = "all";
    window.miranteDesktop.selectDisplaySource(source.id, { audioMode: audioMode === "system" ? "none" : audioMode });
  }

  function cancelDisplayPicker() {
    showDisplayPicker = false;
    displaySources = [];
    displaySourceFilter = "all";
    selectedDisplayProcessId = null;
    broadcastDisplaySurface = null;
    displaySourceSelection?.reject(new DOMException("Seleção de captura cancelada.", "NotAllowedError"));
    displaySourceSelection = null;
    window.miranteDesktop?.cancelDisplaySource?.();
  }

  function handleViewerFullscreenMessage(event) {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "telai-viewer-fullscreen") return;
    viewerParentFullscreen = Boolean(event.data.active);
  }

  onMount(async () => {
    detectViewerRoute();
    void loadMaintenance();
    const handleNavigationViewport = () => {
      const nextCompactViewport = window.matchMedia("(max-width: 1100px)").matches;
      if (nextCompactViewport === compactViewport) return;
      compactViewport = nextCompactViewport;
      if (!compactViewport) showGlobalSidebar = false;
    };
    handleNavigationViewport();
    voiceReconnectSession = readVoiceReconnectSession();
    voiceReconnectVisible = Boolean(voiceReconnectSession);
    const handleWindowError = (event) => reportClientError("window_error", event.error || event.message, { filename: event.filename, line: event.lineno, column: event.colno });
    const handleUnhandledRejection = (event) => reportClientError("unhandled_rejection", event.reason);
    const handleBrowserPopState = () => {
      isViewer = false;
      viewerRoomId = "";
      viewerStreamPath = "";
      viewerStream = null;
      detectViewerRoute();
      if (!isViewer) view = broadcastState === "live" ? "broadcast" : "home";
    };
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("click", closeVoiceContextMenu);
    window.addEventListener("click", closeRoomContextMenu);
    window.addEventListener("popstate", handleBrowserPopState);
    window.addEventListener("message", handleViewerFullscreenMessage);
    window.addEventListener("click", closeGroupContextMenu);
    window.addEventListener("click", handleGlobalAccountClick);
    window.addEventListener("click", handleGlobalUserClick);
    window.addEventListener("resize", closeVoiceContextMenu);
    window.addEventListener("resize", closeRoomContextMenu);
    window.addEventListener("resize", closeGroupContextMenu);
    window.addEventListener("resize", handleNavigationViewport);
    window.addEventListener("contextmenu", handleGlobalVoiceContextMenu);
    window.addEventListener("keydown", handlePushToTalkKeyDown);
    window.addEventListener("keydown", handleMuteShortcutKeyDown);
    window.addEventListener("mousedown", handleMuteShortcutMouseDown, true);
    window.addEventListener("contextmenu", handleGlobalRoomContextMenu);
    window.addEventListener("keyup", handlePushToTalkKeyUp);
    window.addEventListener("blur", releasePushToTalk);
    window.addEventListener("offline", handleVoiceNetworkOffline);
    window.addEventListener("online", handleVoiceNetworkOnline);
    window.addEventListener("pointerdown", handleVoicePlaybackInteraction, true);
    window.addEventListener("keydown", handleVoicePlaybackInteraction, true);
    window.addEventListener("focus", handleVoicePlaybackInteraction);
    document.addEventListener("visibilitychange", handleVoicePlaybackInteraction);
    navigator.mediaDevices?.addEventListener?.("devicechange", handleVoiceDeviceChange);
    theme = localStorage.getItem("mirante-theme") === "light" ? "light" : "dark";
    if (window.miranteDesktop?.isDesktop) {
      isDesktop = true;
      desktopPushToTalkUnsubscribe = window.miranteDesktop.onPushToTalk?.(handleDesktopPushToTalk) || null;
      desktopMuteShortcutUnsubscribe = window.miranteDesktop.onMuteShortcut?.(handleDesktopMuteShortcut) || null;
      desktopTrayUnsubscribe = window.miranteDesktop.onTrayAction?.(handleDesktopTrayAction) || null;
      window.miranteDesktop.onUpdateStatus?.(handleDesktopUpdate);
      windowAudioStatusUnsubscribe = window.miranteDesktop.onWindowAudioStatus?.((status) => { void handleWindowAudioStatus(status); }) || null;
      loadDesktopVersion();
      loadDesktopLaunchAtLogin();
      loadDesktopHardwareAcceleration();
      window.miranteDesktop.setTheme?.(theme);
      window.miranteDesktop.onDisplayMediaSources?.((sources) => {
        displaySources = sources || [];
        displaySourceFilter = broadcastSelectionKind === "screen" ? "screen" : "window";
        showDisplayPicker = displaySources.length > 0;
      });
    }
    try {
      const runtimeResponse = await fetch("/runtime-config", { cache: "no-store" });
      const runtime = await runtimeResponse.json().catch(() => ({}));
      mediaMode = runtime.mediaMode === "relay" ? "relay" : "p2p";
    } catch {}
    try {
      const [session, availableProviders] = await Promise.all([
        api("/api/auth/session"),
        api("/api/auth/providers"),
        loadIceConfiguration(),
      ]);
      providers = availableProviders;
      user = session.user || null;
      if (user) canonicalizeAuthenticatedRoute();
      if (user && !isViewer && view !== "viewer") maybeShowReleaseNotes(user);
      // O visualizador já possui seu próprio WebSocket/player. Evite carregar
      // grupos, streams e notificações em segundo plano enquanto ele está aberto.
      if (user && !isViewer && view !== "viewer") {
        await Promise.all([refresh(), loadAudioDevices(false)]);
      }
      await redeemPendingInvite();
      await openPendingChannelRoute();
    } catch (error) { notice = error.message; }
    loading = false;
  });

  const GROUP_PRESENCE_POLL_MS = 15_000;
  const GROUP_OVERVIEW_POLL_MS = 15_000;
  const STREAMS_POLL_MS = 15_000;
  const NOTIFICATIONS_POLL_MS = 30_000;
  const DIRECT_MESSAGES_POLL_MS = 8_000;
  const MAINTENANCE_POLL_MS = 30_000;

  function shouldPollClientData() {
    return typeof document === "undefined" || document.visibilityState === "visible";
  }

  const groupPresenceTimer = setInterval(() => {
    if (!shouldPollClientData()) return;
    if (user && !isViewer && view === "groups" && selectedGroupId) {
      void refreshGroupPresence().catch((error) => reportClientError("group_presence_refresh_error", error, { groupId: selectedGroupId }));
    }
  }, GROUP_PRESENCE_POLL_MS);
  const groupOverviewTimer = setInterval(() => {
    if (!shouldPollClientData()) return;
    if (user && !isViewer && view === "groups" && groupsWorkspaceOpen && selectedGroupId) {
      void refreshGroupOverview().catch((error) => reportClientError("group_overview_refresh_error", error, { groupId: selectedGroupId }));
    }
  }, GROUP_OVERVIEW_POLL_MS);
  const streamsTimer = setInterval(() => {
    if (!shouldPollClientData()) return;
    if (user && !isViewer && ["home", "live", "groups"].includes(view)) loadStreams().catch(() => {});
  }, STREAMS_POLL_MS);
  const notificationTimer = setInterval(() => {
    if (!shouldPollClientData()) return;
    if (user && !isViewer && view !== "viewer") {
      loadNotifications({ silent: true }).catch(() => {});
    }
  }, NOTIFICATIONS_POLL_MS);
  const directMessagesTimer = setInterval(() => {
    if (!shouldPollClientData()) return;
    if (user && !isViewer && view === "direct" && directConversationId) {
      loadDirectConversationMessages({ silent: true }).catch(() => {});
    }
  }, DIRECT_MESSAGES_POLL_MS);
  const maintenanceTimer = setInterval(() => {
    if (shouldPollClientData()) void loadMaintenance();
  }, MAINTENANCE_POLL_MS);
  const maintenanceCountdownTimer = setInterval(updateMaintenanceCountdown, 1000);
  onDestroy(() => {
    clearBroadcastCaptureRecoveryTimer();
    clearVoiceSpeakingPublishTimer();
    stopVoiceTest();
    stopVoiceInputStream(voiceLocalStream);
    clearInterval(groupPresenceTimer);
    clearInterval(groupOverviewTimer);
    clearInterval(streamsTimer);
    clearInterval(notificationTimer);
    clearInterval(directMessagesTimer);
    clearInterval(maintenanceTimer);
    clearInterval(maintenanceCountdownTimer);
    clearInterval(voiceActivityTimer);
    window.removeEventListener("click", closeVoiceContextMenu);
    window.removeEventListener("click", closeRoomContextMenu);
    window.removeEventListener("popstate", handleBrowserPopState);
    window.removeEventListener("message", handleViewerFullscreenMessage);
    window.removeEventListener("click", closeGroupContextMenu);
    window.removeEventListener("click", handleGlobalAccountClick);
    window.removeEventListener("click", handleGlobalUserClick);
    window.removeEventListener("resize", closeVoiceContextMenu);
    window.removeEventListener("resize", closeRoomContextMenu);
    window.removeEventListener("resize", closeGroupContextMenu);
    window.removeEventListener("resize", handleNavigationViewport);
    window.removeEventListener("contextmenu", handleGlobalVoiceContextMenu);
    window.removeEventListener("keydown", handlePushToTalkKeyDown);
    window.removeEventListener("keydown", handleMuteShortcutKeyDown);
    window.removeEventListener("mousedown", handleMuteShortcutMouseDown, true);
    window.removeEventListener("contextmenu", handleGlobalRoomContextMenu);
    window.removeEventListener("keyup", handlePushToTalkKeyUp);
    window.removeEventListener("blur", releasePushToTalk);
    window.removeEventListener("offline", handleVoiceNetworkOffline);
    window.removeEventListener("online", handleVoiceNetworkOnline);
    window.removeEventListener("pointerdown", handleVoicePlaybackInteraction, true);
    window.removeEventListener("keydown", handleVoicePlaybackInteraction, true);
    window.removeEventListener("focus", handleVoicePlaybackInteraction);
    document.removeEventListener("visibilitychange", handleVoicePlaybackInteraction);
    navigator.mediaDevices?.removeEventListener?.("devicechange", handleVoiceDeviceChange);
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    desktopPushToTalkUnsubscribe?.();
    desktopMuteShortcutUnsubscribe?.();
    desktopTrayUnsubscribe?.();
    windowAudioStatusUnsubscribe?.();
    if (voiceReconnectTimer) window.clearTimeout(voiceReconnectTimer);
  });

  function setTheme(nextTheme) {
    const previousDefaults = visualDefaults[theme];
    const nextDefaults = visualDefaults[nextTheme];
    if (buttonColor === previousDefaults.button) buttonColor = nextDefaults.button;
    if (inputBackgroundColor === previousDefaults.input) inputBackgroundColor = nextDefaults.input;
    if (backgroundColor === previousDefaults.background) backgroundColor = nextDefaults.background;
    theme = nextTheme;
  }

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark");
    localStorage.setItem("mirante-theme", theme);
    window.miranteDesktop?.setTheme?.(theme);
    if (user) api("/api/auth/preferences", { method: "PATCH", body: JSON.stringify({ theme, defaultQuality: selectedQuality, defaultAudio: audioMode, buttonColor, inputBackgroundColor, backgroundColor, pushToTalkKey }) }).catch(() => {});
  }

  function replaceBrowserPath(pathname, { preserveQuery = true } = {}) {
    const url = new URL(window.location.href);
    url.pathname = pathname;
    if (!preserveQuery) url.search = "";
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  function canonicalizeAuthenticatedRoute() {
    if (isViewer) return;
    const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/login") replaceBrowserPath("/");
  }

  function detectViewerRoute() {
    const url = new URL(window.location.href);
    pendingInviteToken = url.searchParams.get("invite") || "";
    pendingGroupRouteId = url.searchParams.get("group") || "";
    pendingRoomRouteId = url.searchParams.get("room") || "";
    const queryAuthError = url.searchParams.get("auth_error");
    if (queryAuthError) {
      authError = {
        "login-required": "Entre para vincular uma conta externa.",
        "oauth-denied": "O acesso externo foi cancelado.",
        "oauth-failed": "Não foi possível concluir o acesso externo.",
      }[queryAuthError] || "Não foi possível concluir o acesso externo.";
      url.searchParams.delete("auth_error");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
    const queryRoom = url.searchParams.get("room");
    if (url.searchParams.get("mode") === "viewer" && queryRoom) {
      isViewer = true;
      viewerRoomId = queryRoom;
      viewerStreamPath = "";
      return;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const reserved = new Set(["login", "svelte", "download", "updates"]);
    const friendly = [1, 2].includes(parts.length)
      && parts.every((part) => /^[a-zA-Z0-9_.-]+$/.test(part))
      && !reserved.has(parts[0].toLowerCase());
    if (friendly) {
      isViewer = true;
      viewerRoomId = "";
      viewerStreamPath = url.pathname;
    }
  }
</script>

<svelte:head>
  <title>Telai · painel</title>
</svelte:head>

<div class:light={!isDark} class:desktop-app={isDesktop} class:home-shell={view === "home"} class:groups-shell={view === "groups"} class:settings-shell={view === "settings"} class:broadcast-shell={view === "broadcast"} class:multistream-mode={view === "multistream"} class:viewer-shell-active={isViewer || view === "viewer"} class:viewer-parent-fullscreen={viewerParentFullscreen} class:broadcast-active={broadcastState === "live"} class:voice-reconnect-active={voiceReconnectVisible && voiceReconnectSession} class:global-sidebar-collapsed={globalSidebarCollapsed} class="mirante-shell" style={visualStyle}>
  {#if isDesktop}<div class="desktop-titlebar" aria-hidden="true"></div>{/if}
  {#if maintenanceNotice}<div class="maintenance-banner" role="alert" aria-live="assertive"><div><strong>Manutenção programada</strong><span>{maintenanceRemainingSeconds > 0 ? `O Telai será atualizado em ${maintenanceRemainingSeconds}s.` : "A atualização está começando agora."}</span><small>{maintenanceNotice.message}</small></div><b>{maintenanceRemainingSeconds > 0 ? `${maintenanceRemainingSeconds}s` : "agora"}</b></div>{/if}
  {#if loading}
    <div class="grid min-h-screen place-items-center"><div class="text-sm text-slate-400">Abrindo seu espaço…</div></div>
  {:else if isViewer || view === "viewer"}
    <div class:light={!isDark} class="mirante-shell viewer-shell" style={visualStyle}>
      <Viewer roomId={viewerRoomId} streamPath={viewerStreamPath} streamData={viewerStream} initialMediaMode={mediaMode} initialRtcConfig={rtcConfig} appVersion={runtimeVersion()} isDark={isDark} currentUser={user} onToggleTheme={toggleTheme} onBack={returnFromViewer} onNavigate={navigateFromViewer} />
    </div>
  {:else if !user}
    <AuthPage
      bind:authMode
      bind:authError
      bind:loginUsername
      bind:loginPassword
      bind:registerDisplayName
      bind:registerUsername
      bind:registerPassword
      bind:registerLegalAccepted
      {isDark}
      {providers}
      {authBusy}
      onSubmit={submitAuth}
      onStartOAuth={startOAuth}
    />
  {:else}
    <AppHeader
      {compactViewport}
      {showGlobalSidebar}
      {globalSidebarCollapsed}
      {isDark}
      {isDesktop}
      {user}
      {broadcastState}
      {showUserMenu}
      {showAboutInAccountMenu}
      {notificationUnreadCount}
      desktopVersion={desktopVersion}
      webVersion={WEB_VERSION}
      {desktopUpdate}
      {desktopUpdateLabel}
      onToggleGlobalNavigation={toggleGlobalNavigation}
      onNavigateHome={() => view = "home"}
      onReturnToBroadcast={returnToBroadcast}
      onStopBroadcast={stopBroadcast}
      onRequestBroadcastStart={requestBroadcastStart}
      onToggleUserMenu={() => { showUserMenu = !showUserMenu; showAboutInAccountMenu = false; }}
      onOpenAccountDestination={openAccountDestination}
      onOpenReleaseNotes={openReleaseNotes}
      onToggleAbout={() => showAboutInAccountMenu = !showAboutInAccountMenu}
      onUpdateDesktopApp={updateDesktopApp}
      onToggleTheme={toggleTheme}
      onLogout={() => { showUserMenu = false; void logout(); }}
      onOpenNotifications={openNotifications}
    />

    <main class:groups-active={view === "groups"} class:direct-active={view === "direct"} class:broadcast-page-active={view === "broadcast"} class:global-sidebar-collapsed={globalSidebarCollapsed} class:voice-reconnect-visible={voiceReconnectVisible && voiceReconnectSession} class="app-main shell-width py-8 sm:py-10">
      <GlobalSidebar
        {showGlobalSidebar}
        {globalSidebarCollapsed}
        {view}
        {notificationUnreadCount}
        onClose={() => showGlobalSidebar = false}
        onSelectView={selectView}
        onOpenSettings={() => void openAccountDestination("settings")}
      />
      {#if notice}<div class="app-notice" role="status">{notice}</div>{/if}
      {#if voiceReconnectVisible && voiceReconnectSession}
        <VoiceReconnectBanner
          session={voiceReconnectSession}
          busy={voiceReconnectBusy}
          onReconnect={() => void reconnectSavedVoiceRoom()}
          onDismiss={clearVoiceReconnectSession}
        />
      {/if}
      {#if view === "home"}
        <HomePage
          {homeLiveStreams}
          {homeCommunityGroups}
          onRequestBroadcastStart={requestBroadcastStart}
          onCreateGroup={() => { showGroupDialog = true; }}
          onOpenLive={() => selectView("live")}
          onOpenGroups={() => selectView("groups")}
          onOpenStream={openStreamViewer}
          onOpenGroup={(group) => { selectedGroupId = group.id; loadGroup(group.id); setGroupsView(); }}
        />
      {:else if view === "notifications"}
        <NotificationsPage
          {notificationUnreadCount}
          {hideReadNotifications}
          {readNotificationCount}
          {notificationsError}
          {unreadDirectNotification}
          {notificationsLoading}
          {visibleNotifications}
          {notifications}
          {inviteActionId}
          onHideReadChange={setHideReadNotifications}
          onMarkAllRead={markAllNotificationsRead}
          onOpenDirectNotification={openDirectNotification}
          onMarkNotificationRead={markNotificationRead}
          onRespondToInvite={respondToInvite}
          onReviewNotification={reviewNotification}
          onOpenStreamNotification={openStreamNotification}
          onNavigateHome={() => selectView("home")}
        />
      {:else if view === "friends"}
        <FriendsPage
          bind:socialSearchOpen
          bind:socialRequestsOpen
          bind:socialSearchQuery
          {social}
          {socialError}
          {socialSearchBusy}
          {socialSearchResults}
          {socialActionId}
          onSearchUsers={searchSocialUsers}
          onOpenDirectConversation={openDirectConversationWithUser}
          onCancelFriendRequest={cancelFriendRequest}
          onSendFriendRequest={sendFriendRequest}
          onToggleFollowUser={toggleFollowUser}
          onRespondToFriendRequest={respondToFriendRequest}
          onRemoveFriend={removeFriend}
          onNavigateHome={() => selectView("home")}
        />
      {:else if view === "following"}
        <FollowingPage
          {social}
          {socialError}
          {socialActionId}
          onToggleFollowUser={toggleFollowUser}
          onNavigateFriends={() => selectView("friends")}
          onNavigateHome={() => selectView("home")}
        />
      {:else if view === "direct"}
        <DirectMessagesPage
          {user}
          {directConversationError}
          {directConversations}
          {directConversationId}
          {directConversationTarget}
          {directConversationLoading}
          {directMessages}
          bind:directMessageDraft
          {directConversationSending}
          onOpenConversation={openDirectConversationById}
          onSendMessage={sendDirectMessage}
          onMessageKeydown={handleDirectMessageKeydown}
          onNavigateHome={() => selectView("home")}
        />
      {:else if view === "broadcast"}
        <BroadcastPage
          bind:selectedQuality
          bind:broadcastVideo
          bind:broadcastChatListElement
          bind:broadcastChatDraft
          bind:audioMode
          bind:broadcastCameraDeviceId
          bind:broadcastCameraEnabled
          bind:broadcastCameraPosition
          bind:selectedInputDeviceId
          bind:broadcastMicrophoneEnabled
          {broadcastState}
          {broadcastStreamId}
          {broadcastTitle}
          {broadcastSourceType}
          {publicBroadcastSourceLabel}
          {broadcastSelectionKind}
          {qualityProfiles}
          {broadcastError}
          {broadcastAudioWarning}
          {viewerCount}
          {broadcastChatMessages}
          {isDesktop}
          {broadcastDisplaySurface}
          {broadcastAudioSourceName}
          {cameraInputDevices}
          {audioInputDevices}
          {broadcastSourceSwitching}
          {broadcastMediaSwitching}
          {voiceDevicesBusy}
          {broadcastInvite}
          {pendingBroadcastContext}
          onStopBroadcast={stopBroadcast}
          onNavigateHome={() => selectView("home")}
          onBeginBroadcast={beginBroadcast}
          onSendChat={sendBroadcastChatMessage}
          onBroadcastAudioModeChange={handleBroadcastAudioModeChange}
          onCameraChange={handleBroadcastCameraChange}
          onCameraToggle={handleBroadcastCameraToggle}
          onCameraPositionChange={handleBroadcastCameraPositionChange}
          onMicrophoneChange={handleBroadcastMicrophoneChange}
          onRefreshDevices={refreshBroadcastDevices}
          onSwitchSource={switchBroadcastSource}
          onCopyInvite={copyBroadcastInvite}
          onRequestCameraStart={requestCameraBroadcastStart}
        />
      {:else if view === "groups"}
        <div class="groups-view">
        {#if !groupsWorkspaceOpen}
          <GroupPickerPage
            {groups}
            bind:groupPickerQuery
            {groupPickerGroups}
            {groupLoading}
            onSearch={openGroupSearchDialog}
            onCreate={() => { showGroupDialog = true; }}
            onOpenGroup={openGroupWorkspace}
          />
        {:else if !groups.length || !selectedGroupId}
          <section class="groups-empty-state panel" aria-labelledby="groups-empty-title">
            <span class="groups-empty-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("communities")} size={28} strokeWidth={1.8} /></span>
            <p class="eyebrow">suas comunidades</p>
            <h1 id="groups-empty-title">Você ainda não faz parte de nenhum grupo</h1>
            <p class="muted">Crie seu próprio grupo ou pesquise uma comunidade para começar a conversar, entrar em voz e acompanhar transmissões.</p>
            <div class="groups-empty-actions">
              <button class="primary rounded-xl px-4 py-3 text-sm font-extrabold" type="button" on:click={() => { showGroupDialog = true; }}>Criar grupo <span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("add")} size={15} strokeWidth={1.8} /></span></button>
              <button class="outline rounded-xl px-4 py-3 text-sm font-extrabold" type="button" on:click={openGroupSearchDialog}>Pesquisar grupos <span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("search")} size={15} strokeWidth={1.8} /></span></button>
            </div>
          </section>
        {:else}
        <GroupWorkspaceHeader
          {selectedGroup}
          {selectedGroupId}
          {groupLoading}
          {groupMembers}
          {user}
          onBack={() => setGroupsView({ openWorkspace: false })}
          onInvite={openInviteDialog}
          onOpenSettings={() => openSettings("group", "groups")}
          onLeave={openLeaveGroupDialog}
        />
        <section class:group-navigation-collapsed={groupNavigationCollapsed} class="discord-layout">
        <GroupServerRail
          {groups}
          {selectedGroupId}
          {groupLoading}
          {groupNavigationCollapsed}
          onGoHome={() => selectView("home")}
          onLoadGroup={loadGroup}
          onOpenGroupContextMenu={openGroupContextMenu}
          onCreateGroup={() => { showGroupDialog = true; }}
          onToggleNavigation={() => { groupNavigationCollapsed = !groupNavigationCollapsed; showMobileChannels = false; }}
          onSearchGroups={openGroupSearchDialog}
          onOpenSettings={() => openSettings("group", "groups")}
        />
        <GroupChannelRail
          {showMobileChannels}
          {showGroupPicker}
          {groups}
          {selectedGroup}
          {selectedGroupId}
          {groupLoading}
          {textRooms}
          {voiceRooms}
          {selectedRoomId}
          {voiceDropRoomId}
          {draggedVoiceParticipantId}
          {canMoveVoiceMembers}
          {user}
          {voiceState}
          {voiceServerMuted}
          {voiceMuted}
          {voiceDeafened}
          {broadcastState}
          onToggleGroupPicker={() => { showGroupPicker = !showGroupPicker; }}
          onLoadGroup={loadGroup}
          onCreateGroup={() => { showGroupPicker = false; showGroupDialog = true; }}
          onCreateRoom={(kind) => { showRoomDialog = true; if (kind) roomKind = kind; }}
          onSelectRoom={selectRoom}
          onVisibleVoiceParticipants={visibleVoiceParticipants}
          onIsVoiceParticipantSpeaking={isVoiceParticipantSpeaking}
          onVoiceParticipantDisplayName={voiceParticipantDisplayName}
          onPrivateLiveForParticipant={privateLiveForParticipant}
          onHandleVoiceDragOver={handleVoiceDragOver}
          onHandleVoiceDragLeave={handleVoiceDragLeave}
          onHandleVoiceDrop={handleVoiceDrop}
          onHandleVoiceDragStart={handleVoiceDragStart}
          onHandleVoiceDragEnd={handleVoiceDragEnd}
          onToggleVoiceMute={toggleVoiceMute}
          onToggleVoiceDeafen={toggleVoiceDeafen}
          onRequestBroadcastStart={requestBroadcastStart}
          onOpenVoiceSettings={openVoiceSettings}
          onLeaveVoiceRoom={leaveVoiceRoom}
        />
        <section class="chat-workspace"><GroupChatHeader {selectedGroup} {selectedGroupId} {groupLoading} {selectedRoom} {showMobileChannels} {showMobileMembers} onToggleChannels={() => { showMobileChannels = !showMobileChannels; showMobileMembers = false; }} onToggleMembers={() => { showMobileMembers = !showMobileMembers; showMobileChannels = false; }} onCreateChannel={() => { showRoomDialog = true; }} />{#if groupLoading}<div class="workspace-loading"><span></span><span></span><span></span></div>{:else if selectedRoom?.kind === "voice"}<GroupVoiceWorkspace {selectedRoomLiveStreams} currentUserId={user?.id} watchingStreamId={watchingGroupLiveStreamId} streamUrl={streamViewerUrl} {voiceLobbyParticipants} {voiceState} {voiceRoomId} {selectedRoom} {activeVoiceRoom} {voiceError} onWatchSelectedRoomLive={watchSelectedRoomLive} onCloseSelectedRoomLive={closeSelectedRoomLive} onIsVoiceParticipantSpeaking={isVoiceParticipantSpeaking} onVoiceParticipantDisplayName={voiceParticipantDisplayName} onJoinVoiceRoom={joinVoiceRoom} onLeaveVoiceRoom={leaveVoiceRoom} />{:else}<GroupTextChatWorkspace bind:messageComposerInput bind:messageDraft {selectedRoom} {roomMessages} {mentionSuggestions} {mentionActiveIndex} onSendMessage={sendMessage} onUpdateMentionSuggestions={updateMentionSuggestions} onHandleMessageKeydown={handleMessageKeydown} onInsertMention={insertMention} />{/if}</section>
        <GroupMemberRail
          {user}
          {memberRoleGroups}
          memberCount={groupMembers.length}
          {showMobileMembers}
          onOpenUserContextMenu={openUserContextMenu}
          onOpenDirectConversation={openDirectConversationWithUser}
        />
        </section>
        {/if}
        </div>
      {:else if view === "settings"}
        <section bind:this={settingsPageElement} class="settings-page window-page" class:settings-profile={settingsSection === "profile"} class:settings-channel={settingsSection === "channel"} class:settings-voice={settingsSection === "voice"} class:settings-group={settingsSection === "group"} class:settings-notifications={settingsSection === "notifications"}>
          <SettingsCategoryNav
            {settingsSection}
            {selectedGroupId}
            onSelectSection={selectSettingsSection}
            onLoadGroupAdministration={loadGroupAdministration}
          />
          <SettingsHeading onBack={() => { view = settingsReturnView; }} />
          {#if settingsSection === "channel"}<ChannelProfileSettings bind:channelDisplayName {channelAvatarData} {gameOptions} {channelGames} {channelError} {settingsBusy} onSave={saveChannelProfile} onAvatarChange={handleChannelAvatarChange} onClearAvatar={clearChannelAvatar} onToggleChannelGame={toggleChannelGame} />{/if}
          <div class="settings-layout"><SettingsInternalNav {settingsTab} {selectedGroupId} onSelectTab={(tab) => settingsTab = tab} /><div class="settings-content">{#if settingsTab === "user"}<AccountProfileSettings {settingsBusy} {user} {settingsAvatarData} bind:settingsDisplayName {avatarError} onSave={saveProfile} onAvatarChange={handleAvatarChange} onClearAvatar={clearAvatar} /><PreferencesSettings {settingsBusy} bind:theme bind:selectedQuality bind:audioMode bind:buttonColor bind:inputBackgroundColor bind:backgroundColor onSave={savePreferences} /><LinkedAccountsSettings {user} {providers} />{:else}<GroupAdministrationSettings {selectedGroup} {settingsBusy} bind:groupSettingsName onSave={saveGroupSettings} />{/if}{#if settingsError}<p class="settings-error" role="alert">{settingsError}</p>{/if}</div></div>
        {#if settingsTab === "user" && settingsSection === "profile"}
          <section class="settings-card settings-reset-card">
            <div class="settings-card-heading"><div><p class="eyebrow">preferências</p><h2>Restaurar configurações</h2><p class="muted">Volte o Telai aos valores padrão sem apagar sua conta, grupos, mensagens ou transmissões.</p></div><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => preferencesResetConfirm = !preferencesResetConfirm} disabled={settingsBusy || preferencesResetBusy}>{preferencesResetConfirm ? "Cancelar" : "Restaurar padrões"}</button></div>
            {#if preferencesResetConfirm}<div class="settings-callout settings-reset-callout"><span>Isso restaura tema, cores, qualidade, áudio, volumes, filtros, dispositivos e atalhos. A ação não apaga dados da conta.</span><button class="danger-outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={resetPreferencesToDefaults} disabled={preferencesResetBusy}>{preferencesResetBusy ? "Restaurando…" : "Restaurar agora"}</button></div>{/if}
          </section>
        {/if}
        {#if settingsTab === "user" && settingsSection === "profile" && isDesktop}
          <section class="settings-card desktop-startup-card">
            <div class="settings-card-heading"><div><p class="eyebrow">aplicativo desktop</p><h2>Iniciar com o computador</h2><p class="muted">O Telai será iniciado automaticamente com o Windows e ficará disponível na bandeja.</p></div><label class="permission-toggle desktop-startup-toggle" title="Iniciar o Telai com o computador"><input type="checkbox" bind:checked={launchAtLogin} on:change={toggleLaunchAtLogin} disabled={launchAtLoginBusy} aria-label="Iniciar o Telai com o computador" /><span></span></label></div>
            {#if launchAtLoginError}<p class="settings-error" role="alert">{launchAtLoginError}</p>{/if}
          </section>
        {/if}
         {#if settingsSection === "profile" && isDesktop}
           <section class="settings-card desktop-hardware-card">
             <div class="settings-card-heading"><div><p class="eyebrow">compatibilidade</p><h2>Aceleração gráfica</h2><p class="muted">Use o modo desativado se o Telai causar travamentos, tela preta ou conflito com o driver de vídeo. A alteração exige reiniciar o aplicativo.</p></div><select class="settings-input desktop-hardware-select" value={hardwareAccelerationMode} on:change={setHardwareAcceleration} disabled={hardwareAccelerationBusy} aria-label="Modo de aceleração gráfica"><option value="auto">Automático (recomendado)</option><option value="disabled">Desativada (modo de compatibilidade)</option></select></div>
             {#if hardwareAccelerationError}<p class="settings-error" role="alert">{hardwareAccelerationError}</p>{/if}
           </section>
         {/if}
          {#if settingsTab === "user" && settingsSection === "profile"}<AccountPrivacy user={user} />{/if}
         {#if settingsSection === "voice"}
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
               <div class="voice-test-panel"><div class="voice-test-copy"><div><p class="settings-label">Teste de áudio</p><p class="muted appearance-settings-help">Fale para confirmar se o microfone está sendo capturado antes de entrar em uma sala.</p></div><span class:active={voiceTestRunning} class="voice-test-state">{voiceTestRunning ? "teste ativo" : "pronto para testar"}</span></div><div class:testing={voiceTestRunning} class="voice-test-meter" role="progressbar" aria-label="Nível do microfone" aria-valuemin="0" aria-valuemax="100" aria-valuenow={voiceTestLevel}>{#each Array(32) as _, index}<span class:active={voiceTestRunning && index < Math.ceil(voiceTestLevel / 100 * 32)}></span>{/each}</div><div class="voice-test-actions"><button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => voiceTestRunning ? stopVoiceTest() : startVoiceTest()}>{voiceTestRunning ? "Parar teste" : "Testar microfone"}</button><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={testVoiceSpeaker}>Testar alto-falante</button><small>{voiceTestError || voiceTestSpeakerStatus || voiceTestStatus}</small></div></div>
            <div class="settings-card-heading"><div><p class="eyebrow">áudio e voz</p><h2>Dispositivos de voz</h2><p class="muted">Escolha qual microfone usar e para onde o áudio das salas deve sair. A troca do microfone não desconecta você.</p></div><button class="outline rounded-xl px-4 py-2 text-xs font-extrabold" type="button" on:click={() => loadAudioDevices(true)} disabled={voiceDevicesBusy}>{voiceDevicesBusy ? "Listando…" : "Atualizar dispositivos"}</button></div>
             <div class="settings-form-grid"><label>Microfone<select class="settings-input" bind:value={selectedInputDeviceId} on:change={(event) => applyVoiceInputDevice(event.currentTarget.value)}><option value="">Microfone padrão do sistema</option>{#each audioInputDevices as device, index}<option value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>{/each}</select></label><label>Saída de áudio<select class="settings-input" bind:value={selectedOutputDeviceId} on:change={(event) => applyVoiceOutputDevice(event.currentTarget.value)}><option value="">Saída padrão do sistema</option>{#each audioOutputDevices as device, index}<option value={device.deviceId}>{device.label || `Saída de áudio ${index + 1}`}</option>{/each}</select></label></div><div class="voice-volume-grid"><label><span>Volume do microfone <output>{Math.round(voiceMicrophoneVolume * 100)}%</output></span><input type="range" min="0" max="100" step="1" value={Math.round(voiceMicrophoneVolume * 100)} on:input={(event) => void setVoiceMicrophoneVolume(event.currentTarget.value)} aria-label="Volume do microfone" /></label><label><span>Volume do fone <output>{Math.round(voiceOutputVolume * 100)}%</output></span><input type="range" min="0" max="100" step="1" value={Math.round(voiceOutputVolume * 100)} on:input={(event) => setVoiceOutputVolume(event.currentTarget.value)} aria-label="Volume do fone" /></label></div><div class="voice-input-profiles"><div class="voice-profile-heading"><div><p class="settings-label">Perfil de entrada</p><p class="muted appearance-settings-help">Escolha como o Telai trata o áudio do seu microfone.</p></div></div><label class="voice-profile-option"><input type="radio" name="voice-profile" value="isolation" checked={voiceInputProfile === "isolation"} on:change={() => void applyVoiceInputProfile("isolation")} /><span><strong>Isolamento de Voz</strong><small>Só a sua voz; usa eco, ganho automático e supressão nativa.</small></span></label><label class="voice-profile-option"><input type="radio" name="voice-profile" value="studio" checked={voiceInputProfile === "studio"} on:change={() => void applyVoiceInputProfile("studio")} /><span><strong>Estúdio</strong><small>Áudio cru: microfone aberto e sem processamento.</small></span></label><label class="voice-profile-option"><input type="radio" name="voice-profile" value="custom" checked={voiceInputProfile === "custom"} on:change={() => void applyVoiceInputProfile("custom")} /><span><strong>Personalizado</strong><small>Modo avançado: escolha cada filtro de áudio.</small></span></label></div><div class="push-to-talk-settings"><div class="voice-setting-row"><div><p class="settings-label">Apertar para falar</p><p class="muted appearance-settings-help">Abra o microfone somente enquanto segura a tecla configurada.</p></div><label class="permission-toggle" title="Ativar apertar para falar"><input type="checkbox" checked={pushToTalkEnabled} on:change={togglePushToTalk} aria-label="Ativar apertar para falar" /><span></span></label></div><div class="push-to-talk-row"><button class="outline rounded-xl px-4 py-2 text-xs font-extrabold" type="button" on:click={startPushToTalkCapture}>{pushToTalkCapturing ? "Pressione uma tecla…" : pushToTalkKey ? pushToTalkLabel(pushToTalkKey) : "Definir tecla"}</button><button class="subtle-action" type="button" on:click={clearPushToTalkKey} disabled={!pushToTalkKey && !pushToTalkCapturing}>Limpar</button><span class:active={pushToTalkActive} class="push-to-talk-status">{pushToTalkActive ? "microfone aberto" : pushToTalkKey ? desktopPushToTalkGlobal ? "atalho global configurado" : "tecla configurada" : "nenhuma tecla configurada"}</span></div></div><div class="push-to-talk-settings mute-shortcut-settings"><div><p class="settings-label">Atalho para alternar mudo</p><p class="muted appearance-settings-help">Configure uma tecla ou botão lateral do mouse para ativar e desativar o microfone. No app desktop, teclas funcionam mesmo com outra janela em primeiro plano; botões do mouse funcionam com o Telai em foco.</p></div><div class="push-to-talk-row"><button class="outline rounded-xl px-4 py-2 text-xs font-extrabold" type="button" on:click={startMuteShortcutCapture}>{muteShortcutCapturing ? "Pressione uma tecla ou mouse…" : muteShortcut ? shortcutLabel(muteShortcut) : "Definir atalho"}</button><button class="subtle-action" type="button" on:click={clearMuteShortcut} disabled={!muteShortcut && !muteShortcutCapturing}>Limpar</button><span class="push-to-talk-status">{muteShortcut ? desktopMuteShortcutGlobal ? "atalho global configurado" : "atalho configurado" : "nenhum atalho configurado"}</span></div></div><div class="voice-advanced-settings"><div class="voice-setting-row"><div><p class="settings-label">Mostrar configurações de voz avançadas</p><p class="muted appearance-settings-help">Aviso de áudio não detectado, filtros e controles avançados.</p></div><label class="permission-toggle" title="Mostrar configurações avançadas"><input type="checkbox" checked={voiceAdvancedOpen} on:change={toggleVoiceAdvanced} aria-label="Mostrar configurações de voz avançadas" /><span></span></label></div>{#if voiceAdvancedOpen}<div class="voice-advanced-options"><label><input type="checkbox" checked={voiceAdvancedOptions.echoCancellation} on:change={(event) => updateVoiceAdvancedOption("echoCancellation", event)} /><span>Cancelamento de eco</span></label><label><input type="checkbox" checked={voiceAdvancedOptions.noiseSuppression} on:change={(event) => updateVoiceAdvancedOption("noiseSuppression", event)} /><span>Supressão de ruído</span></label><label><input type="checkbox" checked={voiceAdvancedOptions.autoGainControl} on:change={(event) => updateVoiceAdvancedOption("autoGainControl", event)} /><span>Ganho automático</span></label></div>{/if}</div>
             <div class="voice-sound-settings"><div class="voice-sound-heading"><div><p class="settings-label">Sons e notificações</p><p class="muted appearance-settings-help">Sons curtos para entrada, saída, microfone, mensagens e avisos.</p></div><label class="permission-toggle" title="Ativar efeitos sonoros"><input type="checkbox" checked={soundPreferences.enabled} on:change={handleVoiceSoundEffectsChange} aria-label="Ativar efeitos sonoros" /><span></span></label></div><div class="voice-sound-volume"><label for="voice-sound-volume">Volume dos efeitos</label><input id="voice-sound-volume" type="range" min="0" max="100" step="5" value={Math.round(soundPreferences.volume * 100)} on:input={handleSoundVolumeChange} /><output>{Math.round(soundPreferences.volume * 100)}%</output></div><div class="voice-sound-grid"><label><input type="checkbox" checked={soundPreferences.enter} on:change={(event) => handleSoundPreferenceChange(event, "enter")} /><span>Entrada na sala</span><button type="button" class="sound-preview-button" on:click={() => previewVoiceSound("enter")} aria-label="Testar som de entrada"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.leave} on:change={(event) => handleSoundPreferenceChange(event, "leave")} /><span>Saída da sala</span><button type="button" class="sound-preview-button" on:click={() => previewVoiceSound("leave")} aria-label="Testar som de saída"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.mute} on:change={(event) => handleSoundPreferenceChange(event, "mute")} /><span>Mutar microfone</span><button type="button" class="sound-preview-button" on:click={() => previewVoiceSound("mute")} aria-label="Testar som de mutar"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.unmute} on:change={(event) => handleSoundPreferenceChange(event, "unmute")} /><span>Desmutar microfone</span><button type="button" class="sound-preview-button" on:click={() => previewVoiceSound("unmute")} aria-label="Testar som de desmutar"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.message} on:change={(event) => handleSoundPreferenceChange(event, "message")} /><span>Nova mensagem</span><button type="button" class="sound-preview-button" on:click={() => previewVoiceSound("message")} aria-label="Testar som de mensagem"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label><label><input type="checkbox" checked={soundPreferences.notification} on:change={(event) => handleSoundPreferenceChange(event, "notification")} /><span>Nova notificação</span><button type="button" class="sound-preview-button" on:click={() => previewVoiceSound("notification")} aria-label="Testar som de notificação"><HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={1.8} /></button></label></div></div>
            {#if !audioInputDevices.length && !audioOutputDevices.length}<p class="settings-callout">Clique em “Atualizar dispositivos” para permitir o microfone e listar os equipamentos disponíveis.</p>{/if}
            {#if voiceDevicesError}<p class="settings-error" role="alert">{voiceDevicesError}</p>{/if}
             {#if voiceInputProfile === "custom"}<div class="voice-custom-sensitivity"><div class="voice-setting-row"><div><p class="settings-label">Sensibilidade de fala</p><p class="muted appearance-settings-help">Controla o indicador/borda de fala; não altera os filtros de áudio enviados. No automático, o limiar acompanha o ruído ambiente.</p></div><label class="permission-toggle" title="Ajustar automaticamente a sensibilidade"><input type="checkbox" checked={voiceSensitivityAuto} on:change={updateVoiceSensitivityAuto} aria-label="Ajustar automaticamente a sensibilidade de fala" /><span></span></label></div><p class="voice-sensitivity-auto-label">{voiceSensitivityAuto ? "Detecção automática e adaptativa" : "Limiar manual de detecção"}</p>{#if !voiceSensitivityAuto}<label class="voice-sensitivity-range"><span>Limiar de fala <output>{Math.round(voiceSensitivity * 100)}%</output></span><input type="range" min="0" max="100" step="1" value={Math.round(voiceSensitivity * 100)} on:input={updateVoiceSensitivity} aria-label="Sensibilidade do indicador de fala" /><small>Quanto maior o valor, mais facilmente o indicador de fala será ativado.</small></label>{/if}</div>{/if}
          </section>
        {/if}
        {#if settingsSection === "notifications"}
          <NotificationPreferencesSettings {settingsBusy} {liveNotificationScopes} onSave={savePreferences} onSetScope={setLiveNotificationScope} />
        {/if}
        {#if settingsTab === "group" && selectedGroupId}
          <section class="settings-card role-permission-panel">
            <div class="settings-card-heading"><div><p class="eyebrow">controle de acesso</p><h2>Permissões por cargo</h2><p class="muted">Configure cada cargo uma vez e aplique o mesmo conjunto de permissões a todos os membros atribuídos.</p></div><span class="role-model-badge">modelo por cargos</span></div>
            {#if selectedGroup?.role === "owner"}<form class="admin-create-row role-create-row" on:submit|preventDefault={createGroupRole}><input class="settings-input" bind:value={newRoleName} maxlength="32" placeholder="Nome do novo cargo" required /><input class="role-color-input" type="color" bind:value={newRoleColor} aria-label="Cor do cargo" /><button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="submit">Criar cargo</button></form>{/if}
            <div class="role-settings-layout">
              <div class="role-settings-list-column">
                <nav class="role-settings-list" aria-label="Cargos do grupo" aria-busy={roleOrderSaving}>
                  {#each groupRoles as role, roleIndex}
                    <div class:dragging={draggedRoleId === role.id} class:drag-over={dragOverRoleId === role.id && draggedRoleId !== role.id} class="role-order-item">
                      <button class:active={selectedRole?.id === role.id} class="role-select-button" type="button" role="tab" aria-selected={selectedRole?.id === role.id} aria-describedby="role-order-help" draggable={selectedGroup?.role === "owner" && !roleOrderSaving} on:click={() => { selectedRoleId = role.id; roleMemberSearchQuery = ""; }} on:dragstart={(event) => startRoleDrag(event, role.id)} on:dragover|preventDefault={(event) => handleRoleDragOver(event, role.id)} on:drop|preventDefault={() => void dropRole(role.id)} on:dragend={endRoleDrag}>
                        <span class="role-color-dot" style={`background:${role.color}`}></span>
                        <span><strong>{role.name}</strong><small>{role.isDefault ? "cargo padrão" : "cargo personalizado"}</small></span>
                        <b>{groupMembers.filter((member) => member.roleId === role.id).length}</b>
                      </button>
                      {#if selectedGroup?.role === "owner" && groupRoles.length > 1}<span class="role-order-controls" aria-label={`Mover cargo ${role.name}`}><button type="button" class="role-order-button" title="Mover para cima" aria-label={`Mover ${role.name} para cima`} disabled={roleIndex === 0 || roleOrderSaving} on:click={() => void moveRole(role.id, -1)}><HugeiconsIcon icon={iconFor("arrowUp")} size={15} strokeWidth={1.8} /></button><button type="button" class="role-order-button" title="Mover para baixo" aria-label={`Mover ${role.name} para baixo`} disabled={roleIndex === groupRoles.length - 1 || roleOrderSaving} on:click={() => void moveRole(role.id, 1)}><HugeiconsIcon icon={iconFor("arrowDown")} size={15} strokeWidth={1.8} /></button></span>{/if}
                    </div>
                  {/each}
                </nav>
                {#if groupRoles.length > 1}<p id="role-order-help" class="role-order-help">Arraste um cargo para definir a ordem dos membros. Use os controles de subir e descer pelo teclado.</p>{/if}
              </div>
              {#if selectedRole}
                <div class="role-settings-detail">
                   <div class="role-settings-detail-heading"><div><span class="role-color-dot" style={`background:${selectedRole.color}`}></span><div><h3>{selectedRole.name}</h3><p class="muted">Permissões e participantes deste cargo.</p></div></div><div class="role-detail-actions"><span class="role-owner-badge">{selectedRole.isDefault ? "padrão" : "editável"}</span>{#if selectedGroup?.role === "owner" && !selectedRole.isDefault}<button class="role-delete-button" type="button" on:click={() => deleteGroupRole(selectedRole)}>Excluir cargo</button>{/if}</div></div>
                   <div class="role-summary-strip"><div><small>cargos</small><strong>{groupRoles.length}</strong></div><div><small>neste cargo</small><strong>{groupMembers.filter((member) => member.roleId === selectedRole.id).length}</strong></div><div><small>modelo</small><strong>{selectedRole.isDefault ? "padrão" : "personalizado"}</strong></div></div>
                   {#if selectedGroup?.role === "owner"}<form class="role-identity-editor" on:submit|preventDefault={saveGroupRoleDetails}><label><span>Nome do cargo</span><input class="settings-input" bind:value={roleEditName} maxlength="32" required /></label><label class="role-color-field"><span>Cor</span><input type="color" bind:value={roleEditColor} aria-label="Cor do cargo" /></label><button class="outline rounded-xl px-4 py-2 text-xs font-extrabold" type="submit" disabled={roleEditBusy || roleEditName.trim().length < 2}>{roleEditBusy ? "Salvando…" : "Salvar identidade"}</button></form>{/if}
                   <div class="role-permission-categories">{#each ["Geral", "Texto", "Voz e vídeo"] as category}<section class="permission-category"><p class="permission-category-title">{category}</p>{#each rolePermissionOptions.filter((permission) => permission.category === category) as permission}<label class="role-matrix-row"><span><strong>{permission.label}</strong><small>{permission.description}</small></span><input type="checkbox" checked={Boolean(selectedRole[permission.key])} disabled={selectedGroup?.role !== "owner"} on:change={(event) => updateRolePermission(selectedRole, permission.key, event)} aria-label={`${permission.label} para ${selectedRole.name}`} /></label>{/each}</section>{/each}</div>
                  <section class="role-members-editor" aria-labelledby="role-members-title">
                    <div class="role-members-heading"><div><p class="permission-category-title">participantes</p><h4 id="role-members-title">Membros deste cargo</h4><p class="muted">Marque uma pessoa para atribuí-la a <strong>{selectedRole.name}</strong>. Ao marcar outro cargo, ela sai do anterior.</p></div><span class="role-members-count">{groupMembers.filter((member) => member.roleId === selectedRole.id).length}</span></div>
                    <label class="role-member-search"><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("search")} size={16} strokeWidth={1.8} /></span><input type="search" bind:value={roleMemberSearchQuery} placeholder="Pesquisar membro por nome ou @usuário" aria-label="Pesquisar membro para este cargo" /></label>
                    <div class="role-member-list">
                      {#each filteredRoleMembers as member}
                        {@const memberInRole = member.roleId === selectedRole.id}
                        <label class:assigned={memberInRole} class="role-member-row">
                          <span class="role-assignment-person"><span class="member-avatar">{#if member.avatarData}<img src={member.avatarData} alt="" />{:else}{member.displayName?.slice(0, 1) || "M"}{/if}</span><span><strong>{member.displayName}</strong><small>@{member.username} · {member.roleName || "Membro"}</small></span></span>
                          <input type="checkbox" checked={memberInRole} disabled={selectedGroup?.role !== "owner" || roleMemberActionId === member.id || (selectedRole.isDefault && memberInRole)} on:change={(event) => setRoleMember(selectedRole, member, event.currentTarget.checked)} aria-label={`${memberInRole ? "Remover" : "Atribuir"} ${member.displayName} ${memberInRole ? "deste cargo" : "a este cargo"}`} />
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
            <section class="settings-card">
              <div class="settings-card-heading"><div><p class="eyebrow">acesso</p><h2>Convites</h2><p class="muted">Gere um link temporário para adicionar pessoas a este servidor.</p></div><button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="button" on:click={createGroupInvite} disabled={groupInviteCreating || (selectedGroup?.role !== "owner" && !groupMembers.find((member) => member.id === user.id)?.canInvite)}>{groupInviteCreating ? "Criando…" : "Criar convite"}</button></div>
              <p class="admin-help">Cada convite vale por 72 horas e permite até 5 entradas.</p>
              {#if groupInviteLink}<div class="invite-link-row"><input class="settings-input" readonly value={groupInviteLink} aria-label="Link do convite" /><button class="outline rounded-xl px-3 py-2 text-xs font-extrabold" type="button" on:click={copyGroupInvite}>Copiar</button></div>{/if}
              <div class="invite-table-wrap"><table class="invite-table"><thead><tr><th>Link</th><th>Usos</th><th>Expiração</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>{#each activeGroupInvites as invite, index}<tr><td><code>telai.tv.br/convite/{index + 1}</code></td><td>{invite.uses}/{invite.maxUses}</td><td>{new Date(invite.expiresAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td><td><button class="invite-delete-button" type="button" on:click={() => deleteGroupInvite(invite)} disabled={selectedGroup?.role !== "owner" || groupInviteBusyId === invite.tokenHash} aria-label="Revogar convite" title="Revogar convite">⌫</button></td></tr>{/each}{#if !activeGroupInvites.length}<tr><td class="invite-table-empty" colspan="4">Nenhum convite ativo no momento.</td></tr>{/if}</tbody></table></div>
             </section>
          {#if selectedGroup?.role === "owner"}<section class="settings-card join-requests-card"><div class="settings-card-heading"><div><p class="eyebrow">entrada no grupo</p><h2>Solicitações pendentes</h2><p class="muted">Aprove ou recuse quem pediu para entrar nesta comunidade.</p></div><span class="join-request-count">{groupJoinRequests.length}</span></div>{#if groupJoinRequests.length}<div class="join-request-list">{#each groupJoinRequests as joinRequest}<div class="join-request-row"><span class="member-avatar">{#if joinRequest.avatarData}<img src={joinRequest.avatarData} alt="" />{:else}{joinRequest.displayName?.slice(0, 1) || "M"}{/if}</span><span><strong>{joinRequest.displayName}</strong><small>@{joinRequest.username}</small></span><div class="join-request-actions"><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={groupJoinActionId === joinRequest.id} on:click={() => respondToGroupJoinRequest(joinRequest, "rejected")}>Recusar</button><button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={groupJoinActionId === joinRequest.id} on:click={() => respondToGroupJoinRequest(joinRequest, "approved")}>{groupJoinActionId === joinRequest.id ? "Salvando…" : "Aprovar"}</button></div></div>{/each}</div>{:else}<p class="muted settings-empty">Nenhuma solicitação pendente.</p>{/if}</section>{/if}
          {#if groupAdminError}<p class="settings-error" role="alert">{groupAdminError}</p>{/if}
        {/if}
        </section>
      {:else if view === "multistream"}
        <section class="multistream-page" aria-labelledby="multistream-title">
          <header class="multistream-page-heading">
            <div>
              <p class="eyebrow">visualização simultânea</p>
              <h1 id="multistream-title">Sua central de lives</h1>
              <p class="muted">Acompanhe {selectedStreams.size} transmissões ao mesmo tempo, com cada vídeo em seu próprio espaço.</p>
            </div>
            <div class="multistream-page-actions">
              <button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={closeMultistream}><HugeiconsIcon icon={iconFor("arrowLeft")} size={16} strokeWidth={1.8} /> Voltar para ao vivo</button>
              <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={() => selectView("live")}><HugeiconsIcon icon={iconFor("add")} size={16} strokeWidth={1.8} /> Adicionar live</button>
            </div>
          </header>
          {#if selectedStreams.size >= 2}
            <div class="multistream-page-toolbar">
              <span><i></i> {selectedStreams.size} lives selecionadas</span>
              <small>Você pode remover qualquer transmissão pelo botão × do cartão.</small>
            </div>
            <div class={`multistream-grid multistream-grid-dedicated multistream-grid-count-${Math.min(selectedStreams.size, 4)}`}>
              {#each streams.filter((stream) => selectedStreams.has(stream.id)) as stream}
                <article class="multistream-tile">
                  <div class="multistream-tile-heading">
                    <span><strong>{stream.channelName}</strong><small>{stream.title || "Transmissão ao vivo"}</small></span>
                    <button class="outline" type="button" on:click={() => { toggleStream(stream.id); if (selectedStreams.size < 3) closeMultistream(); }} aria-label={`Remover ${stream.channelName} da grade`}>×</button>
                  </div>
                  <iframe src={streamViewerUrl(stream, true)} title={`Transmissão de ${stream.channelName}`} allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
                </article>
              {/each}
            </div>
          {:else}
            <div class="multistream-empty panel">
              <span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("sparkles")} size={24} strokeWidth={1.8} /></span>
              <h2>Escolha pelo menos duas lives</h2>
              <p class="muted">Volte para “Ao vivo”, selecione os canais que deseja acompanhar e abra a central novamente.</p>
              <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={() => selectView("live")}>Escolher transmissões</button>
            </div>
          {/if}
        </section>
       {:else}
        <section class="live-page window-page" aria-labelledby="live-title"><div class="live-page-heading flex flex-wrap items-end justify-between gap-4"><div><p class="eyebrow">telai</p><h1 id="live-title">Ao vivo agora</h1><p class="muted">Escolha canais públicos e monte uma seleção para acompanhar as transmissões.</p></div><div class="live-page-actions flex gap-2"><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={() => { followingOnly = !followingOnly; void loadStreams().catch((error) => { notice = error.message; }); }}>{followingOnly ? "Todos os canais" : "Seguindo"}</button><button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={openMultistream} disabled={selectedStreams.size < 2}>Multistream · {selectedStreams.size}</button></div></div><div class="live-page-grid mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{#if streams.length}{#each streams as stream}<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role --><article class:stream-card-selected={selectedStreams.has(stream.id)} class="card stream-selection-card rounded-2xl p-5" role="button" tabindex="0" aria-pressed={selectedStreams.has(stream.id)} aria-label={`Selecionar live de ${stream.channelName}`} on:click={(event) => handleStreamCardClick(event, stream)} on:keydown={(event) => handleStreamCardKeydown(event, stream)}><div class="flex items-center justify-between"><span class="text-[10px] font-extrabold uppercase tracking-[.16em] text-emerald-300">● ao vivo · {stream.groupName || "público"}</span><input type="checkbox" checked={selectedStreams.has(stream.id)} on:change={() => toggleStream(stream.id)} aria-label="Adicionar à seleção" /></div><div class="stream-card-identity"><span class="stream-channel-avatar">{#if stream.channelAvatarData}<img src={stream.channelAvatarData} alt="" />{:else}{stream.channelName?.slice(0, 1) || "M"}{/if}</span><div><h2 class="text-xl font-black text-white">{stream.channelName}</h2>{#if stream.channelGames?.length}<p class="stream-game-line">{stream.channelGames.slice(0, 3).join(" · ")}</p>{/if}</div></div><p class="muted mt-1 text-sm">{stream.title || "Transmissão ao vivo"}</p><div class="mt-5 flex flex-wrap gap-2"><button class="primary rounded-lg px-3 py-2 text-xs font-extrabold no-underline" type="button" on:click={() => openStreamViewer(stream)}>Assistir →</button><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={() => toggleStream(stream.id)}>{selectedStreams.has(stream.id) ? "Selecionado" : "Adicionar"}</button><button class="social-follow-button" class:active={stream.following} type="button" on:click|stopPropagation={() => toggleFollowStream(stream)} disabled={socialActionId === `follow:${stream.createdBy}`}>{stream.following ? "Seguindo" : "Seguir canal"}</button></div></article>{/each}{:else}<div class="live-empty-state card col-span-full border-dashed text-center"><span class="live-empty-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("radio")} size={24} strokeWidth={1.8} /></span><strong>Nenhuma live pública agora</strong><p class="muted">Quando alguém abrir um canal público, ele aparecerá aqui.</p></div>{/if}</div></section>
      {/if}
  </main>
  {/if}

  {#if selectedRoomRemoteVoice}
    <div class="voice-remote-session-banner" role="status">
      <div><strong>Você já está nesta sala em outra janela.</strong><span>Ao entrar pelo app, a outra janela sairá automaticamente da sala.</span></div>
      <button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={joinVoiceRoom}>Entrar nesta janela →</button>
    </div>
  {/if}
  <LegalConsentGate user={user} on:accepted={handleLegalConsentAccepted} />
  {#if voicePlaybackBlocked && voiceState === "connected" && !voiceDeafened}
    <div class="voice-playback-banner" role="status">
      <span>O navegador bloqueou o áudio da sala.</span>
      <button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={resumeVoiceRemoteAudio}>Ativar áudio da sala</button>
    </div>
  {/if}
  {#if groupContextMenu}
    <div class="group-context-menu" role="menu" tabindex="-1" style={`left:${groupContextMenu.x}px;top:${groupContextMenu.y}px`} on:click|stopPropagation on:keydown|stopPropagation={handleGroupContextMenuKeydown}>
      <div class="group-context-heading"><span class="community-avatar">{groupContextMenu.group.name.slice(0, 2).toUpperCase()}</span><span><strong>{groupContextMenu.group.name}</strong><small>{groupContextMenu.group.role === "owner" ? "dono do grupo" : "membro do grupo"}</small></span></div>
      <button type="button" on:click={() => runGroupContextAction("open")}>Abrir grupo</button>
      <button type="button" on:click={() => runGroupContextAction("invite")} disabled={groupContextMenu.group.role !== "owner" && (selectedGroupId !== groupContextMenu.group.id || !currentGroupMember?.canInvite)}>Convidar pessoas</button>
      <button type="button" on:click={() => runGroupContextAction("invite-link")} disabled={groupContextMenu.group.role !== "owner" && (selectedGroupId !== groupContextMenu.group.id || !currentGroupMember?.canInvite)}>Criar link de convite</button>
      <button type="button" on:click={() => runGroupContextAction("settings")}>Configurar grupo</button>
      {#if groupContextMenu.group.role !== "owner"}<div class="group-context-divider"></div><button class="group-context-danger" type="button" on:click={() => runGroupContextAction("leave")}>Sair do grupo</button>{:else}<div class="group-context-divider"></div><button class="group-context-danger" type="button" on:click={() => runGroupContextAction("delete")}>Excluir grupo</button>{/if}
    </div>
  {/if}
  {#if roomContextMenu}
    <div class="group-context-menu room-context-menu" role="menu" tabindex="-1" style={`left:${roomContextMenu.x}px;top:${roomContextMenu.y}px`} on:click|stopPropagation on:keydown|stopPropagation={handleRoomContextMenuKeydown}>
      <div class="group-context-heading"><span class="community-avatar">{roomContextMenu.room.kind === "voice" ? "⌁" : "#"}</span><span><strong>{roomContextMenu.room.kind === "voice" ? "⌁" : "#"}{roomContextMenu.room.name}</strong><small>{roomContextMenu.room.kind === "voice" ? "canal de voz" : "canal de texto"}</small></span></div>
      <button type="button" on:click={() => runRoomContextAction("open")}>{roomContextMenu.room.kind === "voice" ? "Entrar no canal" : "Abrir canal"}</button>
      <button type="button" on:click={() => runRoomContextAction("read")}>Marcar como lido</button>
      <button type="button" on:click={() => runRoomContextAction("copy")}>Copiar link</button>
      {#if selectedGroup?.role === "owner" && roomContextMenu.room.slug !== "geral"}
        <div class="group-context-divider"></div>
        <button type="button" on:click={() => runRoomContextAction("edit")}>Editar canal</button>
        <button class="group-context-danger" type="button" on:click={() => runRoomContextAction("delete")}>Excluir canal</button>
      {/if}
    </div>
  {/if}
  {#if voiceContextMenu}
    <div class="voice-context-menu" role="menu" tabindex="-1" style={`left:${voiceContextMenu.x}px;top:${voiceContextMenu.y}px`} on:click|stopPropagation on:keydown|stopPropagation={handleVoiceContextMenuKeydown}>
      <div class="voice-context-heading"><span class="member-avatar">{voiceContextMenu.participant.displayName?.slice(0, 1) || "M"}</span><span><strong>{voiceParticipantDisplayName(voiceContextMenu.participant)}</strong><small>@{voiceContextMenu.participant.username || "participante"}</small></span></div>
      <button type="button" on:click={() => showVoiceProfile(voiceContextMenu.participant)}>Perfil</button>
      {#if voiceContextMenu.participant.userId !== user?.id}<button type="button" on:click={() => sendFriendRequestFromContext(voiceContextMenu.participant)} disabled={socialActionId === voiceContextMenu.participant.userId}>{socialActionId === voiceContextMenu.participant.userId ? "Enviando…" : "Adicionar amigo"}</button>{/if}
      <button type="button" disabled={voiceContextMenu.participant.userId === user?.id} on:click={() => openDirectConversationWithUser(voiceContextMenu.participant)}>Enviar mensagem</button>
      <button type="button" on:click={() => mentionVoiceParticipant(voiceContextMenu.participant)}>Mencionar no chat</button>
      <label class="voice-context-volume"><span>Volume do usuário</span><input type="range" min="0" max="100" value={Math.round((voiceVolumes.get(voiceContextMenu.participant.id) ?? 1) * 100)} on:input={(event) => setVoiceVolume(voiceContextMenu.participant.id, event.currentTarget.value)} /></label>
      {#if voiceContextMenu.participant.isLocal}
        <button type="button" on:click={toggleContextParticipantServerMute}>{voiceContextMenu.participant.muted ? "Ativar meu microfone" : "Silenciar meu microfone"}</button>
      {:else}
        <button type="button" on:click={() => toggleVoiceParticipantLocalMute(voiceContextMenu.participant.id)}>{isVoiceParticipantLocallyMuted(voiceContextMenu.participant.id) ? "Ativar som para mim" : "Silenciar para mim"}</button>
        {#if canMoveVoiceMembers && voiceContextMenu.roomId === voiceRoomId}
          <button type="button" on:click={toggleContextParticipantServerMute}>{voiceContextMenu.participant.serverMuted ? "Reativar microfone na sala" : "Silenciar na sala"}</button>
        {/if}
      {/if}
      {#if canMoveVoiceMembers && voiceContextMenu.roomId === voiceRoomId && !voiceContextMenu.participant.isLocal}
        <div class="voice-context-divider"></div>
        <span class="voice-context-label">Mover para</span>
        {#each voiceRooms.filter((room) => room.id !== voiceContextMenu.roomId) as room}<button type="button" on:click={() => moveContextParticipant(room.id)}>⌁ {room.name}</button>{/each}
        <button class="voice-context-danger" type="button" on:click={disconnectContextParticipant}>Desconectar da sala</button>
      {:else if voiceContextMenu.participant.isLocal}
        <button class="voice-context-danger" type="button" on:click={disconnectContextParticipant}>Sair da sala</button>
      {/if}
    </div>
  {/if}
  {#if profilePreview}
    <div class="modal-backdrop" role="presentation" on:click={() => profilePreview = null}>
      <div class="modal-shell modal-compact voice-profile-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="voice-profile-title" on:click|stopPropagation on:keydown|stopPropagation>
        <header class="modal-header"><div><p class="eyebrow">perfil</p><h2 id="voice-profile-title">{voiceParticipantDisplayName(profilePreview)}</h2><p class="muted">@{profilePreview.username || "participante"}</p></div><button class="modal-close outline" type="button" aria-label="Fechar perfil" on:click={() => profilePreview = null}>×</button></header>
        <div class="voice-profile-body"><span class="voice-profile-avatar">{profilePreview.displayName?.slice(0, 1) || "M"}</span><p class="muted">Participante da sala <strong>{activeVoiceRoom?.name || "de voz"}</strong>.</p></div>
      </div>
    </div>
  {/if}
  {#if showInviteDialog}
    <div class="modal-backdrop" role="presentation">
      <div class="modal-shell invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-dialog-title">
        <header class="modal-header">
          <div><p class="eyebrow">membros do grupo</p><h2 id="invite-dialog-title">Convidar para {selectedGroup?.name}</h2><p class="muted">Pesquise pelo nome ou pelo @usuário e envie um convite direto.</p></div>
          <button class="modal-close outline" type="button" aria-label="Fechar convite" on:click={() => showInviteDialog = false}>×</button>
        </header>
        <div class="modal-body">
          <form class="modal-search-row" on:submit|preventDefault={searchUsers}><input class="settings-input" bind:value={inviteSearchQuery} placeholder="Nome ou @usuário" autocomplete="off" /><button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="submit" disabled={inviteSearchBusy}>{inviteSearchBusy ? "Buscando…" : "Pesquisar"}</button></form>
          {#if inviteSearchError}<p class="settings-error" role="alert">{inviteSearchError}</p>{/if}
          <div class="invite-search-results">{#each inviteSearchResults as target}<div class="invite-search-result"><span class="member-avatar">{#if target.avatarData}<img src={target.avatarData} alt="" />{:else}{target.displayName?.slice(0, 1) || "M"}{/if}</span><span><strong>{target.displayName}</strong><small>@{target.username}</small></span><button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={inviteActionId === target.id} on:click={() => inviteUser(target)}>{inviteActionId === target.id ? "Enviando…" : "Convidar"}</button></div>{/each}</div>
          <div class="invite-dialog-divider"><span>ou compartilhe um link temporário</span></div>
          <button class="outline w-full rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={createGroupInvite} disabled={groupInviteCreating}>{groupInviteCreating ? "Gerando…" : "Gerar link de convite"}</button>
          {#if groupInviteLink}<div class="invite-link-row"><input class="settings-input" readonly value={groupInviteLink} aria-label="Link do convite" /><button class="outline rounded-xl px-3 py-2 text-xs font-extrabold" type="button" on:click={copyGroupInvite}>Copiar</button></div>{/if}
        </div>
      </div>
    </div>
  {/if}
  {#if showGroupSearchDialog}
    <div class="modal-backdrop" role="presentation" on:click={() => showGroupSearchDialog = false}>
      <div class="modal-shell modal-compact group-search-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="group-search-dialog-title" on:click|stopPropagation on:keydown|stopPropagation>
        <header class="modal-header"><div><p class="eyebrow">descobrir comunidades</p><h2 id="group-search-dialog-title">Pesquisar grupos</h2><p class="muted">Encontre um grupo pelo nome e solicite sua entrada.</p></div><button class="modal-close outline" type="button" aria-label="Fechar pesquisa de grupos" on:click={() => showGroupSearchDialog = false}>×</button></header>
        <div class="modal-body"><form class="modal-search-row" on:submit|preventDefault={searchGroups}><input class="settings-input" bind:value={groupSearchQuery} placeholder="Nome do grupo" autocomplete="off" /> <button class="primary rounded-xl px-4 py-2 text-xs font-extrabold" type="submit" disabled={groupSearchBusy}>{groupSearchBusy ? "Buscando…" : "Pesquisar"}</button></form>{#if groupSearchError}<p class="settings-error" role="alert">{groupSearchError}</p>{/if}{#if groupSearchResults.length}<div class="group-discovery-results">{#each groupSearchResults as group}<div class="group-discovery-result"><span class="community-avatar">{group.name.slice(0, 2).toUpperCase()}</span><span><strong>{group.name}</strong><small>por {group.ownerName} · {group.memberCount} {group.memberCount === 1 ? "membro" : "membros"}</small></span>{#if group.requestStatus === "pending"}<span class="group-request-status">Pendente</span>{:else if group.requestStatus === "rejected"}<button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={groupJoinActionId === group.id} on:click={() => requestGroupEntry(group)}>Solicitar novamente</button>{:else}<button class="outline rounded-lg px-3 py-2 text-xs font-extrabold" type="button" disabled={groupJoinActionId === group.id} on:click={() => requestGroupEntry(group)}>{groupJoinActionId === group.id ? "Enviando…" : "Solicitar entrada"}</button>{/if}</div>{/each}</div>{/if}</div>
      </div>
    </div>
  {/if}
  {#if showLeaveGroupDialog}
    <div class="modal-backdrop" role="presentation" on:click={() => !leaveGroupBusy && (showLeaveGroupDialog = false)}>
      <div class="modal-shell modal-compact" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="leave-group-title" on:click|stopPropagation on:keydown|stopPropagation>
        <form on:submit|preventDefault={leaveSelectedGroup}>
          <header class="modal-header"><div><p class="eyebrow">sair da comunidade</p><h2 id="leave-group-title">Sair de {selectedGroup?.name}</h2><p class="muted">Você perderá acesso aos canais e precisará solicitar entrada novamente para voltar.</p></div><button class="modal-close outline" type="button" aria-label="Fechar confirmação" on:click={() => !leaveGroupBusy && (showLeaveGroupDialog = false)}>×</button></header>
          <div class="modal-body">{#if leaveGroupError}<p class="settings-error" role="alert">{leaveGroupError}</p>{/if}<p class="settings-callout danger-callout">Essa ação remove você do grupo, mas não exclui a comunidade.</p></div>
          <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={() => showLeaveGroupDialog = false} disabled={leaveGroupBusy}>Cancelar</button><button type="submit" class="danger-outline rounded-xl px-4 py-2 text-sm font-bold" disabled={leaveGroupBusy}>{leaveGroupBusy ? "Saindo…" : "Sair do grupo"}</button></footer>
        </form>
      </div>
    </div>
  {/if}
  {#if showDeleteRoomDialog}
    <div class="modal-backdrop" role="presentation" on:click={() => !deleteRoomBusy && (showDeleteRoomDialog = false)}>
      <div class="modal-shell modal-compact" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="delete-room-title" on:click|stopPropagation on:keydown|stopPropagation>
        <header class="modal-header"><div><p class="eyebrow">excluir canal</p><h2 id="delete-room-title">Excluir #{deleteRoomTarget?.name}</h2><p class="muted">As mensagens deste canal também serão removidas. Essa ação não pode ser desfeita.</p></div><button class="modal-close outline" type="button" aria-label="Fechar confirmação" on:click={() => !deleteRoomBusy && (showDeleteRoomDialog = false)}>×</button></header>
        <div class="modal-body">{#if deleteRoomError}<p class="settings-error" role="alert">{deleteRoomError}</p>{/if}<p class="settings-callout danger-callout">Confirme somente se você deseja apagar o canal e todo o histórico dele.</p></div>
        <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={() => !deleteRoomBusy && (showDeleteRoomDialog = false)} disabled={deleteRoomBusy}>Cancelar</button><button type="button" class="danger-outline rounded-xl px-4 py-2 text-sm font-bold" on:click={confirmDeleteGroupRoom} disabled={deleteRoomBusy}>{deleteRoomBusy ? "Excluindo…" : "Excluir canal"}</button></footer>
      </div>
    </div>
  {/if}
  {#if showDeleteGroupDialog}
    <div class="modal-backdrop" role="presentation" on:click={() => !deleteGroupBusy && (showDeleteGroupDialog = false)}>
      <div class="modal-shell modal-compact" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="delete-group-title" on:click|stopPropagation on:keydown|stopPropagation>
        <form on:submit|preventDefault={deleteSelectedGroup}>
          <header class="modal-header"><div><p class="eyebrow">excluir comunidade</p><h2 id="delete-group-title">Excluir {selectedGroup?.name}</h2><p class="muted">Essa ação remove o grupo, os canais, mensagens, cargos e convites de forma permanente.</p></div><button class="modal-close outline" type="button" aria-label="Fechar confirmação" on:click={() => !deleteGroupBusy && (showDeleteGroupDialog = false)}>×</button></header>
          <div class="modal-body">{#if deleteGroupError}<p class="settings-error" role="alert">{deleteGroupError}</p>{/if}<p class="settings-callout danger-callout">Não será possível recuperar esta comunidade depois da exclusão.</p></div>
          <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={() => showDeleteGroupDialog = false} disabled={deleteGroupBusy}>Cancelar</button><button type="submit" class="danger-outline rounded-xl px-4 py-2 text-sm font-bold" disabled={deleteGroupBusy}>{deleteGroupBusy ? "Excluindo…" : "Excluir grupo"}</button></footer>
        </form>
      </div>
    </div>
  {/if}
  {#if showPublicBroadcastSetup}
    <div class="modal-backdrop" role="presentation" on:click={cancelPublicBroadcastSetup}>
      <div class="modal-shell public-broadcast-setup" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="public-broadcast-setup-title" on:click|stopPropagation on:keydown|stopPropagation>
        <form class="public-broadcast-setup-form" on:submit|preventDefault={confirmPublicBroadcastSetup}>
        <header class="modal-header"><div><p class="eyebrow">live pública · electron</p><h2 id="public-broadcast-setup-title">Configure sua transmissão</h2><p class="muted">Defina o que será compartilhado antes de abrir qualquer captura.</p></div><button class="modal-close outline" type="button" aria-label="Fechar configuração da transmissão" on:click={cancelPublicBroadcastSetup}>×</button></header>
        <div class="modal-body public-broadcast-setup-body">
          <label class="modal-field">Título da live<input class="settings-input" bind:value={publicBroadcastTitle} maxlength="120" placeholder="Ex.: Jogando Kingdom Come Deliverance 2" required /></label>
          <fieldset class="public-broadcast-fieldset"><legend>O que você quer compartilhar?</legend><div class="public-broadcast-source-options">
            <label class:active={publicBroadcastSourceKind === "screen"} class="public-broadcast-source-option"><input type="radio" bind:group={publicBroadcastSourceKind} value="screen" /><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("computerScreen")} size={20} strokeWidth={1.8} /></span><span><strong>Tela inteira</strong><small>{isDesktop ? "Imagem do monitor e áudio do computador, com Telai e Discord excluídos." : "Imagem do monitor e áudio autorizado no seletor do navegador."}</small></span></label>
            <label class:active={publicBroadcastSourceKind === "window"} class="public-broadcast-source-option"><input type="radio" bind:group={publicBroadcastSourceKind} value="window" /><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={AppWindowIcon} size={20} strokeWidth={1.8} /></span><span><strong>Janela</strong><small>Somente a janela escolhida e o áudio dela.</small></span></label>
            <label class:active={publicBroadcastSourceKind === "app"} class="public-broadcast-source-option"><input type="radio" bind:group={publicBroadcastSourceKind} value="app" /><span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("live")} size={20} strokeWidth={1.8} /></span><span><strong>Aplicativo</strong><small>Escolha um aplicativo na lista e capture somente ele.</small></span></label>
          </div></fieldset>
          <div class="public-broadcast-setup-grid"><label>Qualidade<select class="settings-input" bind:value={publicBroadcastQuality}><option value="economy">Leve · 540p30</option><option value="balanced">Equilibrada · 720p30</option><option value="high">Alta · 1080p60</option></select></label><div class="public-broadcast-audio-summary"><span class="settings-label">Áudio da transmissão</span><strong>{publicBroadcastAudioLabel()}</strong><small>Definido automaticamente pela fonte.</small></div></div>
          <fieldset class="public-broadcast-fieldset"><legend>Dispositivos opcionais</legend><div class="public-broadcast-device-grid">
            <label class="public-broadcast-toggle"><input type="checkbox" bind:checked={publicBroadcastMicrophoneEnabled} /><span><strong>Ativar microfone</strong><small>Inclui sua voz na transmissão.</small></span></label>
            {#if publicBroadcastMicrophoneEnabled}<label>Microfone<select class="settings-input" bind:value={selectedInputDeviceId}><option value="">Microfone padrão do sistema</option>{#each audioInputDevices as device, index}<option value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>{/each}</select></label>{/if}
            <label class="public-broadcast-toggle"><input type="checkbox" bind:checked={publicBroadcastCameraEnabled} /><span><strong>Ativar câmera</strong><small>Mostra sua câmera sobre a transmissão.</small></span></label>
            {#if publicBroadcastCameraEnabled}<label>Câmera<select class="settings-input" bind:value={publicBroadcastCameraDeviceId}><option value="">Câmera padrão do sistema</option>{#each cameraInputDevices as device, index}<option value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>{/each}</select></label>{/if}
          </div></fieldset>
          {#if broadcastError}<p class="settings-error" role="alert">{broadcastError}</p>{/if}
        </div>
        <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={cancelPublicBroadcastSetup}>Cancelar</button><button type="submit" class="primary rounded-xl px-4 py-2 text-sm font-bold">Escolher fonte <HugeiconsIcon icon={iconFor("arrowRight")} size={16} strokeWidth={1.8} /></button></footer>
        </form>
      </div>
    </div>
  {/if}
  {#if showPublicBroadcastReview}
    <div class="modal-backdrop" role="presentation">
      <div class="modal-shell modal-compact public-broadcast-review" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="public-broadcast-review-title" on:click|stopPropagation on:keydown|stopPropagation>
        <header class="modal-header"><div><p class="eyebrow">última revisão</p><h2 id="public-broadcast-review-title">Tudo pronto para entrar ao vivo?</h2><p class="muted">Nada foi publicado ainda. Confirme para abrir a live pública.</p></div></header>
        <div class="modal-body public-broadcast-review-body"><div class="public-broadcast-review-row"><span>Live</span><strong>{broadcastTitle || "Transmissão pública"}</strong></div><div class="public-broadcast-review-row"><span>Fonte</span><strong>{publicBroadcastSourceLabel(broadcastSelectionKind)}{broadcastSelectedSourceName ? ` · ${broadcastSelectedSourceName}` : ""}</strong></div><div class="public-broadcast-review-row"><span>Áudio</span><strong>{publicBroadcastAudioLabel(broadcastSelectionKind)}</strong></div><div class="public-broadcast-review-row"><span>Dispositivos</span><strong>{broadcastMicrophoneEnabled ? "Microfone ativado" : "Sem microfone"} · {broadcastCameraEnabled ? "Câmera ativada" : "Sem câmera"}</strong></div><div class="public-broadcast-review-row"><span>Qualidade</span><strong>{qualityProfiles[selectedQuality]?.label} · {qualityProfiles[selectedQuality]?.width}×{qualityProfiles[selectedQuality]?.height} a {qualityProfiles[selectedQuality]?.maxFramerate} FPS</strong></div></div>
        <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={cancelPublicBroadcastReview}>Cancelar</button><button type="button" class="primary rounded-xl px-4 py-2 text-sm font-bold" on:click={confirmPublicBroadcastReview}>Iniciar transmissão <HugeiconsIcon icon={iconFor("arrowRight")} size={16} strokeWidth={1.8} /></button></footer>
      </div>
    </div>
  {/if}
  {#if showBroadcastVisibilityDialog}
    <div class="modal-backdrop" role="presentation" on:click={cancelBroadcastVisibility}>
      <div class="modal-shell modal-compact broadcast-visibility-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="broadcast-visibility-title" on:click|stopPropagation on:keydown|stopPropagation>
        <header class="modal-header"><div><p class="eyebrow">iniciar live</p><h2 id="broadcast-visibility-title">Quem poderá assistir?</h2><p class="muted">Escolha onde a transmissão desta sala ficará disponível.</p></div><button class="modal-close outline" type="button" aria-label="Fechar escolha de visibilidade" on:click={cancelBroadcastVisibility}>×</button></header>
        <div class="modal-body broadcast-visibility-options">
          <label class:active={broadcastVisibility === "private"} class="broadcast-visibility-option"><input type="radio" bind:group={broadcastVisibility} value="private" /><span><strong>Privada neste grupo</strong><small>A live aparece no topo e dentro desta sala de voz para os membros do grupo.</small></span></label>
          <label class:active={broadcastVisibility === "public"} class="broadcast-visibility-option"><input type="radio" bind:group={broadcastVisibility} value="public" /><span><strong>Pública</strong><small>A live fica disponível no canal Ao vivo, como as transmissões públicas atuais.</small></span></label>
        </div>
        <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={cancelBroadcastVisibility}>Cancelar</button><button type="button" class="primary rounded-xl px-4 py-2 text-sm font-bold" on:click={confirmBroadcastVisibility}>Escolher tela <HugeiconsIcon icon={iconFor("arrowRight")} size={16} strokeWidth={1.8} /></button></footer>
      </div>
    </div>
  {/if}
  {#if showDisplayPicker}
    <div class="display-picker-backdrop" role="presentation">
      <div class="modal-shell display-picker" role="dialog" aria-modal="true" aria-labelledby="display-picker-title">
        <header class="modal-header"><div><p class="eyebrow">transmitir tela</p><h2 id="display-picker-title">Escolha o que transmitir</h2><p class="muted">Selecione uma janela ou uma tela inteira para começar sua live.</p></div><button class="modal-close outline" type="button" aria-label="Cancelar seleção" on:click={cancelDisplayPicker}>×</button></header>
        <div class="modal-body display-picker-body">
          <div class="display-picker-guide" role="tablist" aria-label="Filtrar fontes de transmissão">
            <button class:active={displaySourceFilter === "all"} class="display-picker-guide-item" type="button" role="tab" aria-selected={displaySourceFilter === "all"} on:click={() => displaySourceFilter = "all"}><span class="display-picker-guide-icon all telai-icon"><HugeiconsIcon icon={iconFor("sparkles")} size={20} strokeWidth={1.8} /></span><span><strong>Todas as fontes</strong><small>Mostrar monitores e janelas disponíveis.</small></span></button>
            <button class:active={displaySourceFilter === "screen"} class:unavailable={!displayPickerAvailability.screen} class="display-picker-guide-item" type="button" role="tab" aria-selected={displaySourceFilter === "screen"} disabled={!displayPickerAvailability.screen} on:click={() => displaySourceFilter = "screen"}><span class="display-picker-guide-icon screen telai-icon"><HugeiconsIcon icon={iconFor("live")} size={20} strokeWidth={1.8} /></span><span><strong>Monitor inteiro</strong><small>Ideal para jogos e tudo que está na tela.</small></span></button>
            <button class:active={displaySourceFilter === "window"} class:unavailable={!displayPickerAvailability.window} class="display-picker-guide-item" type="button" role="tab" aria-selected={displaySourceFilter === "window"} disabled={!displayPickerAvailability.window} on:click={() => displaySourceFilter = "window"}><span class="display-picker-guide-icon window telai-icon"><HugeiconsIcon icon={AppWindowIcon} size={20} strokeWidth={1.8} /></span><span><strong>Janela do aplicativo</strong><small>Ideal para transmitir só um programa.</small></span></button>
            <button class:active={displaySourceFilter === "tab"} class:unavailable={!displayPickerAvailability.tab} class="display-picker-guide-item" type="button" role="tab" aria-selected={displaySourceFilter === "tab"} disabled={!displayPickerAvailability.tab} on:click={() => displaySourceFilter = "tab"}><span class="display-picker-guide-icon tab telai-icon"><HugeiconsIcon icon={BrowserIcon} size={20} strokeWidth={1.8} /></span><span><strong>Guia do navegador</strong><small>{displayPickerAvailability.tab ? "Compartilha somente esta guia." : "Indisponível no app; escolha a janela do navegador."}</small></span></button>
          </div>
          {#if displaySourceFilter !== "all" && !displaySourceGroups.length}
            <div class="display-picker-filter-empty"><strong>Nenhuma fonte nesta categoria</strong><p class="muted">Escolha outra categoria ou mostre todas as fontes disponíveis.</p><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={() => displaySourceFilter = "all"}>Mostrar todas</button></div>
          {:else}{#each displaySourceGroups as group}
            <section class="display-source-section" aria-labelledby={`display-source-${group.id}`}>
              <header class="display-source-section-heading"><div><h3 id={`display-source-${group.id}`}><span class="display-source-heading-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor(group.icon)} size={18} strokeWidth={1.8} /></span>{group.label}</h3><p>{group.description}</p></div><span class="display-source-count">{group.sources.length} opção{group.sources.length === 1 ? "" : "ões"}</span></header>
              <div class="display-source-grid">{#each group.sources as source}<button class="display-source-card" type="button" on:click={() => selectDisplaySource(source)}><span class="display-source-preview">{#if source.thumbnail}<img src={source.thumbnail} alt="Prévia de {source.name}" />{:else}<span class="display-source-preview-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor(group.icon)} size={34} strokeWidth={1.8} /></span>{/if}</span><span class="display-source-copy"><strong>{source.name}</strong><small>{group.id === "screen" ? "Monitor inteiro · captura tudo" : "Janela do aplicativo · somente esta janela"}</small></span></button>{/each}</div>
            </section>
          {/each}{/if}
        </div>
        <footer class="modal-footer display-picker-footer"><span class="muted">O áudio segue a opção escolhida na tela de transmissão.</span><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={cancelDisplayPicker}>Cancelar</button></footer>
      </div>
    </div>
  {/if}
  {#if showBroadcastAudioPicker}
    <div class="display-picker-backdrop" role="presentation">
      <div class="modal-shell display-picker broadcast-audio-picker" role="dialog" aria-modal="true" aria-labelledby="broadcast-audio-picker-title">
        <header class="modal-header"><div><p class="eyebrow">áudio da transmissão</p><h2 id="broadcast-audio-picker-title">Escolha o aplicativo que terá áudio</h2><p class="muted">A tela inteira continuará visível, mas somente o aplicativo escolhido será ouvido. Discord e Telai ficam fora automaticamente.</p></div><button class="modal-close outline" type="button" aria-label="Cancelar seleção de áudio" on:click={cancelBroadcastAudioPicker}>×</button></header>
        <div class="modal-body display-picker-body">
          {#if broadcastAudioSourceCandidates.length}<section class="display-source-section" aria-labelledby="broadcast-audio-source-title"><header class="display-source-section-heading"><div><h3 id="broadcast-audio-source-title"><span class="display-source-heading-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("volume")} size={18} strokeWidth={1.8} /></span>Aplicativos disponíveis</h3><p>Escolha o jogo ou programa que deve entrar na transmissão.</p></div><span class="display-source-count">{broadcastAudioSourceCandidates.length} opção{broadcastAudioSourceCandidates.length === 1 ? "" : "ões"}</span></header><div class="display-source-grid">{#each broadcastAudioSourceCandidates as source}<button class="display-source-card" type="button" on:click={() => selectBroadcastAudioSource(source)}><span class="display-source-preview">{#if source.thumbnail}<img src={source.thumbnail} alt="Prévia de {source.name}" />{:else}<span class="display-source-preview-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("volume")} size={34} strokeWidth={1.8} /></span>{/if}</span><span class="display-source-copy"><strong>{source.name}</strong><small>{source.processName || "Aplicativo"} · somente áudio</small></span></button>{/each}</div></section>{:else}<div class="display-picker-filter-empty"><strong>Nenhum aplicativo de áudio disponível</strong><p class="muted">Abra o jogo ou programa que deseja transmitir e tente novamente.</p></div>{/if}
        </div>
        <footer class="modal-footer display-picker-footer"><span class="muted">O áudio do Discord e do Telai não será incluído.</span><button class="outline rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={skipBroadcastAudioSource}>Continuar sem áudio</button></footer>
      </div>
    </div>
  {/if}
  {#if showGroupDialog}
    <div class="modal-backdrop" role="presentation">
      <form class="modal-shell modal-compact" on:submit|preventDefault={createGroup}>
        <header class="modal-header"><div><p class="eyebrow">organização</p><h2 id="group-dialog-title">Criar grupo</h2><p class="muted">Crie um espaço para organizar seus canais e pessoas.</p></div><button class="modal-close outline" type="button" aria-label="Fechar criação de grupo" on:click={() => showGroupDialog = false}>×</button></header>
        <div class="modal-body"><label class="modal-field">Nome do grupo<input bind:value={groupName} class="settings-input" placeholder="Nome do grupo" maxlength="64" required /></label></div>
        <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={() => showGroupDialog = false}>Cancelar</button><button class="primary rounded-xl px-4 py-2 text-sm font-bold">Criar grupo <HugeiconsIcon icon={iconFor("arrowRight")} size={16} strokeWidth={1.8} /></button></footer>
      </form>
    </div>
  {/if}
  {#if showRoomDialog}
    <div class="modal-backdrop" role="presentation">
      <form class="modal-shell modal-compact" on:submit|preventDefault={createRoom}>
        <header class="modal-header"><div><p class="eyebrow">sala do grupo</p><h2>{roomDialogMode === "edit" ? "Editar canal" : "Criar sala"}</h2><p class="muted">{roomDialogMode === "edit" ? "Altere o nome do canal de texto." : "Escolha o nome e o tipo do novo canal."}</p></div><button class="modal-close outline" type="button" aria-label="Fechar janela de canal" on:click={() => showRoomDialog = false}>×</button></header>
        <div class="modal-body"><label class="modal-field">Nome da sala<input bind:value={roomName} class="settings-input" placeholder="ex.: conversa, estudos" maxlength="48" required /></label>{#if roomDialogMode !== "edit"}<label class="modal-field">Tipo<select bind:value={roomKind} class="settings-input"><option value="text">Texto e chat</option><option value="voice">Canal de voz</option></select></label>{/if}</div>
        {#if roomKind === "voice"}<div class="modal-body room-capacity-field"><label class="modal-field">Limite de participantes<input bind:value={roomMaxParticipants} class="settings-input" type="number" min="1" max="50" step="1" required aria-describedby="room-capacity-help" /></label><small id="room-capacity-help" class="muted">Defina de 1 a 50 pessoas nesta sala. O padrão é 8.</small></div>{/if}
        <footer class="modal-footer"><button type="button" class="outline rounded-xl px-4 py-2 text-sm font-bold" on:click={() => showRoomDialog = false}>Cancelar</button><button class="primary rounded-xl px-4 py-2 text-sm font-bold">{roomDialogMode === "edit" ? "Salvar alterações" : "Criar sala"} {#if roomDialogMode !== "edit"}<HugeiconsIcon icon={iconFor("arrowRight")} size={16} strokeWidth={1.8} />{/if}</button></footer>
      </form>
    </div>
  {/if}
  {#if showReleaseNotes && releaseNotes}
    <div class="modal-backdrop release-notes-backdrop" role="presentation" on:click={dismissReleaseNotes}>
      <div class="modal-shell release-notes-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="release-notes-title" on:click|stopPropagation on:keydown|stopPropagation>
        <header class="modal-header">
          <div>
            <p class="eyebrow">atualização do Telai · {releaseNotes.platformLabel} · {releaseNotes.version}</p>
            <h2 id="release-notes-title">{releaseNotes.title}</h2>
            <p>{releaseNotes.summary}</p>
          </div>
          <button class="modal-close outline" type="button" aria-label="Fechar notas da atualização" on:click={dismissReleaseNotes}>×</button>
        </header>
        <div class="modal-body release-notes-body">
          {#each releaseNotes.sections as section, sectionIndex}
            <section class="release-notes-section" aria-labelledby={`release-notes-section-${sectionIndex}`}>
              <h3 id={`release-notes-section-${sectionIndex}`}>{section.title}</h3>
              <ul>
                {#each section.items as item}<li>{item}</li>{/each}
              </ul>
            </section>
          {/each}
        </div>
        <footer class="modal-footer">
          <span class="muted">Você poderá rever estas notas em “Notas da atualização”, no menu da conta.</span>
          <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={dismissReleaseNotes}>Entendi</button>
        </footer>
      </div>
    </div>
  {/if}
</div>
