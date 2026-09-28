<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { createAuthController } from "./features/auth/controller.js";
  import { createAuthStateStore } from "./features/auth/auth-state.js";
  import { createNotificationController } from "./features/notifications/controller.js";
  import { createNotificationStateStore } from "./features/notifications/notification-state.js";
  import { createSocialStateStore } from "./features/social/social-state.js";
  import { createBroadcastStateStore } from "./features/broadcast/broadcast-state.js";
  import { createLiveStateStore } from "./features/live/live-state.js";
  import AppGroupsWorkspace from "./app/AppGroupsWorkspace.svelte";
  import AppSettingsWorkspace from "./app/AppSettingsWorkspace.svelte";
  import AppRouteWorkspace from "./app/AppRouteWorkspace.svelte";
  import AppMainShell from "./app/AppMainShell.svelte";
  import AppEntryWorkspace from "./app/AppEntryWorkspace.svelte";
  import AppOverlays from "./app/AppOverlays.svelte";
  import { createViewportController } from "./features/shell/viewport-controller.js";
  import { createRouteController } from "./features/shell/route-controller.js";
  import { createAccountController } from "./features/shell/account-controller.js";
  import { createVoiceContextMenuRuntime } from "./features/voice/context-menu-runtime.js";
  import { createNavigationStateStore } from "./features/shell/navigation-state.js";
  import { createViewerStateStore } from "./features/shell/viewer-state.js";
  import { createSettingsNavigationController } from "./features/settings/navigation-controller.js";
  import { createVisualStateStore, VISUAL_DEFAULTS } from "./features/settings/visual-state.js";
  import { deriveAppState } from "./app/derived-state.js";
  import GroupLiveGallery from "./GroupLiveGallery.svelte";
  import AccountPrivacy from "./AccountPrivacy.svelte";
  import { createApiClient } from "./services/api.js";
  import { createDirectStateStore } from "./features/direct/direct-state.js";
  import { createSettingsStateStore } from "./features/settings/settings-state.js";
  import { createGroupRoomReadController } from "./features/groups/room-read-controller.js";
  import { createGroupStateStore } from "./features/groups/group-state.js";
  import { createMessageStateStore } from "./features/groups/message-state.js";
  import { createApplicationCommandController } from "./features/groups/application-command-controller.js";
  import { createApplicationCommandStateStore } from "./features/groups/application-command-state.js";
  import { createMentionController } from "./features/groups/mention-controller.js";
  import { createGroupThreadRuntime } from "./features/groups/thread-runtime.js";
  import { createGroupActionsController } from "./features/groups/actions-controller.js";
  import {
    createSelectedVoiceAudioConstraints,
    createVoiceAudioConstraints,
    createVoiceInputPipeline,
  } from "./services/media/voice-input.js";
  import { createVoiceCaptureService } from "./services/media/voice-capture.js";
  import { createVoiceTrackSyncService } from "./services/media/voice-track-sync.js";
  import { createVoiceReconnectStorage } from "./services/media/voice-reconnect-storage.js";
  import { createVoiceQualityController } from "./features/voice/quality-controller.js";
  import { createVoiceSignalingController, shouldInitiateVoicePeer } from "./features/voice/signaling-controller.js";
  import { createVoicePeerHealthController } from "./features/voice/peer-health-controller.js";
  import { createVoicePeerRecoveryController } from "./features/voice/peer-recovery-controller.js";
  import { createVoicePeerController } from "./features/voice/peer-controller.js";
  import { createVoiceAudioTestController } from "./features/voice/audio-test-controller.js";
  import { createVoiceRemotePlaybackController } from "./features/voice/remote-playback-controller.js";
  import { createVoiceParticipantPreferencesController } from "./features/voice/participant-preferences-controller.js";
  import { createVoiceInputLifecycleController } from "./features/voice/input-lifecycle-controller.js";
  import { createVoiceSoundController, readSoundPreferences, SOUND_PREFERENCE_DEFAULTS } from "./features/voice/sound-controller.js";
  import { createVoiceShortcutController } from "./features/voice/shortcut-controller.js";
  import { createVoiceDeviceController } from "./services/media/voice-device-controller.js";
  import { formatBroadcastCaptureError, formatBroadcastMissingAudio } from "./features/broadcast/capture-errors.js";
  import { createGroupEventGateway } from "./services/events.js";
  import { createGroupEventRuntime } from "./features/groups/event-runtime.js";
  import { streamViewerUrl } from "./features/live/stream-url.js";
  import {
    isUnavailableVoiceInputError,
    normalizeAudioVolume,
    rawAudioDeviceLabel,
    readStoredVoiceDeviceId,
    readStoredVoiceDeviceLabel,
  } from "./services/media/voice-device-utils.js";
  import { createClientDiagnostics } from "./services/client-diagnostics.js";
  import { createAppLifecycleController } from "./app/lifecycle-controller.js";
  import { createGatewaySequenceGuard } from "./services/gateway-sequence.js";
  import { createMaintenanceController } from "./features/shell/maintenance-controller.js";
  import { createBroadcastRuntimeController } from "./features/broadcast/runtime-controller.js";
  import { createBroadcastLifecycleController } from "./features/broadcast/lifecycle-controller.js";
  import { createBroadcastSourceController } from "./features/broadcast/source-controller.js";
  import { createBroadcastPreviewController } from "./features/broadcast/preview-controller.js";
  import { createBroadcastAudioModeController } from "./features/broadcast/audio-mode-controller.js";
  import { createBroadcastSwitchController } from "./features/broadcast/switch-controller.js";
  import { createAvatarController } from "./features/settings/avatar-controller.js";
  import { createAppComponentLoaders } from "./app/component-loader-registry.js";
  import { createWindowLifecycle } from "./app/window-lifecycle.js";
  import { copyTextValue } from "./services/clipboard.js";
  import { globalNavSections, iconFor, notificationIconFor } from "./config/ui.js";
  import { createVoiceActivityController } from "./features/voice/activity-controller.js";
  import { createVoiceActivityRuntime } from "./features/voice/activity-runtime.js";
  import { createVoiceInputRuntime } from "./features/voice/input-runtime.js";
  import { createVoiceParticipantStateController } from "./features/voice/participant-state.js";
  import { createVoiceSocketController } from "./features/voice/socket-controller.js";
  import { createVoiceLiveController } from "./features/voice/live-controller.js";
  import { createVoiceReconnectController } from "./features/voice/reconnect-controller.js";
  import { createVoiceRoomController } from "./features/voice/room-controller.js";
  import { createVoiceMessageController } from "./features/voice/message-controller.js";
  import { BROADCAST_QUALITY_PROFILES as qualityProfiles, hasTurnServer } from "../../shared/media-contract.mjs";
  import { PlayIcon } from "@hugeicons/core-free-icons";

  const APP_VERSION = typeof __MIRANTE_VERSION__ === "string" ? __MIRANTE_VERSION__ : "desconhecida";
  const WEB_VERSION = typeof __MIRANTE_WEB_VERSION__ === "string" ? __MIRANTE_WEB_VERSION__ : "desconhecida";
  const acceptGatewayMessage = createGatewaySequenceGuard();
  const visualState = createVisualStateStore();
  const visualDefaults = VISUAL_DEFAULTS;
  const viewerState = createViewerStateStore();

  const reportClientError = createClientDiagnostics({
    // Qualidade RTC é amostrada localmente para recuperação dos pares, mas
    // não deve virar um POST a cada 10s por participante. Em salas maiores
    // isso multiplica tráfego e logs sem melhorar o estado da chamada.
    routineKinds: ["voice_activity_sample", "voice_activity_state", "voice_rtc_quality", "voice_activity_analyzer_ready"],
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
      await copyTextValue(value);
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
  const groupState = createGroupStateStore();
  const messageState = createMessageStateStore();
  const applicationCommandState = createApplicationCommandStateStore();
  const directState = createDirectStateStore();
  const settingsState = createSettingsStateStore();
  const authState = createAuthStateStore();
  const notificationState = createNotificationStateStore();
  const socialState = createSocialStateStore();
  const liveState = createLiveStateStore();
  const broadcastStateStore = createBroadcastStateStore();
  let groups = groupState.getState().groups;
  let streams = liveState.getState().streams;
  const navigationState = createNavigationStateStore();
  let view = navigationState.getState().view;
  let groupsWorkspaceOpen = navigationState.getState().groupsWorkspaceOpen;
  let groupPickerQuery = navigationState.getState().groupPickerQuery;
  let showGlobalSidebar = navigationState.getState().showGlobalSidebar;
  let globalSidebarCollapsed = navigationState.getState().globalSidebarCollapsed;
  let compactViewport = navigationState.getState().compactViewport;
  let showMobileChannels = navigationState.getState().showMobileChannels;
  let showMobileMembers = navigationState.getState().showMobileMembers;
  let isViewer = viewerState.getState().isViewer;
  let viewerParentFullscreen = viewerState.getState().viewerParentFullscreen;
  let viewerRoomId = viewerState.getState().viewerRoomId;
  let viewerStreamPath = viewerState.getState().viewerStreamPath;
  let viewerStream = viewerState.getState().viewerStream;
  let selectedGroupId = groupState.getState().selectedGroupId;
  let groupApplicationCommands = applicationCommandState.getState().commands;
  let groupApplicationCommandsGroupId = applicationCommandState.getState().groupId;
  let groupOverview = groupState.getState().groupOverview;
  let knownGroupMessageIds = groupState.getState().knownGroupMessageIds;
  let selectedRoomId = groupState.getState().selectedRoomId;
  let watchingGroupLiveStreamId = groupState.getState().watchingGroupLiveStreamId;
  let groupLoading = groupState.getState().groupLoading;
  let followingOnly = liveState.getState().followingOnly;
  let liveNotificationScope = liveState.getState().liveNotificationScope;
  let liveNotificationScopes = liveState.getState().liveNotificationScopes;
  let selectedStreams = liveState.getState().selectedStreams;
  let multistreamOpen = navigationState.getState().multistreamOpen;
  let theme = visualState.getState().theme;
  let notice = "";
  let maintenanceNotice = null;
  let maintenanceRemainingSeconds = 0;
  let maintenanceReloadKey = "";
  const maintenanceController = createMaintenanceController();
  let buttonColor = visualState.getState().buttonColor;
  let inputBackgroundColor = visualState.getState().inputBackgroundColor;
  let backgroundColor = visualState.getState().backgroundColor;
  let providers = authState.getState().providers;
  let authMode = authState.getState().authMode;
  let authBusy = authState.getState().authBusy;
  let authError = authState.getState().authError;
  let loginUsername = authState.getState().loginUsername;
  let loginPassword = authState.getState().loginPassword;
  let registerDisplayName = authState.getState().registerDisplayName;
  let registerUsername = authState.getState().registerUsername;
  let registerPassword = authState.getState().registerPassword;
  let registerLegalAccepted = authState.getState().registerLegalAccepted;
  let messageDraft = messageState.getState().messageDraft;
  let messageAttachments = messageState.getState().messageAttachments;
  let editingMessageId = messageState.getState().editingMessageId;
  let editingMessageDraft = messageState.getState().editingMessageDraft;
  let messageComposerInput;
  let mentionSuggestions = messageState.getState().mentionSuggestions;
  let mentionStartIndex = messageState.getState().mentionStartIndex;
  let mentionActiveIndex = messageState.getState().mentionActiveIndex;
  let broadcastState = broadcastStateStore.getState().broadcastState;
  let broadcastError = broadcastStateStore.getState().broadcastError;
  let broadcastTitle = broadcastStateStore.getState().broadcastTitle;
  let broadcastInvite = broadcastStateStore.getState().broadcastInvite;
  let broadcastRoomId = broadcastStateStore.getState().broadcastRoomId;
  let broadcastStreamId = broadcastStateStore.getState().broadcastStreamId;
  let broadcastStream = broadcastStateStore.getState().broadcastStream;
  let broadcastMicrophoneStream = null;
  let broadcastDisplayStream = null;
  let broadcastCameraStream = null;
  let broadcastSourceAudioTrack = null;
  let broadcastCameraDeviceId = broadcastStateStore.getState().broadcastCameraDeviceId;
  let broadcastCameraPosition = broadcastStateStore.getState().broadcastCameraPosition;
  let broadcastCameraEnabled = broadcastStateStore.getState().broadcastCameraEnabled;
  let broadcastMicrophoneEnabled = broadcastStateStore.getState().broadcastMicrophoneEnabled;
  let broadcastVideoComposition = null;
  let broadcastSocket = null;
  let broadcastChatMessageIds = new Set();
  let broadcastChatMessages = [];
  let broadcastChatDraft = "";
  let broadcastChatListElement;
  let broadcastCaptureRecoveryTimer = null;
  let broadcastSourceType = broadcastStateStore.getState().broadcastSourceType;
  let broadcastDisplaySurface = broadcastStateStore.getState().broadcastDisplaySurface;
  let mediaMode = "p2p";
  let broadcastVideo;
  let broadcastAudioWarning = "";
  let broadcastVisibility = broadcastStateStore.getState().broadcastVisibility;
  let showBroadcastVisibilityDialog = broadcastStateStore.getState().showBroadcastVisibilityDialog;
  let showPublicBroadcastSetup = broadcastStateStore.getState().showPublicBroadcastSetup;
  let showPublicBroadcastReview = broadcastStateStore.getState().showPublicBroadcastReview;
  let publicBroadcastTitle = broadcastStateStore.getState().publicBroadcastTitle;
  let publicBroadcastSourceKind = broadcastStateStore.getState().publicBroadcastSourceKind;
  let publicBroadcastMicrophoneEnabled = broadcastStateStore.getState().publicBroadcastMicrophoneEnabled;
  let publicBroadcastCameraEnabled = broadcastStateStore.getState().publicBroadcastCameraEnabled;
  let publicBroadcastCameraDeviceId = broadcastStateStore.getState().publicBroadcastCameraDeviceId;
  let publicBroadcastQuality = broadcastStateStore.getState().publicBroadcastQuality;
  let publicBroadcastReviewSelection = broadcastStateStore.getState().publicBroadcastReviewSelection;
  let broadcastSelectedSourceName = broadcastStateStore.getState().broadcastSelectedSourceName;
  let broadcastSelectionKind = broadcastStateStore.getState().broadcastSelectionKind;
  let pendingBroadcastContext = broadcastStateStore.getState().pendingBroadcastContext;
  let pendingBroadcastSourceType = broadcastStateStore.getState().pendingBroadcastSourceType;
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
  let viewerCount = 0;
  let peerConnections = new Map();
  let pendingBroadcastCandidates = new Map();
  let broadcastPeerRetryTimers = new Map();
  let broadcastPeerNegotiations = new Map();
  let selectedQuality = "balanced";
  let audioMode = "source";
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
  let voicePeerController = null;
  let voicePeerConnectionTimers = new Map();
  let voicePeerAudioTrackTimers = new Map();
  let voicePeerNegotiationInFlight = new Set();
  let voicePeerAudioHealth = new Map();
  let voicePeerRelayRecoveryAttempted = new Set();
  let voicePendingCandidates = new Map();
  let voicePendingSignals = new Map();
  let voiceRemoteAudio = new Map();
  let voiceRemoteStreams = new Map();
  let voiceRemoteAudioBindings = new Map();
  let voiceRemotePlaybackTimers = new Map();
  let voicePlaybackBlocked = false;
  let voiceInputSelectionRevision = 0;
  let voiceInputDeviceByStream = new WeakMap();
  let voiceReconnectSession = null;
  let voiceReconnectVisible = false;
  let voiceReconnectBusy = false;
  let voiceReconnectTimer = null;
  let speakingVoiceParticipantIds = new Set();
  // O estado de fala enviado pelo servidor é a fonte autoritativa da borda
  // para participantes atuais. O analisador remoto fica apenas como fallback
  // para clientes antigos que ainda não publicam esse estado.
  let voiceSpeakingSignalKnownParticipantIds = new Set();
  let GroupTextChatWorkspace = null;
  let GroupVoiceWorkspace = null;
  let GroupMessageSearchDialog = null;
  let GroupThreadDialog = null;
  let GroupChannelPermissionsSettings = null;
  let GroupAuditLogSettings = null;
  let SettingsPage = null;
  let MultistreamPage = null;
  let ContextMenus = null;
  let GroupDialogs = null;
  let BroadcastDialogs = null;
  let ProfileSettingsExtras = null;
  let VoiceSettingsPanel = null;
  function setNavigationState(next) {
    navigationState.setState(next);
  }

  function setSettingsState(next) {
    settingsState.setState(next);
  }

  function setAuthState(next) {
    authState.setState(next);
  }

  function setNotificationState(next) {
    notificationState.setState(next);
  }

  function setSocialState(next) {
    socialState.setState(next);
  }

  function setVisualState(next) {
    visualState.setState(next);
  }

  function setViewerState(next) {
    viewerState.setState(next);
  }

  function setLiveState(next) {
    liveState.setState(next);
  }

  function setBroadcastState(next) {
    broadcastStateStore.setState(next);
  }

  const unsubscribeNavigationState = navigationState.subscribe((next) => {
    view = next.view;
    groupsWorkspaceOpen = next.groupsWorkspaceOpen;
    groupPickerQuery = next.groupPickerQuery;
    showGlobalSidebar = next.showGlobalSidebar;
    globalSidebarCollapsed = next.globalSidebarCollapsed;
    compactViewport = next.compactViewport;
    multistreamOpen = next.multistreamOpen;
    showMobileChannels = next.showMobileChannels;
    showMobileMembers = next.showMobileMembers;
  });

  const unsubscribeAuthState = authState.subscribe((next) => {
    providers = next.providers;
    authMode = next.authMode;
    authBusy = next.authBusy;
    authError = next.authError;
    loginUsername = next.loginUsername;
    loginPassword = next.loginPassword;
    registerDisplayName = next.registerDisplayName;
    registerUsername = next.registerUsername;
    registerPassword = next.registerPassword;
    registerLegalAccepted = next.registerLegalAccepted;
  });

  const unsubscribeVisualState = visualState.subscribe((next) => {
    theme = next.theme;
    buttonColor = next.buttonColor;
    inputBackgroundColor = next.inputBackgroundColor;
    backgroundColor = next.backgroundColor;
  });

  const unsubscribeViewerState = viewerState.subscribe((next) => {
    isViewer = next.isViewer;
    viewerParentFullscreen = next.viewerParentFullscreen;
    viewerRoomId = next.viewerRoomId;
    viewerStreamPath = next.viewerStreamPath;
    viewerStream = next.viewerStream;
  });

  const unsubscribeLiveState = liveState.subscribe((next) => {
    streams = next.streams;
    followingOnly = next.followingOnly;
    liveNotificationScope = next.liveNotificationScope;
    liveNotificationScopes = next.liveNotificationScopes;
    selectedStreams = next.selectedStreams;
  });

  const unsubscribeBroadcastState = broadcastStateStore.subscribe((next) => {
    broadcastState = next.broadcastState;
    broadcastError = next.broadcastError;
    broadcastTitle = next.broadcastTitle;
    broadcastInvite = next.broadcastInvite;
    broadcastRoomId = next.broadcastRoomId;
    broadcastStreamId = next.broadcastStreamId;
    broadcastStream = next.broadcastStream;
    broadcastCameraDeviceId = next.broadcastCameraDeviceId;
    broadcastCameraPosition = next.broadcastCameraPosition;
    broadcastCameraEnabled = next.broadcastCameraEnabled;
    broadcastMicrophoneEnabled = next.broadcastMicrophoneEnabled;
    broadcastSourceType = next.broadcastSourceType;
    broadcastDisplaySurface = next.broadcastDisplaySurface;
    broadcastSelectedSourceName = next.broadcastSelectedSourceName;
    broadcastSelectionKind = next.broadcastSelectionKind;
    broadcastVisibility = next.broadcastVisibility;
    showBroadcastVisibilityDialog = next.showBroadcastVisibilityDialog;
    showPublicBroadcastSetup = next.showPublicBroadcastSetup;
    showPublicBroadcastReview = next.showPublicBroadcastReview;
    publicBroadcastTitle = next.publicBroadcastTitle;
    publicBroadcastSourceKind = next.publicBroadcastSourceKind;
    publicBroadcastMicrophoneEnabled = next.publicBroadcastMicrophoneEnabled;
    publicBroadcastCameraEnabled = next.publicBroadcastCameraEnabled;
    publicBroadcastCameraDeviceId = next.publicBroadcastCameraDeviceId;
    publicBroadcastQuality = next.publicBroadcastQuality;
    publicBroadcastReviewSelection = next.publicBroadcastReviewSelection;
    pendingBroadcastContext = next.pendingBroadcastContext;
    pendingBroadcastSourceType = next.pendingBroadcastSourceType;
  });

  const unsubscribeMaintenanceState = maintenanceController.subscribe((next) => {
    maintenanceNotice = next.notice;
    maintenanceRemainingSeconds = next.remainingSeconds;
    maintenanceReloadKey = next.reloadKey;
  });

  const viewportController = createViewportController({
    getCompactViewport: () => compactViewport,
    matchMedia: (query) => window.matchMedia(query),
    setState: (next) => {
      const navigationPatch = {};
      if ("compactViewport" in next) navigationPatch.compactViewport = next.compactViewport;
      if ("showGlobalSidebar" in next) navigationPatch.showGlobalSidebar = next.showGlobalSidebar;
      if (Object.keys(navigationPatch).length) setNavigationState(navigationPatch);
    },
  });

  const componentLoaders = createAppComponentLoaders({
    setComponent: (name, component) => {
      if (name === "GroupTextChatWorkspace") GroupTextChatWorkspace = component;
      if (name === "GroupVoiceWorkspace") GroupVoiceWorkspace = component;
      if (name === "GroupMessageSearchDialog") GroupMessageSearchDialog = component;
      if (name === "GroupThreadDialog") GroupThreadDialog = component;
      if (name === "GroupChannelPermissionsSettings") GroupChannelPermissionsSettings = component;
      if (name === "GroupAuditLogSettings") GroupAuditLogSettings = component;
      if (name === "SettingsPage") SettingsPage = component;
      if (name === "MultistreamPage") MultistreamPage = component;
      if (name === "ContextMenus") ContextMenus = component;
      if (name === "GroupDialogs") GroupDialogs = component;
      if (name === "BroadcastDialogs") BroadcastDialogs = component;
      if (name === "ProfileSettingsExtras") ProfileSettingsExtras = component;
      if (name === "VoiceSettingsPanel") VoiceSettingsPanel = component;
    },
    reportClientError,
  });
  const {
    loadGroupTextWorkspace,
    loadGroupVoiceWorkspace,
    loadGroupMessageSearchDialog,
    loadGroupThreadDialog,
    loadGroupChannelPermissionsSettings,
    loadGroupAuditLogSettings,
    loadSettingsPage,
    loadMultistreamPage,
    loadContextMenus,
    loadGroupDialogs,
    loadBroadcastDialogs,
    loadProfileSettingsExtras,
    loadVoiceSettingsPanel,
  } = componentLoaders;

  $: if (selectedRoom && selectedRoom.kind !== "voice" && !GroupTextChatWorkspace) void loadGroupTextWorkspace();
  $: if (selectedRoom?.kind === "voice" && !GroupVoiceWorkspace) void loadGroupVoiceWorkspace();

  $: if (showGroupMessageSearch && !GroupMessageSearchDialog) void loadGroupMessageSearchDialog();

  $: if (activeGroupThread && !GroupThreadDialog) void loadGroupThreadDialog();

  const groupThreadRuntime = createGroupThreadRuntime({
    loadController: () => import("./features/groups/thread-controller.js")
      .then(({ createGroupThreadController }) => createGroupThreadController({
        api,
        getSelectedGroupId: () => selectedGroupId,
        getSelectedRoom: () => selectedRoom,
        getActiveThread: () => activeGroupThread,
        setActiveThread: (value) => setMessageState({ activeGroupThread: value }),
        getThreadMessages: () => groupThreadMessages,
        setThreadMessages: (value) => setMessageState({ groupThreadMessages: value }),
        getThreadDraft: () => groupThreadDraft,
        setThreadDraft: (value) => setMessageState({ groupThreadDraft: value }),
        getThreadBusy: () => groupThreadBusy,
        setThreadBusy: (value) => setMessageState({ groupThreadBusy: value }),
        setThreadError: (value) => setMessageState({ groupThreadError: value }),
        getKnownMessageIds: () => knownGroupMessageIds,
        setKnownMessageIds: (value) => setGroupState({ knownGroupMessageIds: value }),
        getGroupOverview: () => groupOverview,
        setGroupOverview: (value) => setGroupState({ groupOverview: value }),
      })),
  });

  async function openGroupThread(...args) { return groupThreadRuntime.openGroupThread(...args); }
  async function sendGroupThreadMessage(...args) { return groupThreadRuntime.sendGroupThreadMessage(...args); }

  $: if (settingsTab === "group" && !GroupChannelPermissionsSettings) void loadGroupChannelPermissionsSettings();

  $: if (settingsTab === "group" && !GroupAuditLogSettings) void loadGroupAuditLogSettings();

  $: if (view === "settings" && !SettingsPage) void loadSettingsPage();

  $: if (view === "multistream" && !MultistreamPage) void loadMultistreamPage();

  $: if ((groupContextMenu || roomContextMenu || voiceContextMenu || profilePreview) && !ContextMenus) void loadContextMenus();

  $: if ((showInviteDialog || showGroupSearchDialog || showLeaveGroupDialog || showDeleteRoomDialog || showDeleteGroupDialog || showGroupDialog || showRoomDialog) && !GroupDialogs) void loadGroupDialogs();


  $: if ((showPublicBroadcastSetup || showPublicBroadcastReview || showBroadcastVisibilityDialog || showDisplayPicker || showBroadcastAudioPicker) && !BroadcastDialogs) void loadBroadcastDialogs();


  $: if (settingsSection === "profile" && !ProfileSettingsExtras) void loadProfileSettingsExtras();

  $: if (settingsSection === "voice" && !VoiceSettingsPanel) void loadVoiceSettingsPanel();
  let voiceActivityRuntime = null;
  let voiceInputRuntime = null;
  const voiceActivityController = createVoiceActivityController({
    getState: () => ({
      voiceClientId,
      voiceSocketReady: voiceSocket?.readyState === WebSocket.OPEN,
      sendVoice,
      voiceSpeakingSignalKnownParticipantIds,
      isDesktop,
      voiceInputProfile,
      voiceSensitivityAuto,
      voiceSensitivity,
      voicePeerConnections,
    }),
    getAudioContext: () => getVoiceSoundContext(),
    reportClientError,
    onSpeakingStateChange: (participantId, speaking) => voiceActivityRuntime?.markVoiceParticipantSpeaking(participantId, speaking),
    onRtcSpeakingStateChange: (participantId, speaking) => voiceActivityRuntime?.markVoiceParticipantSpeaking(participantId, speaking, "rtc"),
    onTrackEnded: (participantId, track) => reportClientError(
      "voice_activity_track_ended",
      new Error("A faixa do microfone/áudio terminou durante a sala de voz."),
      { participantId, isDesktop, trackReadyState: track?.readyState },
    ),
  });
  voiceActivityRuntime = createVoiceActivityRuntime({
    activityController: voiceActivityController,
    getState: () => ({ voiceClientId, voiceRoomId, voiceParticipants, voiceSpeakingSignalKnownParticipantIds, speakingVoiceParticipantIds }),
    setState: (next) => { if ("voiceParticipants" in next) voiceParticipants = next.voiceParticipants; if ("speakingVoiceParticipantIds" in next) speakingVoiceParticipantIds = next.speakingVoiceParticipantIds; },
    updateVoiceRoomSnapshot,
  });
  const VOICE_PEER_AUDIO_GRACE_MS = 4_000;
  const VOICE_PEER_CONNECTION_TIMEOUT_MS = 8_000;
  const VOICE_PEER_AUDIO_TRACK_TIMEOUT_MS = 6_000;
  const VOICE_PEER_HEALTH_POLL_MS = 2_000;
  const VOICE_QUALITY_POLL_MS = 10_000;
  const VOICE_REMOTE_PLAYBACK_RETRY_MS = 1_000;
  const soundPreferenceDefaults = SOUND_PREFERENCE_DEFAULTS;
  let soundPreferences = readSoundPreferences();
  let voiceSoundEffects = soundPreferences.enabled;
  let voiceVolumes = new Map();
  let voiceLocallyMutedParticipants = new Set();
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
  const voiceQualityController = createVoiceQualityController({
    getPeerConnections: () => voicePeerConnections,
    getRecoveryCount: (participantId) => voicePeerRecoveryController.getRecoveryCount(participantId),
    reportClientError,
    pollIntervalMs: VOICE_QUALITY_POLL_MS,
  });
  const voicePeerHealthController = createVoicePeerHealthController({
    getPeerConnections: () => voicePeerConnections,
    getPeerAudioHealth: () => voicePeerAudioHealth,
    hasTurnServer: () => voiceHasTurnServer(),
    recoverPeer: (participantId, peer, options) => recoverVoicePeer(participantId, peer, options),
    markRelayRecoveryAttempted: (participantId) => voicePeerRelayRecoveryAttempted.add(participantId),
    reportClientError,
    graceMs: VOICE_PEER_AUDIO_GRACE_MS,
    pollIntervalMs: VOICE_PEER_HEALTH_POLL_MS,
  });
  const voicePeerRecoveryController = createVoicePeerRecoveryController({
    getState: () => ({ rtcConfig, voicePeerConnections, voiceState }),
    refreshIceConfiguration: (force) => refreshIceConfigurationIfNeeded(force),
    hasTurnServer: () => voiceHasTurnServer(),
    closePeer: (participantId) => closeVoicePeer(participantId),
    createPeer: (participantId, initiator, peerConfig) => createVoicePeer(participantId, initiator, peerConfig),
    shouldInitiate: (participantId) => voicePeerShouldInitiate(participantId),
    sendVoice,
    reportClientError,
  });
  voicePeerController = createVoicePeerController({
    getState: () => ({
      selectedOutputDeviceId,
      voiceDeafened,
      voiceLocalStream,
      voiceLocallyMutedParticipants,
      voicePeerAudioHealth,
      voicePeerAudioTrackTimers,
      voicePeerConnectionTimers,
      voicePeerConnections,
      voiceRemoteAudio,
      voiceRemoteStreams,
    }),
    getRtcConfig: () => rtcConfig,
    setState: (next) => { if ("voiceError" in next) voiceError = next.voiceError; },
    ensureVoiceActivityTimer: (...args) => ensureVoiceActivityTimer(...args),
    bindVoiceLocalTrack: (track) => bindVoiceLocalTrack(track),
    sendVoice: (...args) => sendVoice(...args),
    reportClientError: (...args) => reportClientError(...args),
    hasTurnServer: () => voiceHasTurnServer(),
    recoverPeer: (participantId, peer, options) => recoverVoicePeer(participantId, peer, options),
    closePeer: (participantId) => closeVoicePeer(participantId),
    schedulePeerRecovery: (participantId, delayMs, forceRelay) => scheduleVoicePeerRecovery(participantId, delayMs, forceRelay),
    clearPeerRecovery: (participantId) => voicePeerRecoveryController.clearParticipant(participantId),
    ensureRemoteStream: (participantId) => ensureVoiceRemoteStream(participantId),
    ensureRemoteAudio: (participantId) => ensureVoiceRemoteAudio(participantId),
    scheduleVoiceRemotePlayback: (participantId, delayMs) => scheduleVoiceRemotePlayback(participantId, delayMs),
    ensurePeerHealthTimer: () => ensureVoicePeerHealthTimer(),
    attachVoiceActivityDetector: (participantId, audio) => attachVoiceActivityDetector(participantId, audio),
    playRemoteAudio: (participantId, audio) => playVoiceRemoteAudio(participantId, audio),
    clearRecoveredVoiceError: () => clearRecoveredVoiceError(),
    voicePreferenceTargetId: (...args) => voicePreferenceTargetId(...args),
    effectiveVoiceOutputVolume: (...args) => effectiveVoiceOutputVolume(...args),
    connectionTimeoutMs: VOICE_PEER_CONNECTION_TIMEOUT_MS,
    audioTrackTimeoutMs: VOICE_PEER_AUDIO_TRACK_TIMEOUT_MS,
  });
  let voiceDevicesBusy = false;
  let voiceDevicesError = "";
  let voiceTestRunning = false;
  let voiceTestLevel = 0;
  let voiceTestPeak = 0;
  let voiceTestError = "";
  let voiceTestStatus = "Clique em testar para verificar seu microfone.";
  let voiceTestSpeakerStatus = "";
  let isDesktop = false;
  let desktopPushToTalkGlobal = false;
  let desktopMuteShortcutGlobal = false;
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
  let groupNavigationCollapsed = false;
  let groupName = "";
  let showRoomDialog = false;
  let roomName = "";
  let roomKind = "text";
  let roomMaxParticipants = 8;
  let roomDialogMode = "create";
  let editingRoomId = "";
  let settingsTab = settingsState.getState().settingsTab;
  let settingsSection = settingsState.getState().settingsSection;
  let settingsPageElement;
  let settingsReturnView = settingsState.getState().settingsReturnView;
  let settingsBusy = settingsState.getState().settingsBusy;
  let settingsError = settingsState.getState().settingsError;
  let preferencesResetConfirm = settingsState.getState().preferencesResetConfirm;
  let preferencesResetBusy = settingsState.getState().preferencesResetBusy;
  let settingsDisplayName = settingsState.getState().settingsDisplayName;
  let settingsAvatarData = settingsState.getState().settingsAvatarData;
  let avatarError = settingsState.getState().avatarError;
  let avatarFileInput;
  let channelDisplayName = settingsState.getState().channelDisplayName;
  let channelAvatarData = settingsState.getState().channelAvatarData;
  let channelGames = settingsState.getState().channelGames;
  let channelError = settingsState.getState().channelError;
  let channelAvatarFileInput;

  const unsubscribeSettingsState = settingsState.subscribe((next) => {
    settingsTab = next.settingsTab;
    settingsSection = next.settingsSection;
    settingsReturnView = next.settingsReturnView;
    settingsBusy = next.settingsBusy;
    settingsError = next.settingsError;
    preferencesResetConfirm = next.preferencesResetConfirm;
    preferencesResetBusy = next.preferencesResetBusy;
    settingsDisplayName = next.settingsDisplayName;
    settingsAvatarData = next.settingsAvatarData;
    avatarError = next.avatarError;
    channelDisplayName = next.channelDisplayName;
    channelAvatarData = next.channelAvatarData;
    channelGames = next.channelGames;
    channelError = next.channelError;
  });
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
  let selectedRoomPermissionId = "";
  let groupRoomPermissions = [];
  let roomPermissionBusyKey = "";
  const rolePermissionOptions = [
    { key: "canChat", category: "Texto", label: "Conversar", description: "Enviar mensagens e conversar nas salas." },
    { key: "canInvite", category: "Geral", label: "Convidar", description: "Adicionar pessoas ao grupo." },
    { key: "canModerateMembers", category: "Geral", label: "Moderar membros", description: "Silenciar, expulsar e banir cargos inferiores." },
    { key: "canStream", category: "Voz e vídeo", label: "Transmitir", description: "Iniciar transmissões ao vivo." },
    { key: "canViewVoiceMembers", category: "Voz e vídeo", label: "Ver voz", description: "Ver participantes das salas." },
    { key: "canMoveMembers", category: "Voz e vídeo", label: "Moderar voz", description: "Mover e silenciar participantes." },
  ];
  let showInviteDialog = false;
  let showGroupSearchDialog = false;
  let showGroupMessageSearch = false;
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
  let groupMessageSearchQuery = messageState.getState().groupMessageSearchQuery;
  let groupMessageSearchResults = messageState.getState().groupMessageSearchResults;
  let groupMessageSearchBusy = messageState.getState().groupMessageSearchBusy;
  let groupMessageSearchError = messageState.getState().groupMessageSearchError;
  let activeGroupThread = messageState.getState().activeGroupThread;
  let groupThreadMessages = messageState.getState().groupThreadMessages;
  let groupThreadDraft = messageState.getState().groupThreadDraft;
  let groupThreadBusy = messageState.getState().groupThreadBusy;
  let groupThreadError = messageState.getState().groupThreadError;
  let groupJoinRequests = [];
  let groupJoinActionId = "";
  let groupAuditEntries = [];
  let groupAuditLoading = false;
  let pendingInviteToken = "";
  let pendingGroupRouteId = "";
  let pendingRoomRouteId = "";
  let notifications = notificationState.getState().notifications;
  let notificationUnreadCount = notificationState.getState().notificationUnreadCount;
  let hideReadNotifications = notificationState.getState().hideReadNotifications;
  let notificationHideReadPreferenceUserId = notificationState.getState().notificationHideReadPreferenceUserId;
  let notificationSoundInitialized = notificationState.getState().notificationSoundInitialized;
  let knownNotificationIds = notificationState.getState().knownNotificationIds;
  let notificationsLoading = notificationState.getState().notificationsLoading;
  let notificationsError = notificationState.getState().notificationsError;
  let notificationsRefreshInFlight = notificationState.getState().notificationsRefreshInFlight;
  let groupOverviewRefreshInFlight = groupState.getState().groupOverviewRefreshInFlight;
  let groupPresenceRefreshInFlight = groupState.getState().groupPresenceRefreshInFlight;
  const unsubscribeNotificationState = notificationState.subscribe((next) => {
    notifications = next.notifications;
    notificationUnreadCount = next.notificationUnreadCount;
    hideReadNotifications = next.hideReadNotifications;
    notificationHideReadPreferenceUserId = next.notificationHideReadPreferenceUserId;
    notificationSoundInitialized = next.notificationSoundInitialized;
    knownNotificationIds = next.knownNotificationIds;
    notificationsLoading = next.notificationsLoading;
    notificationsError = next.notificationsError;
    notificationsRefreshInFlight = next.notificationsRefreshInFlight;
  });

  let directConversations = directState.getState().directConversations;
  let directConversationId = directState.getState().directConversationId;
  let directConversationTarget = directState.getState().directConversationTarget;
  let directMessages = directState.getState().directMessages;
  let directMessageDraft = directState.getState().directMessageDraft;
  let directConversationLoading = directState.getState().directConversationLoading;
  let directConversationSending = directState.getState().directConversationSending;
  let directConversationError = directState.getState().directConversationError;
  let directConversationsRefreshInFlight = directState.getState().directConversationsRefreshInFlight;
  let directConversationRefreshInFlight = directState.getState().directConversationRefreshInFlight;
  let directConversationRefreshQueued = directState.getState().directConversationRefreshQueued;
  let directConversationRefreshId = directState.getState().directConversationRefreshId;
  let social = socialState.getState().social;
  let socialSearchQuery = socialState.getState().socialSearchQuery;
  let socialSearchOpen = socialState.getState().socialSearchOpen;
  let socialRequestsOpen = socialState.getState().socialRequestsOpen;
  let socialSearchResults = socialState.getState().socialSearchResults;
  let socialSearchBusy = socialState.getState().socialSearchBusy;
  let socialError = socialState.getState().socialError;
  let socialActionId = socialState.getState().socialActionId;
  let socialRefreshInFlight = socialState.getState().socialRefreshInFlight;

  const unsubscribeSocialState = socialState.subscribe((next) => {
    social = next.social;
    socialSearchQuery = next.socialSearchQuery;
    socialSearchOpen = next.socialSearchOpen;
    socialRequestsOpen = next.socialRequestsOpen;
    socialSearchResults = next.socialSearchResults;
    socialSearchBusy = next.socialSearchBusy;
    socialError = next.socialError;
    socialActionId = next.socialActionId;
    socialRefreshInFlight = next.socialRefreshInFlight;
  });

  let groupLoadSequence = groupState.getState().groupLoadSequence;
  let groupOverviewRetryAt = groupState.getState().groupOverviewRetryAt;
  const pendingGroupOverviewRequests = new Map();
  let lastAutoMarkedGroupRoomKey = "";
  const maxAvatarFileBytes = 5 * 1024 * 1024;
  const gameOptions = ["League of Legends", "Valorant", "Minecraft", "Fortnite", "Roblox", "GTA V", "CS2", "Outro"];

  function setGroupState(next) {
    groupState.setState(next);
  }

  const unsubscribeGroupState = groupState.subscribe((next) => {
    groups = next.groups;
    selectedGroupId = next.selectedGroupId;
    groupOverview = next.groupOverview;
    knownGroupMessageIds = next.knownGroupMessageIds;
    selectedRoomId = next.selectedRoomId;
    watchingGroupLiveStreamId = next.watchingGroupLiveStreamId;
    groupLoading = next.groupLoading;
    groupLoadSequence = next.groupLoadSequence;
    groupOverviewRetryAt = next.groupOverviewRetryAt;
    groupOverviewRefreshInFlight = next.groupOverviewRefreshInFlight;
    groupPresenceRefreshInFlight = next.groupPresenceRefreshInFlight;
  });

  const unsubscribeApplicationCommandState = applicationCommandState.subscribe((next) => {
    groupApplicationCommands = next.commands;
    groupApplicationCommandsGroupId = next.groupId;
  });

  function setMessageState(next) {
    messageState.setState(next);
  }

  const unsubscribeMessageState = messageState.subscribe((next) => {
    messageDraft = next.messageDraft;
    messageAttachments = next.messageAttachments;
    editingMessageId = next.editingMessageId;
    editingMessageDraft = next.editingMessageDraft;
    mentionSuggestions = next.mentionSuggestions;
    mentionStartIndex = next.mentionStartIndex;
    mentionActiveIndex = next.mentionActiveIndex;
    activeGroupThread = next.activeGroupThread;
    groupThreadMessages = next.groupThreadMessages;
    groupThreadDraft = next.groupThreadDraft;
    groupThreadBusy = next.groupThreadBusy;
    groupThreadError = next.groupThreadError;
    groupMessageSearchQuery = next.groupMessageSearchQuery;
    groupMessageSearchResults = next.groupMessageSearchResults;
    groupMessageSearchBusy = next.groupMessageSearchBusy;
    groupMessageSearchError = next.groupMessageSearchError;
  });

  function setDirectState(next) {
    directState.setState(next);
  }

  const unsubscribeDirectState = directState.subscribe((next) => {
    directConversations = next.directConversations;
    directConversationId = next.directConversationId;
    directConversationTarget = next.directConversationTarget;
    directMessages = next.directMessages;
    directMessageDraft = next.directMessageDraft;
    directConversationLoading = next.directConversationLoading;
    directConversationSending = next.directConversationSending;
    directConversationError = next.directConversationError;
    directConversationsRefreshInFlight = next.directConversationsRefreshInFlight;
    directConversationRefreshInFlight = next.directConversationRefreshInFlight;
    directConversationRefreshQueued = next.directConversationRefreshQueued;
    directConversationRefreshId = next.directConversationRefreshId;
  });

  const routeController = createRouteController({
    getState: () => ({
      groupOverview,
      isViewer: viewerState.getState().isViewer,
      pendingGroupRouteId,
      pendingRoomRouteId,
      rooms,
      selectedGroupId,
      user,
      broadcastState,
    }),
    setState: (next) => {
      if ("authError" in next) setAuthState({ authError: next.authError });
      if ("isViewer" in next) setViewerState({ isViewer: next.isViewer });
      if ("pendingInviteToken" in next) pendingInviteToken = next.pendingInviteToken;
      if ("pendingGroupRouteId" in next) pendingGroupRouteId = next.pendingGroupRouteId;
      if ("pendingRoomRouteId" in next) pendingRoomRouteId = next.pendingRoomRouteId;
      if ("viewerRoomId" in next) setViewerState({ viewerRoomId: next.viewerRoomId });
      if ("viewerStreamPath" in next) setViewerState({ viewerStreamPath: next.viewerStreamPath });
    },
    loadGroup: (...args) => loadGroup(...args),
    setGroupState,
    setGroupsView: () => setGroupsView(),
    setViewerState,
    setNavigationView: (view) => setNavigationState({ view }),
  });
  const { canonicalizeAuthenticatedRoute, detectViewerRoute, handleBrowserPopState, openPendingChannelRoute, replaceBrowserPath } = routeController;

  $: ({
    selectedGroup,
    normalizedGroupPickerQuery,
    groupPickerGroups,
    displayPickerAvailability,
    displaySourceGroups,
    broadcastAudioSourceCandidates,
    rooms,
    textRooms,
    voiceRooms,
    groupLiveStreams,
    selectedRoomLiveStreams,
    selectedRoomLiveStream,
    watchedSelectedRoomLive,
    watchingSelectedRoomLive,
    activeVoiceRoom,
    selectedRoom,
    selectedRoomRemoteVoice,
    groupMembers,
    voiceLobbyParticipants,
    homeLiveStreams,
    homeCommunityGroups,
    selectedRole,
    currentGroupMember,
    normalizedRoleMemberSearch,
    filteredRoleMembers,
    activeGroupInvites,
    canMoveVoiceMembers,
    memberRoleGroups,
    isDark,
    visibleNotifications,
    readNotificationCount,
    unreadDirectNotification,
    visualStyle,
    roomMessages,
  } = deriveAppState({
    groups,
    selectedGroupId,
    groupPickerQuery,
    displaySources,
    displaySourceFilter,
    broadcastSelectionKind,
    broadcastAudioSources,
    groupOverview,
    selectedRoomId,
    watchingGroupLiveStreamId,
    user,
    voiceRoomId,
    voiceState,
    streams,
    groupRoles,
    selectedRoleId,
    roleMemberSearchQuery,
    groupInvites,
    hideReadNotifications,
    notifications,
    buttonColor,
    inputBackgroundColor,
    backgroundColor,
    theme,
    visibleVoiceParticipants,
  }));
  $: if (!showRoomDialog && roomDialogMode === "edit") {
    roomDialogMode = "create";
    editingRoomId = "";
  }
  $: if (selectedGroupId && selectedRoom?.kind === "text" && groupOverview?.group?.id === selectedGroupId) {
    const autoReadKey = `${selectedGroupId}:${selectedRoom.id}`;
    if (lastAutoMarkedGroupRoomKey !== autoReadKey) {
      lastAutoMarkedGroupRoomKey = autoReadKey;
      void markGroupRoomRead(selectedRoom);
    }
  }
  $: if (groupRoles.length && !groupRoles.some((role) => role.id === selectedRoleId)) selectedRoleId = groupRoles[0].id;
  $: if (selectedRole && selectedRole.id !== roleEditId) {
    roleEditId = selectedRole.id;
    roleEditName = selectedRole.name;
    roleEditColor = selectedRole.color;
  }
  $: if (selectedGroupId !== groupApplicationCommandsGroupId) {
    void loadGroupApplicationCommands(selectedGroupId);
  }
  $: if (notice) {
    const noticeAtDisplay = notice;
    setTimeout(() => { if (notice === noticeAtDisplay) notice = ""; }, 5000);
  }

  const api = createApiClient({ reportError: reportClientError });
  const applicationCommandController = createApplicationCommandController({
    api,
    getState: () => applicationCommandState.getState(),
    setState: (next) => applicationCommandState.setState(next),
    setNotice: (message) => { notice = message; },
  });
  const voiceSoundController = createVoiceSoundController({
    getState: () => ({ soundPreferences, voiceDeafened, voiceOutputVolume }),
    setState: (next) => {
      if ("soundPreferences" in next) soundPreferences = next.soundPreferences;
      if ("voiceSoundEffects" in next) voiceSoundEffects = next.voiceSoundEffects;
    },
  });
  const {
    getAudioContext: getVoiceSoundContext,
    getCurrentAudioContext,
    soundEnabled,
    updateSoundPreference,
    playVoiceSound,
    previewVoiceSound,
  } = voiceSoundController;
  const voiceShortcutController = createVoiceShortcutController({
    getState: () => ({
      desktopMuteShortcutGlobal,
      desktopPushToTalkGlobal,
      isDesktop,
      muteShortcut,
      muteShortcutCapturing,
      pushToTalkActive,
      pushToTalkCapturing,
      pushToTalkEnabled,
      pushToTalkKey,
      voiceState,
    }),
    setState: (next) => {
      if ("desktopMuteShortcutGlobal" in next) desktopMuteShortcutGlobal = next.desktopMuteShortcutGlobal;
      if ("desktopPushToTalkGlobal" in next) desktopPushToTalkGlobal = next.desktopPushToTalkGlobal;
      if ("muteShortcut" in next) muteShortcut = next.muteShortcut;
      if ("muteShortcutCapturing" in next) muteShortcutCapturing = next.muteShortcutCapturing;
      if ("pushToTalkActive" in next) pushToTalkActive = next.pushToTalkActive;
      if ("pushToTalkCapturing" in next) pushToTalkCapturing = next.pushToTalkCapturing;
      if ("pushToTalkEnabled" in next) pushToTalkEnabled = next.pushToTalkEnabled;
      if ("pushToTalkKey" in next) pushToTalkKey = next.pushToTalkKey;
      if ("settingsError" in next) setSettingsState({ settingsError: next.settingsError });
    },
    setVoiceMuted: (nextMuted) => setVoiceMuted(nextMuted),
    toggleVoiceMute: () => toggleVoiceMute(),
  });
  const {
    clearMuteShortcut,
    clearPushToTalkKey,
    handleDesktopMuteShortcut,
    handleDesktopPushToTalk,
    handleMuteShortcutKeyDown,
    handleMuteShortcutMouseDown,
    handlePushToTalkKeyDown,
    handlePushToTalkKeyUp,
    pushToTalkLabel,
    releasePushToTalk,
    shortcutLabel,
    startMuteShortcutCapture,
    startPushToTalkCapture,
    syncDesktopShortcuts,
    togglePushToTalk,
  } = voiceShortcutController;
  const voiceParticipantPreferencesController = createVoiceParticipantPreferencesController({
    api,
    getState: () => ({
      user,
      voiceParticipants,
      voiceVolumes,
      voiceLocallyMutedParticipants,
      voiceOutputVolume,
      voiceRemoteAudio,
      voiceDeafened,
    }),
    setState: (next) => {
      if ("voiceVolumes" in next) voiceVolumes = next.voiceVolumes;
      if ("voiceLocallyMutedParticipants" in next) voiceLocallyMutedParticipants = next.voiceLocallyMutedParticipants;
    },
    normalizeAudioVolume,
    reportClientError,
  });
  const {
    VoicePreferenceMap,
    effectiveVolume: effectiveVoiceOutputVolume,
    isLocallyMuted: isVoiceParticipantLocallyMutedPreference,
    resolveTargetId: voicePreferenceTargetId,
    setVolume: setVoiceParticipantVolumePreference,
    toggleLocallyMuted: toggleVoiceParticipantLocalMutePreference,
  } = voiceParticipantPreferencesController;
  const voiceAudioTestController = createVoiceAudioTestController({
    captureInputStream: () => captureVoiceInputStream(),
    stopInputStream: (stream) => stopVoiceInputStream(stream),
    getAudioContextConstructor: () => window.AudioContext || window.webkitAudioContext,
    getAudioContext: () => getVoiceSoundContext(),
    getCurrentAudioContext,
    getSelectedInputDevice: () => selectedInputDeviceId,
    getSelectedOutputDevice: () => selectedOutputDeviceId,
    getOutputVolume: () => voiceOutputVolume,
    getIsDesktop: () => isDesktop,
    reportClientError,
    onStateChange: (next) => {
      voiceTestRunning = next.running;
      voiceTestLevel = next.level;
      voiceTestPeak = next.peak;
      voiceTestError = next.error;
      voiceTestStatus = next.status;
      voiceTestSpeakerStatus = next.speakerStatus;
    },
  });
  const voiceDeviceController = createVoiceDeviceController({
    getState: () => ({
      user,
      selectedInputDeviceId,
      selectedInputDeviceLabel,
      selectedOutputDeviceId,
      allAudioInputDevices,
      audioDevicesRequestRevision,
      voiceInputSelectionRevision,
      voiceState,
      voiceTestRunning,
      voiceLocalStream,
      voiceMuted,
      voiceMutedByCaptureFailure,
      voiceServerMuted,
      voiceError,
      voiceClientId,
      voiceRoomId,
      voiceParticipants,
      persistOutputPreference: (value) => api("/api/auth/preferences", { method: "PATCH", body: JSON.stringify({ preferredOutputDeviceId: value || null }) }).catch((error) => reportClientError("voice_output_device_server_persist_error", error)),
      getRemoteAudio: () => voiceRemoteAudio,
      isFallbackStream: (stream) => voiceInputFallbackStreams.has(stream),
      deleteFallbackStream: (stream) => voiceInputFallbackStreams.delete(stream),
    }),
    setState: (next) => {
      if ("selectedInputDeviceId" in next) selectedInputDeviceId = next.selectedInputDeviceId;
      if ("selectedInputDeviceLabel" in next) selectedInputDeviceLabel = next.selectedInputDeviceLabel;
      if ("selectedOutputDeviceId" in next) selectedOutputDeviceId = next.selectedOutputDeviceId;
      if ("allAudioInputDevices" in next) allAudioInputDevices = next.allAudioInputDevices;
      if ("audioInputDevices" in next) audioInputDevices = next.audioInputDevices;
      if ("cameraInputDevices" in next) cameraInputDevices = next.cameraInputDevices;
      if ("audioOutputDevices" in next) audioOutputDevices = next.audioOutputDevices;
      if ("audioDevicesRequestRevision" in next) audioDevicesRequestRevision = next.audioDevicesRequestRevision;
      if ("voiceInputSelectionRevision" in next) voiceInputSelectionRevision = next.voiceInputSelectionRevision;
      if ("voiceDevicesBusy" in next) voiceDevicesBusy = next.voiceDevicesBusy;
      if ("voiceDevicesError" in next) voiceDevicesError = next.voiceDevicesError;
      if ("voiceLocalStream" in next) voiceLocalStream = next.voiceLocalStream;
      if ("voiceMuted" in next) voiceMuted = next.voiceMuted;
      if ("voiceMutedByCaptureFailure" in next) voiceMutedByCaptureFailure = next.voiceMutedByCaptureFailure;
      if ("voiceParticipants" in next) voiceParticipants = next.voiceParticipants;
      if ("voiceError" in next) voiceError = next.voiceError;
    },
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
    getVoiceAudioConstraints: () => voiceAudioConstraints(),
    getSelectedVoiceAudioConstraints: () => selectedVoiceAudioConstraints(),
    persistPreferredInputDeviceId,
    clearUnavailableInputDevice,
    reportClientError,
    captureInputStream: (...args) => captureVoiceInputStream(...args),
    stopInputStream: (...args) => stopVoiceInputStream(...args),
    stopVoiceTest: () => stopVoiceTest(),
    getRemoteAudio: () => voiceRemoteAudio,
    playRemoteAudio: (...args) => playVoiceRemoteAudio(...args),
    bindLocalTrack: (...args) => bindVoiceLocalTrack(...args),
    syncLocalTrackToPeers: (...args) => syncVoiceLocalTrackToPeers(...args),
    attachVoiceActivityStream: (...args) => attachVoiceActivityStream(...args),
    clearVoiceActivityAnalyzer: (...args) => clearVoiceActivityAnalyzer(...args),
    ensureVoiceActivityTimer: (...args) => ensureVoiceActivityTimer(...args),
    upsertVoiceRoomParticipant: (...args) => upsertVoiceRoomParticipant(...args),
    sendVoiceMuteState: (muted) => sendVoice({ type: "voice-mute-state", muted }),
  });
  async function loadAudioDevices(requestPermission = false) { return voiceDeviceController.loadAudioDevices(requestPermission); }
  async function applyVoiceInputDevice(deviceId = selectedInputDeviceId) { return voiceDeviceController.applyVoiceInputDevice(deviceId); }
  async function applyVoiceOutputDevice(deviceId = selectedOutputDeviceId) { return voiceDeviceController.applyVoiceOutputDevice(deviceId); }
  const voiceInputLifecycleController = createVoiceInputLifecycleController({
    getState: () => ({
      voiceState,
      voiceLocalStream,
      voiceMuted,
      voiceMutedByCaptureFailure,
      voiceServerMuted,
      voiceError,
      voiceClientId,
      voiceRoomId,
      voiceParticipants,
      selectedInputDeviceId,
    }),
    setState: (next) => {
      if ("voiceLocalStream" in next) voiceLocalStream = next.voiceLocalStream;
      if ("voiceMuted" in next) voiceMuted = next.voiceMuted;
      if ("voiceMutedByCaptureFailure" in next) voiceMutedByCaptureFailure = next.voiceMutedByCaptureFailure;
      if ("voiceParticipants" in next) voiceParticipants = next.voiceParticipants;
      if ("voiceError" in next) voiceError = next.voiceError;
    },
    captureInputStream: () => captureVoiceInputStream(),
    stopInputStream: (stream) => stopVoiceInputStream(stream),
    syncLocalTrackToPeers: () => syncVoiceLocalTrackToPeers(),
    attachVoiceActivityStream: (participantId, stream) => attachVoiceActivityStream(participantId, stream),
    clearVoiceActivityAnalyzer: (participantId) => clearVoiceActivityAnalyzer(participantId),
    ensureVoiceActivityTimer: () => ensureVoiceActivityTimer(),
    applyInputDevice: (deviceId) => applyVoiceInputDevice(deviceId),
    getVoiceTestRunning: () => voiceTestRunning,
    stopVoiceTest: () => stopVoiceTest(),
    startVoiceTest: () => startVoiceTest(),
    upsertVoiceRoomParticipant: (roomId, participant) => upsertVoiceRoomParticipant(roomId, participant),
    sendVoiceMuteState: (muted) => sendVoice({ type: "voice-mute-state", muted }),
    reportClientError,
  });
  voiceInputRuntime = createVoiceInputRuntime({
    getState: () => ({
      voiceInputProfile,
      voiceAdvancedOptions,
      selectedInputDeviceId,
      selectedInputDeviceLabel,
      allAudioInputDevices,
      voiceInputDeviceByStream,
      voiceInputSelectionRevision,
      voiceMicrophoneVolume,
      voiceLocalStream,
      voiceMuted,
      voiceServerMuted,
      voiceClientId,
      voiceState,
      broadcastMicrophoneStream,
    }),
    setState: (next) => {
      if ("selectedInputDeviceLabel" in next) selectedInputDeviceLabel = next.selectedInputDeviceLabel;
      if ("voiceMicrophoneVolume" in next) voiceMicrophoneVolume = next.voiceMicrophoneVolume;
      if ("voiceLocalStream" in next) voiceLocalStream = next.voiceLocalStream;
    },
    voiceInputPipeline,
    voiceCaptureService,
    voiceTrackSyncService,
    voiceInputLifecycleController,
    voiceAudioTestController,
    createVoiceAudioConstraints,
    createSelectedVoiceAudioConstraints,
    normalizeAudioVolume,
    rawAudioDeviceLabel,
    reportClientError,
    scheduleAudioVolumePersistence: (...args) => scheduleAudioVolumePersistence(...args),
    clearVoiceActivityAnalyzer: (...args) => clearVoiceActivityAnalyzer(...args),
    attachVoiceActivityStream: (...args) => attachVoiceActivityStream(...args),
    ensureVoiceActivityTimer: (...args) => ensureVoiceActivityTimer(...args),
  });
  const voiceRemotePlaybackController = createVoiceRemotePlaybackController({
    audioByParticipant: voiceRemoteAudio,
    bindingsByParticipant: voiceRemoteAudioBindings,
    playbackTimersByParticipant: voiceRemotePlaybackTimers,
    isConnected: () => voiceState === "connected",
    isDeafened: () => voiceDeafened,
    isLocallyMuted: (participantId) => voiceLocallyMutedParticipants.has(voicePreferenceTargetId(participantId)),
    getOutputDeviceId: () => selectedOutputDeviceId,
    setOutputDeviceFallback: () => {
      selectedOutputDeviceId = "";
      try { localStorage.removeItem("mirante-voice-output"); } catch (error) { reportClientError("voice_output_device_persist_error", error); }
    },
    getEffectiveVolume: (participantId) => effectiveVoiceOutputVolume(participantId),
    setPlaybackBlocked: (value) => { voicePlaybackBlocked = value; },
    setVoiceError: (value) => { voiceError = value; },
    reportClientError,
  });
  const groupRoomReadController = createGroupRoomReadController({
    api,
    getSelectedGroupId: () => selectedGroupId,
    getGroupOverview: () => groupOverview,
    setGroupOverview: (value) => setGroupState({ groupOverview: value }),
    getUser: () => user,
  });
  const { markGroupRoomRead, messageBelongsToRoom, incrementGroupRoomUnread } = groupRoomReadController;
  const settingsNavigationController = createSettingsNavigationController({
    api,
    getState: () => ({
      view,
      user,
      selectedGroup,
      selectedGroupId,
      selectedInputDeviceId,
      selectedInputDeviceLabel,
      selectedOutputDeviceId,
    }),
    setState: (next) => {
      const setters = {
        showGlobalSidebar: (value) => setNavigationState({ showGlobalSidebar: value }),
        settingsTab: (value) => setSettingsState({ settingsTab: value }),
        settingsSection: (value) => setSettingsState({ settingsSection: value }),
        settingsReturnView: (value) => setSettingsState({ settingsReturnView: value }),
        settingsError: (value) => setSettingsState({ settingsError: value }),
        settingsDisplayName: (value) => setSettingsState({ settingsDisplayName: value }),
        settingsAvatarData: (value) => setSettingsState({ settingsAvatarData: value }),
        avatarError: (value) => setSettingsState({ avatarError: value }),
        channelDisplayName: (value) => setSettingsState({ channelDisplayName: value }),
        channelAvatarData: (value) => setSettingsState({ channelAvatarData: value }),
        channelGames: (value) => setSettingsState({ channelGames: value }),
        channelError: (value) => setSettingsState({ channelError: value }),
        groupSettingsName: (value) => { groupSettingsName = value; },
        groupRoles: (value) => { groupRoles = value; },
        groupInvites: (value) => { groupInvites = value; },
        groupInviteLink: (value) => { groupInviteLink = value; },
        groupAdminError: (value) => { groupAdminError = value; },
        draggedRoleId: (value) => { draggedRoleId = value; },
        dragOverRoleId: (value) => { dragOverRoleId = value; },
        roleOrderSaving: (value) => { roleOrderSaving = value; },
        selectedInputDeviceId: (value) => { selectedInputDeviceId = value; },
        selectedInputDeviceLabel: (value) => { selectedInputDeviceLabel = value; },
        selectedOutputDeviceId: (value) => { selectedOutputDeviceId = value; },
        voiceDevicesError: (value) => { voiceDevicesError = value; },
        view: (value) => setNavigationState({ view: value }),
      };
      for (const [key, value] of Object.entries(next)) setters[key]?.(value);
    },
    readStoredVoiceDeviceId,
    readStoredVoiceDeviceLabel,
    loadGroupAdministration,
    loadAudioDevices,
    tick,
    getSettingsPageElement: () => settingsPageElement,
  });
  async function openSettings(...args) { return settingsNavigationController.openSettings(...args); }
  function selectSettingsSection(...args) { return settingsNavigationController.selectSettingsSection(...args); }
  const accountController = createAccountController({
    openSettings,
    setSettingsState,
    setUserMenuVisible: (value) => { showUserMenu = value; },
    tick,
    documentObject: document,
  });
  async function openAccountDestination(...args) { return accountController.openDestination(...args); }
  function handleGlobalAccountClick(...args) { return accountController.handleGlobalClick(...args); }
  const authController = createAuthController({
    api,
    getState: () => authState.getState(),
    setState: setAuthState,
    onAuthenticated: async (nextUser) => {
      user = nextUser;
      canonicalizeAuthenticatedRoute();
      await refresh();
      await redeemPendingInvite();
      await openPendingChannelRoute();
    },
    navigateOAuth: (provider) => window.location.assign(`/api/auth/${provider}`),
  });
  async function submitAuth(...args) { return authController.submitAuth(...args); }
  function startOAuth(...args) { return authController.startOAuth(...args); }
  const notificationController = createNotificationController({
    api,
    getUser: () => user,
    getState: () => notificationState.getState(),
    setState: setNotificationState,
    playVoiceSound: (kind) => playVoiceSound(kind),
  });
  const {
    loadNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    receiveNotification,
    setHideReadNotifications,
    syncNotificationHideReadPreference,
  } = notificationController;
  const groupEventRuntime = createGroupEventRuntime({
    createGateway: (options) => createGroupEventGateway(options),
    loadHandler: () => import("./features/groups/group-event-handler.js")
      .then(({ createGroupEventHandler }) => createGroupEventHandler({
        getSelectedGroupId: () => selectedGroupId,
        getGroupOverview: () => groupOverview,
        setGroupOverview: (value) => setGroupState({ groupOverview: value }),
        getUser: () => user,
        getRooms: () => rooms,
        getSelectedRoomId: () => selectedRoomId,
        getActiveGroupThread: () => activeGroupThread,
        setActiveGroupThread: (value) => setMessageState({ activeGroupThread: value }),
        getGroupThreadMessages: () => groupThreadMessages,
        setGroupThreadMessages: (value) => setMessageState({ groupThreadMessages: value }),
        getKnownGroupMessageIds: () => knownGroupMessageIds,
        setKnownGroupMessageIds: (value) => setGroupState({ knownGroupMessageIds: value }),
        shouldKeepGroupMessagesAtBottom,
        markGroupRoomRead,
        messageBelongsToRoom,
        incrementGroupRoomUnread,
        playVoiceSound,
        scrollGroupMessagesToBottom,
      })),
    onNotification: (notification) => receiveNotification(notification),
    onHandlerError: (error) => reportClientError("group_event_handler_error", error),
    onGatewayError: (error) => reportClientError("group_events_error", error),
  });
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
          const directPatch = {};
          if ("directConversationError" in next) directPatch.directConversationError = next.directConversationError;
          if ("directConversationId" in next) directPatch.directConversationId = next.directConversationId;
          if ("directConversationLoading" in next) directPatch.directConversationLoading = next.directConversationLoading;
          if ("directConversationRefreshId" in next) directPatch.directConversationRefreshId = next.directConversationRefreshId;
          if ("directConversationRefreshInFlight" in next) directPatch.directConversationRefreshInFlight = next.directConversationRefreshInFlight;
          if ("directConversationRefreshQueued" in next) directPatch.directConversationRefreshQueued = next.directConversationRefreshQueued;
          if ("directConversationSending" in next) directPatch.directConversationSending = next.directConversationSending;
          if ("directConversationTarget" in next) directPatch.directConversationTarget = next.directConversationTarget;
          if ("directConversations" in next) directPatch.directConversations = next.directConversations;
          if ("directConversationsRefreshInFlight" in next) directPatch.directConversationsRefreshInFlight = next.directConversationsRefreshInFlight;
          if ("directMessageDraft" in next) directPatch.directMessageDraft = next.directMessageDraft;
          if ("directMessages" in next) directPatch.directMessages = next.directMessages;
          if (Object.keys(directPatch).length) setDirectState(directPatch);
          if ("view" in next) setNavigationState({ view: next.view });
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
          editingRoomId,
          groupName,
          groupLoadSequence,
          groupLoading,
          groupOverview,
          groupOverviewRefreshInFlight,
          groupOverviewRetryAt,
          groupPresenceRefreshInFlight,
          groups,
          knownGroupMessageIds,
          pendingGroupOverviewRequests,
          roomDialogMode,
          roomKind,
          roomMaxParticipants,
          roomName,
          selectedGroupId,
          selectedRoomId,
          showGroupDialog,
          showGroupPicker,
          showRoomDialog,
          user,
          watchingGroupLiveStreamId,
        }),
        setState: (next) => {
          if ("editingRoomId" in next) editingRoomId = next.editingRoomId;
          if ("groupName" in next) groupName = next.groupName;
          const groupPatch = {};
          if ("groupLoadSequence" in next) groupPatch.groupLoadSequence = next.groupLoadSequence;
          if ("groupLoading" in next) groupPatch.groupLoading = next.groupLoading;
          if ("groupOverview" in next) groupPatch.groupOverview = next.groupOverview;
          if ("groupOverviewRefreshInFlight" in next) groupPatch.groupOverviewRefreshInFlight = next.groupOverviewRefreshInFlight;
          if ("groupOverviewRetryAt" in next) groupPatch.groupOverviewRetryAt = next.groupOverviewRetryAt;
          if ("groupPresenceRefreshInFlight" in next) groupPatch.groupPresenceRefreshInFlight = next.groupPresenceRefreshInFlight;
          if ("groups" in next) groupPatch.groups = next.groups;
          if ("knownGroupMessageIds" in next) groupPatch.knownGroupMessageIds = next.knownGroupMessageIds;
          if ("selectedGroupId" in next) groupPatch.selectedGroupId = next.selectedGroupId;
          if ("selectedRoomId" in next) groupPatch.selectedRoomId = next.selectedRoomId;
          if ("roomDialogMode" in next) roomDialogMode = next.roomDialogMode;
          if ("roomKind" in next) roomKind = next.roomKind;
          if ("roomMaxParticipants" in next) roomMaxParticipants = next.roomMaxParticipants;
          if ("roomName" in next) roomName = next.roomName;
          if ("showGroupDialog" in next) showGroupDialog = next.showGroupDialog;
          if ("showGroupPicker" in next) showGroupPicker = next.showGroupPicker;
          if ("showRoomDialog" in next) showRoomDialog = next.showRoomDialog;
          if ("showMobileChannels" in next) setNavigationState({ showMobileChannels: next.showMobileChannels });
          const messagePatch = {};
          if ("mentionSuggestions" in next) messagePatch.mentionSuggestions = next.mentionSuggestions;
          if ("mentionStartIndex" in next) messagePatch.mentionStartIndex = next.mentionStartIndex;
          if ("mentionActiveIndex" in next) messagePatch.mentionActiveIndex = next.mentionActiveIndex;
          if (Object.keys(messagePatch).length) setMessageState(messagePatch);
          if ("watchingGroupLiveStreamId" in next) groupPatch.watchingGroupLiveStreamId = next.watchingGroupLiveStreamId;
          if (Object.keys(groupPatch).length) setGroupState(groupPatch);
        },
        mergeActiveVoicePresence,
        shouldKeepGroupMessagesAtBottom,
        scrollGroupMessagesToBottom,
        playVoiceSound,
        setNotice: (message) => { notice = message; },
        getUser: () => user,
        getIsViewer: () => isViewer,
        subscribeGroup: (groupId) => groupEventRuntime.ensure().subscribeGroup(groupId),
        getSelectedRoomId: () => selectedRoomId,
        markGroupRoomRead: (room) => markGroupRoomRead(room),
        getVoiceSoundContext: () => getVoiceSoundContext(),
         getMessageComposerInput: () => messageComposerInput,
         tick,
         joinVoiceRoom: () => joinVoiceRoom(),
         setGroupsView: () => setGroupsView(),
       }));
    }
    return groupControllerPromise;
  }
  async function createGroup(...args) { return (await getGroupController()).createGroup(...args); }
  async function createRoom(...args) { return (await getGroupController()).createRoom(...args); }
  function openCreateRoomDialog(...args) { void getGroupController().then((controller) => controller.openCreateRoomDialog(...args)); }
  async function loadGroups(...args) { return (await getGroupController()).loadGroups(...args); }
  async function loadGroup(...args) { return (await getGroupController()).loadGroup(...args); }
  async function selectRoom(...args) { return (await getGroupController()).selectRoom(...args); }

  async function loadGroupApplicationCommands(groupId) {
    await applicationCommandController.loadForGroup(groupId);
  }

  async function startApplicationInteraction({ applicationId, commandName, options }) {
    if (!selectedGroupId || selectedRoom?.kind !== "text") {
      notice = "Selecione um canal de texto para usar um comando.";
      return;
    }
    try {
      await applicationCommandController.invoke({
        groupId: selectedGroupId,
        roomId: selectedRoom.id,
        applicationId,
        commandName,
        options,
      });
    } catch (error) {
      notice = error?.message || "Não foi possível enviar o comando ao bot.";
      throw error;
    }
  }

  let groupMembershipControllerPromise = null;
  function getGroupMembershipController() {
    if (!groupMembershipControllerPromise) {
      groupMembershipControllerPromise = import("./features/groups/membership-controller.js").then(({ createGroupMembershipController }) => createGroupMembershipController({
        api,
        getUser: () => user,
        getState: () => ({
          groupAdminError,
          groupJoinActionId,
          groupJoinRequests,
          groupSearchBusy,
          groupSearchError,
          groupSearchQuery,
          groupSearchResults,
          inviteActionId,
          inviteSearchBusy,
          inviteSearchError,
          inviteSearchQuery,
          inviteSearchResults,
          groupInviteLink,
          pendingInviteToken,
          selectedGroupId,
        }),
        setState: (next) => {
          if ("groupAdminError" in next) groupAdminError = next.groupAdminError;
          if ("groupJoinActionId" in next) groupJoinActionId = next.groupJoinActionId;
          if ("groupJoinRequests" in next) groupJoinRequests = next.groupJoinRequests;
          if ("groupSearchBusy" in next) groupSearchBusy = next.groupSearchBusy;
          if ("groupSearchError" in next) groupSearchError = next.groupSearchError;
          if ("groupSearchQuery" in next) groupSearchQuery = next.groupSearchQuery;
          if ("groupSearchResults" in next) groupSearchResults = next.groupSearchResults;
          if ("groupInviteLink" in next) groupInviteLink = next.groupInviteLink;
          if ("inviteActionId" in next) inviteActionId = next.inviteActionId;
          if ("inviteSearchBusy" in next) inviteSearchBusy = next.inviteSearchBusy;
          if ("inviteSearchError" in next) inviteSearchError = next.inviteSearchError;
          if ("inviteSearchQuery" in next) inviteSearchQuery = next.inviteSearchQuery;
          if ("inviteSearchResults" in next) inviteSearchResults = next.inviteSearchResults;
          if ("notice" in next) notice = next.notice;
          if ("pendingInviteToken" in next) pendingInviteToken = next.pendingInviteToken;
          if ("showGroupSearchDialog" in next) showGroupSearchDialog = next.showGroupSearchDialog;
          if ("showInviteDialog" in next) showInviteDialog = next.showInviteDialog;
        },
        loadGroups,
        loadGroup,
        loadNotifications,
        markNotificationRead,
        openSettings,
        setGroupsView,
      }));
    }
    return groupMembershipControllerPromise;
  }
  async function inviteUser(...args) { return (await getGroupMembershipController()).inviteUser(...args); }
  function openGroupSearchDialog(...args) { void getGroupMembershipController().then((controller) => controller.openGroupSearchDialog(...args)); }
  function openInviteDialog(...args) { void getGroupMembershipController().then((controller) => controller.openInviteDialog(...args)); }
  async function redeemPendingInvite(...args) { return (await getGroupMembershipController()).redeemPendingInvite(...args); }
  async function requestGroupEntry(...args) { return (await getGroupMembershipController()).requestGroupEntry(...args); }
  async function respondToGroupJoinRequest(...args) { return (await getGroupMembershipController()).respondToGroupJoinRequest(...args); }
  async function respondToInvite(...args) { return (await getGroupMembershipController()).respondToInvite(...args); }
  async function searchGroups(...args) { return (await getGroupMembershipController()).searchGroups(...args); }
  async function searchUsers(...args) { return (await getGroupMembershipController()).searchUsers(...args); }

  let groupAdministrationControllerPromise = null;
  function getGroupAdministrationController() {
    if (!groupAdministrationControllerPromise) {
      groupAdministrationControllerPromise = import("./features/groups/administration-controller.js").then(({ createGroupAdministrationController }) => createGroupAdministrationController({
        api,
        getState: () => ({
          dragOverRoleId,
          draggedRoleId,
          groupAdminError,
          groupAuditEntries,
          groupInvites,
          groupJoinRequests,
          groupOverview,
          groupRoles,
          groupRoomPermissions,
          roleOrderSaving,
          roomPermissionBusyKey,
          selectedGroup,
          selectedGroupId,
          selectedRoomPermissionId,
        }),
        setState: (next) => {
          if ("dragOverRoleId" in next) dragOverRoleId = next.dragOverRoleId;
          if ("draggedRoleId" in next) draggedRoleId = next.draggedRoleId;
          if ("groupAdminError" in next) groupAdminError = next.groupAdminError;
          if ("groupAuditEntries" in next) groupAuditEntries = next.groupAuditEntries;
          if ("groupInvites" in next) groupInvites = next.groupInvites;
          if ("groupJoinRequests" in next) groupJoinRequests = next.groupJoinRequests;
          if ("groupOverview" in next) setGroupState({ groupOverview: next.groupOverview });
          if ("groupRoles" in next) groupRoles = next.groupRoles;
          if ("groupRoomPermissions" in next) groupRoomPermissions = next.groupRoomPermissions;
          if ("notice" in next) notice = next.notice;
          if ("roleOrderSaving" in next) roleOrderSaving = next.roleOrderSaving;
          if ("roomPermissionBusyKey" in next) roomPermissionBusyKey = next.roomPermissionBusyKey;
          if ("selectedRoomPermissionId" in next) selectedRoomPermissionId = next.selectedRoomPermissionId;
        },
      }));
    }
    return groupAdministrationControllerPromise;
  }
  async function loadGroupAdministration(...args) { return (await getGroupAdministrationController()).loadGroupAdministration(...args); }
  async function loadGroupRoomPermissions(...args) { return (await getGroupAdministrationController()).loadGroupRoomPermissions(...args); }
  async function refreshGroupAfterModeration(...args) { return (await getGroupAdministrationController()).refreshGroupAfterModeration(...args); }
  async function updateGroupRoomPermission(...args) { return (await getGroupAdministrationController()).updateGroupRoomPermission(...args); }
  async function resetGroupRoomPermission(...args) { return (await getGroupAdministrationController()).resetGroupRoomPermission(...args); }
  function startRoleDrag(...args) { void getGroupAdministrationController().then((controller) => controller.startRoleDrag(...args)); }
  function handleRoleDragOver(...args) { void getGroupAdministrationController().then((controller) => controller.handleRoleDragOver(...args)); }
  async function dropRole(...args) { return (await getGroupAdministrationController()).dropRole(...args); }
  function endRoleDrag(...args) { void getGroupAdministrationController().then((controller) => controller.endRoleDrag(...args)); }
  async function moveRole(...args) { return (await getGroupAdministrationController()).moveRole(...args); }

  let groupMessageControllerPromise = null;
  function getGroupMessageController() {
    if (!groupMessageControllerPromise) {
      groupMessageControllerPromise = import("./features/groups/message-controller.js").then(({ createGroupMessageController }) => createGroupMessageController({
        api,
        getState: () => ({
          activeGroupThread,
          editingMessageDraft,
          editingMessageId,
          groupMessageSearchBusy,
          groupMessageSearchError,
          groupMessageSearchQuery,
          groupMessageSearchResults,
          showGroupMessageSearch,
          groupOverview,
          groupThreadMessages,
          knownGroupMessageIds,
          messageAttachments,
          messageDraft,
          notice,
          rooms,
          selectedGroupId,
          selectedRoom,
          selectedRoomId,
          user,
        }),
        setState: (next) => {
          const messagePatch = {};
          if ("activeGroupThread" in next) messagePatch.activeGroupThread = next.activeGroupThread;
          if ("editingMessageDraft" in next) messagePatch.editingMessageDraft = next.editingMessageDraft;
          if ("editingMessageId" in next) messagePatch.editingMessageId = next.editingMessageId;
          if ("groupMessageSearchBusy" in next) messagePatch.groupMessageSearchBusy = next.groupMessageSearchBusy;
          if ("groupMessageSearchError" in next) messagePatch.groupMessageSearchError = next.groupMessageSearchError;
          if ("groupMessageSearchQuery" in next) messagePatch.groupMessageSearchQuery = next.groupMessageSearchQuery;
          if ("groupMessageSearchResults" in next) messagePatch.groupMessageSearchResults = next.groupMessageSearchResults;
          if (Object.keys(messagePatch).length) setMessageState(messagePatch);
          if ("showGroupMessageSearch" in next) showGroupMessageSearch = next.showGroupMessageSearch;
          if ("groupOverview" in next) setGroupState({ groupOverview: next.groupOverview });
          if ("groupThreadMessages" in next) setMessageState({ groupThreadMessages: next.groupThreadMessages });
          if ("knownGroupMessageIds" in next) setGroupState({ knownGroupMessageIds: next.knownGroupMessageIds });
          if ("messageAttachments" in next) setMessageState({ messageAttachments: next.messageAttachments });
          if ("messageDraft" in next) setMessageState({ messageDraft: next.messageDraft });
          if ("notice" in next) notice = next.notice;
        },
        selectRoom,
        scrollGroupMessagesToBottom,
      }));
    }
    return groupMessageControllerPromise;
  }
  async function addMessageAttachments(...args) { return (await getGroupMessageController()).addMessageAttachments(...args); }
  async function deleteMessage(...args) { return (await getGroupMessageController()).deleteMessage(...args); }
  async function openGroupMessageSearchResult(...args) { return (await getGroupMessageController()).openGroupMessageSearchResult(...args); }
  async function saveEditMessage(...args) { return (await getGroupMessageController()).saveEditMessage(...args); }
  async function searchGroupMessages(...args) { return (await getGroupMessageController()).searchGroupMessages(...args); }
  async function sendMessage(...args) { return (await getGroupMessageController()).sendMessage(...args); }
  async function startEditMessage(...args) { return (await getGroupMessageController()).startEditMessage(...args); }
  async function submitBotComponent(...args) { return applicationCommandController.submitComponent(...args); }
  async function submitBotModal(...args) { return applicationCommandController.submitModal(...args); }
  function cancelEditMessage(...args) { void getGroupMessageController().then((controller) => controller.cancelEditMessage(...args)); }
  function openGroupMessageSearch(...args) { void getGroupMessageController().then((controller) => controller.openGroupMessageSearch(...args)); }
  function removeMessageAttachment(...args) { void getGroupMessageController().then((controller) => controller.removeMessageAttachment(...args)); }

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
          ...settingsState.getState(),
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
          voiceNoiseSuppressionStatus,
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
            theme: (value) => setVisualState({ theme: value }),
            selectedQuality: (value) => { selectedQuality = value; },
            audioMode: (value) => { audioMode = value; },
            selectedInputDeviceId: (value) => { selectedInputDeviceId = value; },
            selectedInputDeviceLabel: (value) => { selectedInputDeviceLabel = value; },
            selectedOutputDeviceId: (value) => { selectedOutputDeviceId = value; },
            voiceMicrophoneVolume: (value) => { voiceMicrophoneVolume = value; },
            voiceOutputVolume: (value) => { voiceOutputVolume = value; },
            liveNotificationScope: (value) => setLiveState({ liveNotificationScope: value }),
            liveNotificationScopes: (value) => setLiveState({ liveNotificationScopes: value }),
            pushToTalkKey: (value) => { pushToTalkKey = value; },
            pushToTalkEnabled: (value) => { pushToTalkEnabled = value; },
            muteShortcut: (value) => { muteShortcut = value; },
            buttonColor: (value) => setVisualState({ buttonColor: value }),
            inputBackgroundColor: (value) => setVisualState({ inputBackgroundColor: value }),
            backgroundColor: (value) => setVisualState({ backgroundColor: value }),
            channelDisplayName: (value) => setSettingsState({ channelDisplayName: value }),
            channelAvatarData: (value) => setSettingsState({ channelAvatarData: value }),
            channelGames: (value) => setSettingsState({ channelGames: value }),
            settingsDisplayName: (value) => setSettingsState({ settingsDisplayName: value }),
            settingsAvatarData: (value) => setSettingsState({ settingsAvatarData: value }),
            settingsBusy: (value) => setSettingsState({ settingsBusy: value }),
            settingsError: (value) => setSettingsState({ settingsError: value }),
            channelError: (value) => setSettingsState({ channelError: value }),
            preferencesResetBusy: (value) => setSettingsState({ preferencesResetBusy: value }),
            preferencesResetConfirm: (value) => setSettingsState({ preferencesResetConfirm: value }),
            user: (value) => { user = value; },
            notice: (value) => { notice = value; },
            voiceVolumes: (value) => { voiceVolumes = value; },
            voiceLocallyMutedParticipants: (value) => { voiceLocallyMutedParticipants = value; },
            voiceNoiseMode: (value) => { voiceNoiseMode = value; },
            voiceNoiseSuppressionStatus: (value) => { voiceNoiseSuppressionStatus = value; },
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

  let socialControllerPromise = null;
  function getSocialController() {
    if (!socialControllerPromise) {
      socialControllerPromise = import("./features/social/controller.js").then(({ createSocialController }) => createSocialController({
        api,
        getUser: () => user,
        loadStreams,
        setNotice: (message) => { notice = message; },
        getState: () => ({ ...socialState.getState(), streams }),
        setState: (next) => {
          const socialKeys = ["social", "socialSearchQuery", "socialSearchOpen", "socialRequestsOpen", "socialSearchResults", "socialSearchBusy", "socialError", "socialActionId", "socialRefreshInFlight"];
          const socialPatch = Object.fromEntries(socialKeys.filter((key) => key in next).map((key) => [key, next[key]]));
          if (Object.keys(socialPatch).length) setSocialState(socialPatch);
          if ("streams" in next) setLiveState({ streams: next.streams });
        },
      }));
    }
    return socialControllerPromise;
  }
  async function loadSocial(...args) { return (await getSocialController()).loadSocial(...args); }
  async function searchSocialUsers(...args) { return (await getSocialController()).searchSocialUsers(...args); }
  async function sendFriendRequest(...args) { return (await getSocialController()).sendFriendRequest(...args); }
  async function respondToFriendRequest(...args) { return (await getSocialController()).respondToFriendRequest(...args); }
  async function cancelFriendRequest(...args) { return (await getSocialController()).cancelFriendRequest(...args); }
  async function removeFriend(...args) { return (await getSocialController()).removeFriend(...args); }
  async function toggleFollowUser(...args) { return (await getSocialController()).toggleFollowUser(...args); }
  async function toggleBlockUser(...args) { return (await getSocialController()).toggleBlockUser(...args); }
  async function toggleFollowStream(...args) { return (await getSocialController()).toggleFollowStream(...args); }

  let liveControllerPromise = null;
  function getLiveController() {
    if (!liveControllerPromise) {
      liveControllerPromise = import("./features/live/controller.js").then(({ createLiveController }) => createLiveController({
        api,
        getUser: () => user,
        getState: () => ({
          followingOnly,
          isViewer,
          liveNotificationScopes,
          multistreamOpen,
          selectedStreams,
          streams,
          streamsRefreshInFlight: liveState.getState().streamsRefreshInFlight,
          viewerRoomId,
          viewerStream,
          viewerStreamPath,
          view,
        }),
        setState: (next) => {
          if ("followingOnly" in next) setLiveState({ followingOnly: next.followingOnly });
          if ("isViewer" in next) setViewerState({ isViewer: next.isViewer });
          if ("liveNotificationScope" in next) setLiveState({ liveNotificationScope: next.liveNotificationScope });
          if ("liveNotificationScopes" in next) setLiveState({ liveNotificationScopes: next.liveNotificationScopes });
          if ("multistreamOpen" in next) setNavigationState({ multistreamOpen: next.multistreamOpen });
          if ("selectedStreams" in next) setLiveState({ selectedStreams: next.selectedStreams });
          if ("streams" in next) setLiveState({ streams: next.streams });
          if ("streamsRefreshInFlight" in next) setLiveState({ streamsRefreshInFlight: next.streamsRefreshInFlight });
          if ("view" in next) setNavigationState({ view: next.view });
          if ("viewerRoomId" in next) setViewerState({ viewerRoomId: next.viewerRoomId });
          if ("viewerStream" in next) setViewerState({ viewerStream: next.viewerStream });
          if ("viewerStreamPath" in next) setViewerState({ viewerStreamPath: next.viewerStreamPath });
        },
        markNotificationRead,
        returnToBroadcast: () => returnToBroadcast(),
      }));
    }
    return liveControllerPromise;
  }
  async function loadStreams(...args) { return (await getLiveController()).loadStreams(...args); }
  function openStreamViewer(...args) { void getLiveController().then((controller) => controller.openStreamViewer(...args)); }
  async function openStreamNotification(...args) { return (await getLiveController()).openStreamNotification(...args); }
  function setLiveNotificationScope(...args) { void getLiveController().then((controller) => controller.setLiveNotificationScope(...args)); }
  function toggleStream(...args) { void getLiveController().then((controller) => controller.toggleStream(...args)); }
  function handleStreamCardClick(...args) { void getLiveController().then((controller) => controller.handleStreamCardClick(...args)); }
  function handleStreamCardKeydown(...args) { void getLiveController().then((controller) => controller.handleStreamCardKeydown(...args)); }
  function openMultistream(...args) { void getLiveController().then((controller) => controller.openMultistream(...args)); }
  function closeMultistream(...args) { void getLiveController().then((controller) => controller.closeMultistream(...args)); }

  let navigationControllerPromise = null;
  function getNavigationController() {
    if (!navigationControllerPromise) {
      navigationControllerPromise = import("./features/shell/navigation-controller.js").then(({ createNavigationController }) => createNavigationController({
        getState: () => ({ compactViewport, globalSidebarCollapsed, groupPickerQuery, groupsWorkspaceOpen, multistreamOpen, showGlobalSidebar, showMobileChannels, showMobileMembers, view }),
        setState: (next) => {
          const navigationPatch = {};
          if ("globalSidebarCollapsed" in next) navigationPatch.globalSidebarCollapsed = next.globalSidebarCollapsed;
          if ("groupPickerQuery" in next) navigationPatch.groupPickerQuery = next.groupPickerQuery;
          if ("groupsWorkspaceOpen" in next) navigationPatch.groupsWorkspaceOpen = next.groupsWorkspaceOpen;
          if ("multistreamOpen" in next) navigationPatch.multistreamOpen = next.multistreamOpen;
          if ("showGlobalSidebar" in next) navigationPatch.showGlobalSidebar = next.showGlobalSidebar;
          if ("showMobileChannels" in next) navigationPatch.showMobileChannels = next.showMobileChannels;
          if ("showMobileMembers" in next) navigationPatch.showMobileMembers = next.showMobileMembers;
          if ("view" in next) navigationPatch.view = next.view;
          if (Object.keys(navigationPatch).length) setNavigationState(navigationPatch);
        },
        loadGroups,
        loadStreams,
        loadNotifications,
        loadDirectConversations,
        loadSocial,
        loadGroup,
        setNotice: (message) => { notice = message; },
        setNotificationsError: (message) => setNotificationState({ notificationsError: message }),
        setDirectConversationError: (message) => setDirectState({ directConversationError: message }),
        setSocialError: (message) => setSocialState({ socialError: message }),
      }));
    }
    return navigationControllerPromise;
  }
  function selectView(...args) { void getNavigationController().then((controller) => controller.selectView(...args)); }
  function setGroupsView(...args) { void getNavigationController().then((controller) => controller.setGroupsView(...args)); }
  function openGroupWorkspace(...args) { void getNavigationController().then((controller) => controller.openGroupWorkspace(...args)); }
  function toggleGlobalNavigation(...args) { void getNavigationController().then((controller) => controller.toggleGlobalNavigation(...args)); }

  let releaseNotesControllerPromise = null;
  function getReleaseNotesController() {
    if (!releaseNotesControllerPromise) {
      releaseNotesControllerPromise = import("./features/shell/release-notes-controller.js").then(({ createReleaseNotesController }) => createReleaseNotesController({
        getState: () => ({ isDesktop, desktopVersion, releaseNotes, showReleaseNotes, showUserMenu, user }),
        setState: (next) => {
          if ("releaseNotes" in next) releaseNotes = next.releaseNotes;
          if ("showReleaseNotes" in next) showReleaseNotes = next.showReleaseNotes;
          if ("showUserMenu" in next) showUserMenu = next.showUserMenu;
        },
        setNotice: (message) => { notice = message; },
        webVersion: WEB_VERSION,
      }));
    }
    return releaseNotesControllerPromise;
  }
  function openReleaseNotes(...args) { void getReleaseNotesController().then((controller) => controller.openReleaseNotes(...args)); }
  function maybeShowReleaseNotes(...args) { void getReleaseNotesController().then((controller) => controller.maybeShowReleaseNotes(...args)); }
  function dismissReleaseNotes(...args) { void getReleaseNotesController().then((controller) => controller.dismissReleaseNotes(...args)); }

  let desktopControllerPromise = null;
  function getDesktopController() {
    if (!desktopControllerPromise) {
      desktopControllerPromise = import("./features/shell/desktop-controller.js").then(({ createDesktopController }) => createDesktopController({
        appVersion: APP_VERSION,
        getState: () => ({
          audioMode,
          broadcastAudioSelection,
          broadcastAudioSources,
          broadcastDisplaySurface,
          broadcastSelectedSourceName,
          desktopUpdate,
          desktopVersion,
          displaySourceFilter,
          displaySourceSelection,
          displaySources,
          hardwareAccelerationBusy,
          hardwareAccelerationError,
          hardwareAccelerationMode,
          isDesktop,
          launchAtLogin,
          launchAtLoginBusy,
          launchAtLoginError,
          selectedDisplayProcessId,
          showBroadcastAudioPicker,
          showDisplayPicker,
          voiceState,
        }),
        setState: (next) => {
          if ("broadcastAudioSelection" in next) broadcastAudioSelection = next.broadcastAudioSelection;
          if ("broadcastAudioSources" in next) broadcastAudioSources = next.broadcastAudioSources;
          if ("broadcastDisplaySurface" in next) setBroadcastState({ broadcastDisplaySurface: next.broadcastDisplaySurface });
          if ("broadcastSelectedSourceName" in next) setBroadcastState({ broadcastSelectedSourceName: next.broadcastSelectedSourceName });
          if ("desktopUpdate" in next) desktopUpdate = next.desktopUpdate;
          if ("desktopVersion" in next) desktopVersion = next.desktopVersion;
          if ("displaySourceFilter" in next) displaySourceFilter = next.displaySourceFilter;
          if ("displaySourceSelection" in next) displaySourceSelection = next.displaySourceSelection;
          if ("displaySources" in next) displaySources = next.displaySources;
          if ("hardwareAccelerationBusy" in next) hardwareAccelerationBusy = next.hardwareAccelerationBusy;
          if ("hardwareAccelerationError" in next) hardwareAccelerationError = next.hardwareAccelerationError;
          if ("hardwareAccelerationMode" in next) hardwareAccelerationMode = next.hardwareAccelerationMode;
          if ("launchAtLogin" in next) launchAtLogin = next.launchAtLogin;
          if ("launchAtLoginBusy" in next) launchAtLoginBusy = next.launchAtLoginBusy;
          if ("launchAtLoginError" in next) launchAtLoginError = next.launchAtLoginError;
          if ("selectedDisplayProcessId" in next) selectedDisplayProcessId = next.selectedDisplayProcessId;
          if ("showBroadcastAudioPicker" in next) showBroadcastAudioPicker = next.showBroadcastAudioPicker;
          if ("showDisplayPicker" in next) showDisplayPicker = next.showDisplayPicker;
        },
        setNotice: (message) => { notice = message; },
        toggleVoiceMute,
        toggleVoiceDeafen,
      }));
    }
    return desktopControllerPromise;
  }
  function handleDesktopUpdate(...args) { void getDesktopController().then((controller) => controller.handleDesktopUpdate(...args)); }
  function handleDesktopTrayAction(...args) { void getDesktopController().then((controller) => controller.handleDesktopTrayAction(...args)); }
  function loadDesktopVersion(...args) { void getDesktopController().then((controller) => controller.loadDesktopVersion(...args)); }
  function loadDesktopLaunchAtLogin(...args) { void getDesktopController().then((controller) => controller.loadDesktopLaunchAtLogin(...args)); }
  function loadDesktopHardwareAcceleration(...args) { void getDesktopController().then((controller) => controller.loadDesktopHardwareAcceleration(...args)); }
  function setHardwareAcceleration(...args) { void getDesktopController().then((controller) => controller.setHardwareAcceleration(...args)); }
  function toggleLaunchAtLogin(...args) { void getDesktopController().then((controller) => controller.toggleLaunchAtLogin(...args)); }
  function updateDesktopApp(...args) { void getDesktopController().then((controller) => controller.updateDesktopApp(...args)); }
  async function requestBroadcastAudioSource(...args) { return (await getDesktopController()).requestBroadcastAudioSource(...args); }
  function selectBroadcastAudioSource(...args) { void getDesktopController().then((controller) => controller.selectBroadcastAudioSource(...args)); }
  function skipBroadcastAudioSource(...args) { void getDesktopController().then((controller) => controller.skipBroadcastAudioSource(...args)); }
  function cancelBroadcastAudioPicker(...args) { void getDesktopController().then((controller) => controller.skipBroadcastAudioSource(...args)); }
  function selectDisplaySource(...args) { void getDesktopController().then((controller) => controller.selectDisplaySource(...args)); }
  function cancelDisplayPicker(...args) { void getDesktopController().then((controller) => controller.cancelDisplayPicker(...args)); }

  let broadcastTransportControllerPromise = null;
  function getBroadcastTransportController() {
    if (!broadcastTransportControllerPromise) {
      broadcastTransportControllerPromise = import("./features/broadcast/transport-controller.js").then(({ createBroadcastTransportController }) => createBroadcastTransportController({
        acceptGatewayMessage,
        getState: () => ({
          broadcastChatListElement,
          broadcastChatMessageIds,
          broadcastChatMessages,
          broadcastError,
          broadcastPeerNegotiations,
          broadcastPeerRetryTimers,
          broadcastRoomId,
          broadcastSocket,
          broadcastState,
          broadcastStream,
          mediaMode,
          pendingBroadcastCandidates,
          peerConnections,
          rtcConfig,
          selectedQuality,
          user,
          viewerCount,
        }),
        playVoiceSound,
        qualityProfiles,
        reportClientError,
        sendBroadcast,
        setState: (next) => {
          if ("broadcastChatMessageIds" in next) broadcastChatMessageIds = next.broadcastChatMessageIds;
          if ("broadcastChatMessages" in next) broadcastChatMessages = next.broadcastChatMessages;
          if ("broadcastError" in next) setBroadcastState({ broadcastError: next.broadcastError });
          if ("broadcastSocket" in next) broadcastSocket = next.broadcastSocket;
          if ("broadcastState" in next) setBroadcastState({ broadcastState: next.broadcastState });
          if ("viewerCount" in next) viewerCount = next.viewerCount;
        },
        tick,
      }));
    }
    return broadcastTransportControllerPromise;
  }
  function clearBroadcastPeerRetry(...args) { void getBroadcastTransportController().then((controller) => controller.clearBroadcastPeerRetry(...args)); }
  async function negotiateBroadcastPeer(...args) { return (await getBroadcastTransportController()).negotiateBroadcastPeer(...args); }
  async function connectBroadcastSocket(...args) { return (await getBroadcastTransportController()).connectBroadcastSocket(...args); }

  let broadcastRelayControllerPromise = null;
  function getBroadcastRelayController() {
    if (!broadcastRelayControllerPromise) {
      broadcastRelayControllerPromise = import("./features/broadcast/relay-controller.js").then(({ createBroadcastRelayController }) => createBroadcastRelayController({
        getState: () => ({ broadcastSocket, broadcastStream, selectedQuality }),
        qualityProfiles,
        reportClientError,
        sendBroadcast,
        setWarning: (message) => { broadcastAudioWarning = message; },
      }));
    }
    return broadcastRelayControllerPromise;
  }
  async function startRelayRecorder(...args) { return (await getBroadcastRelayController()).start(...args); }
  async function stopRelayRecorder(...args) { return (await getBroadcastRelayController()).stop(...args); }
  async function isRelayRecorderActive(...args) { return (await getBroadcastRelayController()).isRecording(...args); }

  let broadcastSetupControllerPromise = null;
  function getBroadcastSetupController() {
    if (!broadcastSetupControllerPromise) {
      broadcastSetupControllerPromise = import("./features/broadcast/setup-controller.js").then(({ createBroadcastSetupController }) => createBroadcastSetupController({
        beginBroadcast,
        getState: () => ({
          broadcastCameraDeviceId,
          broadcastState,
          broadcastTitle,
          publicBroadcastCameraDeviceId,
          publicBroadcastCameraEnabled,
          publicBroadcastMicrophoneEnabled,
          publicBroadcastQuality,
          publicBroadcastReviewSelection,
          publicBroadcastSourceKind,
          publicBroadcastTitle,
          selectedGroupId,
          selectedQuality,
          selectedRoom,
          user,
          view,
          pendingBroadcastSourceType,
        }),
        publicBroadcastSourceLabel,
        setAudioMode: (value) => { audioMode = value; },
        setNavigationState,
        setNotice: (value) => { notice = value; },
        setSelectedQuality: (value) => { selectedQuality = value; },
        setState: setBroadcastState,
      }));
    }
    return broadcastSetupControllerPromise;
  }
  function requestBroadcastStart(...args) { void getBroadcastSetupController().then((controller) => controller.requestBroadcastStart(...args)); }
  function openPublicBroadcastSetup(...args) { void getBroadcastSetupController().then((controller) => controller.openPublicBroadcastSetup(...args)); }
  function cancelPublicBroadcastSetup(...args) { void getBroadcastSetupController().then((controller) => controller.cancelPublicBroadcastSetup(...args)); }
  async function confirmPublicBroadcastSetup(...args) { return (await getBroadcastSetupController()).confirmPublicBroadcastSetup(...args); }
  async function waitForPublicBroadcastReview(...args) { return (await getBroadcastSetupController()).waitForPublicBroadcastReview(...args); }
  function confirmPublicBroadcastReview(...args) { void getBroadcastSetupController().then((controller) => controller.confirmPublicBroadcastReview(...args)); }
  function cancelPublicBroadcastReview(...args) { void getBroadcastSetupController().then((controller) => controller.cancelPublicBroadcastReview(...args)); }

  let broadcastCompositionControllerPromise = null;
  function getBroadcastCompositionController() {
    if (!broadcastCompositionControllerPromise) {
      broadcastCompositionControllerPromise = import("./features/broadcast/composition-controller.js").then(({ createBroadcastCompositionController }) => createBroadcastCompositionController({
        getState: () => ({ broadcastCameraPosition: broadcastStateStore.getState().broadcastCameraPosition, broadcastVideoComposition }),
        mixBroadcastAudio,
        reportClientError,
        setState: (next) => {
          if ("broadcastVideoComposition" in next) broadcastVideoComposition = next.broadcastVideoComposition;
        },
      }));
    }
    return broadcastCompositionControllerPromise;
  }
  async function createBroadcastVideoComposition(...args) { return (await getBroadcastCompositionController()).createBroadcastVideoComposition(...args); }
  function stopBroadcastVideoComposition(...args) { void getBroadcastCompositionController().then((controller) => controller.stopBroadcastVideoComposition(...args)); }
  async function buildBroadcastOutputStream(...args) { return (await getBroadcastCompositionController()).buildBroadcastOutputStream(...args); }

  let broadcastAudioBridgeControllerPromise = null;
  function getBroadcastAudioBridgeController() {
    if (!broadcastAudioBridgeControllerPromise) {
      broadcastAudioBridgeControllerPromise = import("./features/broadcast/audio-bridge-controller.js").then(({ createBroadcastAudioBridgeController }) => createBroadcastAudioBridgeController({
        getAudioContext: () => window.AudioContext || window.webkitAudioContext,
        getDesktopBridge: () => window.miranteDesktop,
      }));
    }
    return broadcastAudioBridgeControllerPromise;
  }
  async function stopWindowAudioBridge(...args) { return (await getBroadcastAudioBridgeController()).stop(...args); }
  async function startWindowAudioBridge(...args) { return (await getBroadcastAudioBridgeController()).startWindowAudio(...args); }
  async function startSystemAudioBridge(...args) { return (await getBroadcastAudioBridgeController()).startSystemAudio(...args); }

  let broadcastCaptureControllerPromise = null;
  function getBroadcastCaptureController() {
    if (!broadcastCaptureControllerPromise) {
      broadcastCaptureControllerPromise = import("./features/broadcast/capture-controller.js").then(({ createBroadcastCaptureController }) => createBroadcastCaptureController({
        getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
        getQualityProfiles: () => qualityProfiles,
        getSelectedVoiceAudioConstraints: () => selectedVoiceAudioConstraints(),
        getState: () => ({
          audioMode,
          broadcastCameraDeviceId,
          broadcastMicrophoneStream,
          broadcastSelectionKind,
          selectedInputDeviceId,
        }),
        getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
        getDesktopBridge: () => window.miranteDesktop,
        loadAudioDevices,
        processVoiceInputStream: (...args) => processVoiceInputStream(...args),
        rememberCapturedInputDevice: (...args) => rememberCapturedInputDevice(...args),
        reportClientError,
        setState: (next) => {
          if ("broadcastMicrophoneStream" in next) broadcastMicrophoneStream = next.broadcastMicrophoneStream;
          if ("displaySourceFilter" in next) displaySourceFilter = next.displaySourceFilter;
          if ("displaySourceSelection" in next) displaySourceSelection = next.displaySourceSelection;
          if ("displaySources" in next) displaySources = next.displaySources;
          if ("notice" in next) notice = next.notice;
          if ("showDisplayPicker" in next) showDisplayPicker = next.showDisplayPicker;
        },
        stopVoiceInputStream: (...args) => stopVoiceInputStream(...args),
      }));
    }
    return broadcastCaptureControllerPromise;
  }
  async function captureBroadcastCameraStream(...args) { return (await getBroadcastCaptureController()).captureBroadcastCameraStream(...args); }
  async function captureBroadcastMicrophoneStream(...args) { return (await getBroadcastCaptureController()).captureBroadcastMicrophoneStream(...args); }
  async function captureDisplayStream(...args) { return (await getBroadcastCaptureController()).captureDisplayStream(...args); }
  async function refreshBroadcastDevices(...args) { return (await getBroadcastCaptureController()).refreshBroadcastDevices(...args); }

  let broadcastAudioMixerControllerPromise = null;
  function getBroadcastAudioMixerController() {
    if (!broadcastAudioMixerControllerPromise) {
      broadcastAudioMixerControllerPromise = import("./features/broadcast/audio-mixer-controller.js").then(({ createBroadcastAudioMixerController }) => createBroadcastAudioMixerController({
        getAudioContext: () => window.AudioContext || window.webkitAudioContext,
        reportClientError,
      }));
    }
    return broadcastAudioMixerControllerPromise;
  }
  async function stopBroadcastAudioMix(...args) { return (await getBroadcastAudioMixerController()).stop(...args); }
  async function mixBroadcastAudio(...args) { return (await getBroadcastAudioMixerController()).mix(...args); }

  const broadcastLifecycleController = createBroadcastLifecycleController({
    api,
    clearBroadcastCaptureRecoveryTimer,
    getState: () => ({
      broadcastCameraStream,
      broadcastCaptureRecoveryTimer,
      broadcastChatDraft,
      broadcastChatMessageIds,
      broadcastChatMessages,
      broadcastDisplayStream,
      broadcastInvite,
      broadcastMicrophoneStream,
      broadcastPeerNegotiations,
      broadcastPeerRetryTimers,
      broadcastRoomId,
      broadcastSelectedSourceName,
      broadcastSelectionKind,
      broadcastSourceType,
      broadcastSourceSwitching,
      broadcastState,
      broadcastStream,
      broadcastStreamId,
      broadcastVideo,
      broadcastSocket,
      mediaMode,
      pendingBroadcastCandidates,
      peerConnections,
      selectedGroupId,
    }),
    loadStreams,
    refreshGroupOverview,
    reportClientError,
    sendBroadcast,
    setNotice: (value) => { notice = value; },
    setState: (next) => {
      if ("broadcastCameraEnabled" in next) setBroadcastState({ broadcastCameraEnabled: next.broadcastCameraEnabled });
      if ("broadcastCaptureRecoveryTimer" in next) broadcastCaptureRecoveryTimer = next.broadcastCaptureRecoveryTimer;
      if ("broadcastChatDraft" in next) broadcastChatDraft = next.broadcastChatDraft;
      if ("broadcastChatMessageIds" in next) broadcastChatMessageIds = next.broadcastChatMessageIds;
      if ("broadcastChatMessages" in next) broadcastChatMessages = next.broadcastChatMessages;
      if ("broadcastDisplayStream" in next) broadcastDisplayStream = next.broadcastDisplayStream;
      if ("broadcastError" in next) setBroadcastState({ broadcastError: next.broadcastError });
      if ("broadcastInvite" in next) setBroadcastState({ broadcastInvite: next.broadcastInvite });
      if ("broadcastMicrophoneStream" in next) broadcastMicrophoneStream = next.broadcastMicrophoneStream;
      if ("broadcastRoomId" in next) setBroadcastState({ broadcastRoomId: next.broadcastRoomId });
      if ("broadcastSelectedSourceName" in next) setBroadcastState({ broadcastSelectedSourceName: next.broadcastSelectedSourceName });
      if ("broadcastSelectionKind" in next) setBroadcastState({ broadcastSelectionKind: next.broadcastSelectionKind });
      if ("broadcastSourceAudioTrack" in next) broadcastSourceAudioTrack = next.broadcastSourceAudioTrack;
      if ("broadcastSourceSwitching" in next) broadcastSourceSwitching = next.broadcastSourceSwitching;
      if ("broadcastState" in next) setBroadcastState({ broadcastState: next.broadcastState });
      if ("broadcastStream" in next) setBroadcastState({ broadcastStream: next.broadcastStream });
      if ("broadcastStreamId" in next) setBroadcastState({ broadcastStreamId: next.broadcastStreamId });
      if ("broadcastSourceType" in next) setBroadcastState({ broadcastSourceType: next.broadcastSourceType });
      if ("broadcastDisplaySurface" in next) setBroadcastState({ broadcastDisplaySurface: next.broadcastDisplaySurface });
      if ("broadcastMediaSwitching" in next) broadcastMediaSwitching = next.broadcastMediaSwitching;
      if ("activeDisplayProcessId" in next) activeDisplayProcessId = next.activeDisplayProcessId;
      if ("broadcastSocket" in next) broadcastSocket = next.broadcastSocket;
      if ("viewerCount" in next) viewerCount = next.viewerCount;
    },
    stopBroadcastAudioMix,
    stopBroadcastVideoComposition,
    stopRelayRecorder,
    stopVoiceInputStream: (...args) => stopVoiceInputStream(...args),
    stopWindowAudioBridge,
  });
  async function stopBroadcast(...args) { return broadcastLifecycleController.stop(...args); }

  let broadcastTrackControllerPromise = null;
  function getBroadcastTrackController() {
    if (!broadcastTrackControllerPromise) {
      broadcastTrackControllerPromise = import("./features/broadcast/track-controller.js").then(({ createBroadcastTrackController }) => createBroadcastTrackController({
        getState: () => ({ mediaMode, peerConnections }),
        negotiateBroadcastPeer,
      }));
    }
    return broadcastTrackControllerPromise;
  }
  async function replaceBroadcastTracks(...args) { return (await getBroadcastTrackController()).replaceBroadcastTracks(...args); }

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

  async function sendFriendRequestFromContext(target) {
    const friendTarget = {
      id: target?.userId || target?.id,
      displayName: target?.displayName || target?.username || "esta pessoa",
    };
    if (!friendTarget.id || friendTarget.id === user?.id) return;
    if (await sendFriendRequest(friendTarget)) closeVoiceContextMenu();
  }

  async function refresh() {
    try {
      await Promise.all([loadGroups(), loadStreams(), loadPreferences(), loadVoiceUserPreferences(), loadNotifications(), loadDirectConversations(), loadSocial()]);
    } catch (error) {
      notice = error.message;
    }
  }

  const updateMaintenanceCountdown = (...args) => maintenanceController.updateCountdown(...args);
  const loadMaintenance = (...args) => maintenanceController.load(...args);

  async function openNotifications() {
    setNavigationState({ view: "notifications" });
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
      setNavigationState({ view: "friends" });
      return;
    }
    if (!notification?.groupId) return;
    await markNotificationRead(notification);
    setGroupState({ selectedGroupId: notification.groupId });
    if (notification.type === "group_join_decision" && notification.joinRequestStatus === "approved") {
      await loadGroups();
    }
    await loadGroup(notification.groupId);
    if (notification.type === "group_join_request") await openSettings("group", "groups");
    else setGroupsView();
  }

  const VOICE_RECONNECT_STORAGE_KEY = "mirante-voice-reconnect";
  const voiceReconnectStorage = createVoiceReconnectStorage({
    key: VOICE_RECONNECT_STORAGE_KEY,
    onError: (kind, error) => reportClientError(kind, error),
  });

  function readVoiceReconnectSession() {
    return voiceReconnectStorage.read();
  }

  function writeVoiceReconnectSession(session, { show = true } = {}) {
    if (!session?.groupId || !session.voiceRoomId) return;
    const next = voiceReconnectStorage.write(session);
    voiceReconnectSession = next;
    voiceReconnectVisible = show;
  }

  function clearVoiceReconnectSession() {
    voiceReconnectSession = null;
    voiceReconnectVisible = false;
    voiceReconnectController.clearTimer();
    voiceReconnectTimer = null;
    voiceReconnectStorage.clear();
  }

  function randomRoom() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function voiceAudioConstraints(...args) { return voiceInputRuntime?.voiceAudioConstraints(...args); }
  function selectedVoiceAudioConstraints(...args) { return voiceInputRuntime?.selectedVoiceAudioConstraints(...args); }
  function rememberCapturedInputDevice(...args) { return voiceInputRuntime?.rememberCapturedInputDevice(...args); }
  function voiceInputStreamMatchesSelectedDevice(...args) { return voiceInputRuntime?.voiceInputStreamMatchesSelectedDevice(...args); }
  function shouldProcessVoiceInput(...args) { return voiceInputRuntime?.shouldProcessVoiceInput(...args); }
  function processVoiceInputStream(...args) { return voiceInputRuntime?.processVoiceInputStream(...args); }
  function stopVoiceInputStream(...args) { return voiceInputRuntime?.stopVoiceInputStream(...args); }
  function updateVoiceMicrophoneGain(...args) { return voiceInputRuntime?.updateVoiceMicrophoneGain(...args); }
  function setVoiceMicrophoneVolume(...args) { return voiceInputRuntime?.setVoiceMicrophoneVolume(...args); }
  function captureVoiceInputStream(...args) { return voiceInputRuntime?.captureVoiceInputStream(...args); }
  function bindVoiceLocalTrack(...args) { return voiceInputRuntime?.bindVoiceLocalTrack(...args); }
  function negotiateVoicePeer(...args) { return voiceInputRuntime?.negotiateVoicePeer(...args); }
  function syncVoiceLocalTrackToPeers(...args) { return voiceInputRuntime?.syncVoiceLocalTrackToPeers(...args); }
  function recoverVoiceInputTrack(...args) { return voiceInputRuntime?.recoverVoiceInputTrack(...args); }
  function reapplyVoiceInputSettings(...args) { return voiceInputRuntime?.reapplyVoiceInputSettings(...args); }

  async function applyVoiceInputProfile(...args) { return (await getSettingsController()).applyVoiceInputProfile(...args); }

  function resetVoiceActivityCalibration() {
    voiceActivityController.resetCalibration();
  }

  function updateVoiceSensitivityAuto(...args) { return getSettingsController().then((controller) => controller.updateVoiceSensitivityAuto(...args)); }
  function updateVoiceSensitivity(...args) { return getSettingsController().then((controller) => controller.updateVoiceSensitivity(...args)); }
  function toggleVoiceAdvanced(...args) { return getSettingsController().then((controller) => controller.toggleVoiceAdvanced(...args)); }
  function updateVoiceAdvancedOption(...args) { return getSettingsController().then((controller) => controller.updateVoiceAdvancedOption(...args)); }
  async function applyVoiceNoiseMode(...args) { return (await getSettingsController()).applyVoiceNoiseMode(...args); }

  const stopVoiceTest = (options) => voiceAudioTestController.stop(options);
  const startVoiceTest = () => voiceAudioTestController.start();
  const testVoiceSpeaker = () => voiceAudioTestController.testSpeaker();

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

  const avatarController = createAvatarController({
    getState: () => ({ maxAvatarFileBytes, avatarFileInput, channelAvatarFileInput, channelGames }),
    setState: (next) => setSettingsState(next),
  });
  const handleAvatarChange = (...args) => avatarController.handleAvatarChange(...args);
  const clearAvatar = (...args) => avatarController.clearAvatar(...args);
  const handleChannelAvatarChange = (...args) => avatarController.handleChannelAvatarChange(...args);
  const clearChannelAvatar = (...args) => avatarController.clearChannelAvatar(...args);
  const toggleChannelGame = (...args) => avatarController.toggleChannelGame(...args);

  async function logout() {
    setSettingsState({ settingsError: "" });
    try {
      if (voiceState === "connected") leaveVoiceRoom();
      if (broadcastState === "live" || broadcastState === "starting") await stopBroadcast("logout");
      await api("/api/auth/logout", { method: "POST" });
      user = null;
      setGroupState({ groups: [], groupOverview: null, selectedGroupId: null, selectedRoomId: null });
      setLiveState({ streams: [], selectedStreams: new Set(), followingOnly: false });
      setNavigationState({ view: "home" });
      replaceBrowserPath("/login", { preserveQuery: false });
      notice = "Você saiu da sua conta.";
    } catch (error) {
      notice = error.message || "Não foi possível sair agora.";
    }
  }

  const groupActionsController = createGroupActionsController({
    getState: () => ({
      selectedGroupId,
      selectedGroup,
      selectedRole,
      selectedRoleId,
      selectedRoomId,
      groupSettingsName,
      groups,
      groupOverview,
      groupRoles,
      rolePermissionOptions,
      newRoleName,
      newRoleColor,
      roleEditName,
      roleEditColor,
      roleEditBusy,
      roleMemberActionId,
      groupInviteCreating,
      groupInviteLink,
      groupInvites,
      groupInviteBusyId,
      groupAdminError,
      groupContextMenu,
      roomContextMenu,
      roomDialogMode,
      editingRoomId,
      roomName,
      roomKind,
      roomMaxParticipants,
      showRoomDialog,
      deleteRoomTarget,
      deleteRoomBusy,
      deleteRoomError,
      showDeleteRoomDialog,
      deleteGroupBusy,
      deleteGroupError,
      showDeleteGroupDialog,
      knownGroupMessageIds,
      voiceState,
      voiceRoomId,
      voiceRooms,
    }),
    setState: (next) => {
      const settingsPatch = {};
      const groupPatch = {};
      const navigationPatch = {};
      for (const key of ["settingsBusy", "settingsError"]) if (key in next) settingsPatch[key] = next[key];
      for (const key of [
        "groups",
        "groupOverview",
        "groupRoles",
        "selectedRoleId",
        "groupInviteLink",
        "groupInvites",
        "groupInviteCreating",
        "groupInviteBusyId",
        "groupAdminError",
        "roleEditBusy",
        "roleEditName",
        "roleEditColor",
        "roleMemberActionId",
        "knownGroupMessageIds",
      ]) if (key in next) groupPatch[key] = next[key];
      for (const key of ["groupSettingsName"]) if (key in next) settingsPatch[key] = next[key];
      for (const key of ["selectedGroupId", "selectedRoomId"]) if (key in next) groupPatch[key] = next[key];
      if ("groupContextMenu" in next) groupContextMenu = next.groupContextMenu;
      if ("roomContextMenu" in next) roomContextMenu = next.roomContextMenu;
      if ("roomDialogMode" in next) roomDialogMode = next.roomDialogMode;
      if ("editingRoomId" in next) editingRoomId = next.editingRoomId;
      if ("roomName" in next) roomName = next.roomName;
      if ("roomKind" in next) roomKind = next.roomKind;
      if ("roomMaxParticipants" in next) roomMaxParticipants = next.roomMaxParticipants;
      if ("showRoomDialog" in next) showRoomDialog = next.showRoomDialog;
      if ("deleteRoomTarget" in next) deleteRoomTarget = next.deleteRoomTarget;
      if ("deleteRoomBusy" in next) deleteRoomBusy = next.deleteRoomBusy;
      if ("deleteRoomError" in next) deleteRoomError = next.deleteRoomError;
      if ("showDeleteRoomDialog" in next) showDeleteRoomDialog = next.showDeleteRoomDialog;
      if ("deleteGroupBusy" in next) deleteGroupBusy = next.deleteGroupBusy;
      if ("deleteGroupError" in next) deleteGroupError = next.deleteGroupError;
      if ("showDeleteGroupDialog" in next) showDeleteGroupDialog = next.showDeleteGroupDialog;
      if ("notice" in next) notice = next.notice;
      if ("view" in next) navigationPatch.view = next.view;
      if (Object.keys(settingsPatch).length) setSettingsState(settingsPatch);
      if (Object.keys(groupPatch).length) setGroupState(groupPatch);
      if (Object.keys(navigationPatch).length) setNavigationState(navigationPatch);
    },
    api,
    copyText,
    loadGroup: (...args) => loadGroup(...args),
    loadGroupAdministration: (...args) => loadGroupAdministration(...args),
    selectRoom: (...args) => selectRoom(...args),
    setGroupsView: (...args) => setGroupsView(...args),
    openInviteDialog: (...args) => openInviteDialog(...args),
    openSettings: (...args) => openSettings(...args),
    openLeaveGroupDialog: (...args) => openLeaveGroupDialog(...args),
    leaveVoiceRoom: (...args) => leaveVoiceRoom(...args),
    closeVoiceContextMenu: (...args) => closeVoiceContextMenu(...args),
    markGroupRoomRead: (...args) => markGroupRoomRead(...args),
    messageBelongsToRoom,
    tick,
    reportClientError,
  });
  const saveGroupSettings = (...args) => groupActionsController.saveGroupSettings(...args);
  const createGroupRole = (...args) => groupActionsController.createGroupRole(...args);
  const assignMemberRole = (...args) => groupActionsController.assignMemberRole(...args);
  const updateRolePermission = (...args) => groupActionsController.updateRolePermission(...args);
  const deleteGroupRole = (...args) => groupActionsController.deleteGroupRole(...args);
  const saveGroupRoleDetails = (...args) => groupActionsController.saveGroupRoleDetails(...args);
  const setRoleMember = (...args) => groupActionsController.setRoleMember(...args);
  const createGroupInvite = (...args) => groupActionsController.createGroupInvite(...args);
  const copyGroupInvite = (...args) => groupActionsController.copyGroupInvite(...args);
  const deleteGroupInvite = (...args) => groupActionsController.deleteGroupInvite(...args);
  const openGroupContextMenu = (...args) => groupActionsController.openGroupContextMenu(...args);
  const closeGroupContextMenu = (...args) => groupActionsController.closeGroupContextMenu(...args);
  const handleGroupContextMenuKeydown = (...args) => groupActionsController.handleGroupContextMenuKeydown(...args);
  const openRoomContextMenu = (...args) => groupActionsController.openRoomContextMenu(...args);
  const closeRoomContextMenu = (...args) => groupActionsController.closeRoomContextMenu(...args);
  const handleRoomContextMenuKeydown = (...args) => groupActionsController.handleRoomContextMenuKeydown(...args);
  const copyRoomLink = (...args) => groupActionsController.copyRoomLink(...args);
  const openRoomForEditing = (...args) => groupActionsController.openRoomForEditing(...args);
  const deleteGroupRoom = (...args) => groupActionsController.deleteGroupRoom(...args);
  const confirmDeleteGroupRoom = (...args) => groupActionsController.confirmDeleteGroupRoom(...args);
  const runRoomContextAction = (...args) => groupActionsController.runRoomContextAction(...args);
  const runGroupContextAction = (...args) => groupActionsController.runGroupContextAction(...args);
  const openDeleteGroupDialog = (...args) => groupActionsController.openDeleteGroupDialog(...args);
  const deleteSelectedGroup = (...args) => groupActionsController.deleteSelectedGroup(...args);

  const broadcastRuntimeController = createBroadcastRuntimeController({
    getState: () => ({
      broadcastAudioWarning,
      broadcastCameraStream,
      broadcastCaptureRecoveryTimer,
      broadcastChatDraft,
      broadcastDisplayStream,
      broadcastRoomId,
      broadcastSourceType,
      broadcastState,
      broadcastStream,
      broadcastStreamId,
      broadcastSocket,
      mediaMode,
    }),
    hasLiveBroadcastCapture,
    reportClientError,
    setState: (next) => {
      if ("broadcastAudioWarning" in next) broadcastAudioWarning = next.broadcastAudioWarning;
      if ("broadcastCaptureRecoveryTimer" in next) broadcastCaptureRecoveryTimer = next.broadcastCaptureRecoveryTimer;
      if ("broadcastChatDraft" in next) broadcastChatDraft = next.broadcastChatDraft;
    },
    stopBroadcast,
  });
  function sendBroadcast(...args) { return broadcastRuntimeController.sendBroadcast(...args); }
  function clearBroadcastCaptureRecoveryTimer(...args) { return broadcastRuntimeController.clearBroadcastCaptureRecoveryTimer(...args); }
  function handleBroadcastVideoTrackEnded(...args) { return broadcastRuntimeController.handleBroadcastVideoTrackEnded(...args); }
  function sendBroadcastChatMessage(...args) { return broadcastRuntimeController.sendBroadcastChatMessage(...args); }

  const voiceSignalingController = createVoiceSignalingController({
    getState: () => ({ voiceClientId, voiceError, voiceParticipants, voicePeerConnections, voicePendingCandidates, voicePendingSignals, voiceRoomId, voiceSignalQueues: voiceSignalingControllerQueues, voiceState }),
    setState: (next) => {
      if ("voiceError" in next) voiceError = next.voiceError;
    },
    createPeer: (participantId) => createVoicePeer(participantId),
    closePeer: (participantId) => closeVoicePeer(participantId),
    sendVoice,
    reportClientError,
  });
  const voiceSignalingControllerQueues = new Map();

  const voiceParticipantStateController = createVoiceParticipantStateController({
    getState: () => ({
      groupOverview,
      voiceRoomId,
      voiceState,
      voiceParticipants,
      currentUserId: user?.id || null,
      currentUserDisplayName: user?.displayName || "",
      currentUserUsername: user?.username || "",
    }),
    setGroupState,
  });
  function updateVoiceRoomSnapshot(...args) { return voiceParticipantStateController.updateRoomSnapshot(...args); }
  function uniqueVoiceParticipants(...args) { return voiceParticipantStateController.uniqueParticipants(...args); }
  function replaceVoiceRoomSnapshot(...args) { return voiceParticipantStateController.replaceRoomSnapshot(...args); }
  function upsertVoiceRoomParticipant(...args) { return voiceParticipantStateController.upsertRoomParticipant(...args); }
  function removeVoiceRoomParticipant(...args) { return voiceParticipantStateController.removeRoomParticipant(...args); }
  function mergeActiveVoicePresence(...args) { return voiceParticipantStateController.mergeActivePresence(...args); }
  function visibleVoiceParticipants(...args) { return voiceParticipantStateController.visibleParticipants(...args); }
  function voiceParticipantDisplayName(...args) { return voiceParticipantStateController.participantDisplayName(...args); }

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
    return hasTurnServer(rtcConfig);
  }

  function stopVoicePeerHealthTimer() {
    voicePeerHealthController.stop();
    voiceQualityController.stop();
  }

  function closeGroupThread() {
    setMessageState({ activeGroupThread: null, groupThreadMessages: [], groupThreadDraft: "", groupThreadError: "" });
  }

  function updateGroupThreadDraft(value) {
    setMessageState({ groupThreadDraft: value });
  }

  function ensureVoicePeerHealthTimer() {
    voicePeerHealthController.start();
    voiceQualityController.start();
  }

  function voicePeerShouldInitiate(participantId) {
    return shouldInitiateVoicePeer(voiceClientId, participantId);
  }

  function closeVoicePeer(participantId) {
    const connectionTimer = voicePeerConnectionTimers.get(participantId);
    if (connectionTimer) clearTimeout(connectionTimer);
    voicePeerConnectionTimers.delete(participantId);
    const audioTrackTimer = voicePeerAudioTrackTimers.get(participantId);
    if (audioTrackTimer) clearTimeout(audioTrackTimer);
    voicePeerAudioTrackTimers.delete(participantId);
    voicePeerNegotiationInFlight.delete(participantId);
    voiceRemotePlaybackController.remove(participantId);
    voicePeerConnections.get(participantId)?.close();
    voicePeerConnections.delete(participantId);
    voicePendingCandidates.delete(participantId);
    voiceSignalingController.clearParticipant(participantId);
    voicePeerRecoveryController.clearParticipant(participantId);
    voicePendingSignals.delete(participantId);
    voicePeerAudioHealth.delete(participantId);
    voicePeerRelayRecoveryAttempted.delete(participantId);
    clearVoiceActivityAnalyzer(participantId);
    const remoteStream = voiceRemoteStreams.get(participantId);
    remoteStream?.getTracks?.().forEach((track) => {
      try { remoteStream.removeTrack(track); } catch {}
    });
    voiceRemoteStreams.delete(participantId);
    if (!voicePeerAudioHealth.size) stopVoicePeerHealthTimer();
  }

  const updateVoicePlaybackState = () => voiceRemotePlaybackController.updatePlaybackState();
  const scheduleVoiceRemotePlayback = (participantId, delayMs = VOICE_REMOTE_PLAYBACK_RETRY_MS) => voiceRemotePlaybackController.schedule(participantId, delayMs);
  const ensureVoiceRemoteAudio = (participantId) => voiceRemotePlaybackController.ensure(participantId);

  function ensureVoiceRemoteStream(participantId) {
    const current = voiceRemoteStreams.get(participantId);
    if (current?.getAudioTracks?.().some((track) => track.readyState === "live")) return current;
    const stream = new MediaStream();
    voiceRemoteStreams.set(participantId, stream);
    return stream;
  }

  const playVoiceRemoteAudio = (participantId, audio) => voiceRemotePlaybackController.play(participantId, audio);

  const resumeVoiceRemoteAudio = () => voiceRemotePlaybackController.resume();

  function handleVoicePlaybackInteraction() {
    if (voiceRemoteAudio.size) resumeVoiceRemoteAudio();
    voiceSoundController.resumePendingNotificationSound();
  }

  const syncVoiceParticipantSpeakingState = (...args) => voiceActivityRuntime.syncVoiceParticipantSpeakingState(...args);
  const markVoiceParticipantSpeaking = (...args) => voiceActivityRuntime.markVoiceParticipantSpeaking(...args);
  const isVoiceParticipantSpeaking = (...args) => voiceActivityRuntime.isVoiceParticipantSpeaking(...args);
  const clearVoiceActivityAnalyzer = (...args) => voiceActivityRuntime.clearVoiceActivityAnalyzer(...args);

  function scheduleVoicePeerRecovery(...args) {
    return voicePeerRecoveryController.schedule(...args);
  }

  function recoverVoicePeer(...args) {
    return voicePeerRecoveryController.recover(...args);
  }

  const ensureVoiceActivityTimer = (...args) => voiceActivityRuntime.ensureVoiceActivityTimer(...args);
  const clearVoiceSpeakingPublishTimer = (...args) => voiceActivityRuntime.clearVoiceSpeakingPublishTimer(...args);
  const attachVoiceActivityStream = (...args) => voiceActivityRuntime.attachVoiceActivityStream(...args);
  const attachVoiceActivityDetector = (...args) => voiceActivityRuntime.attachVoiceActivityDetector(...args);

  function handleVoiceSoundEffectsChange(event) {
    updateSoundPreference("enabled", event.currentTarget.checked);
  }

  function handleSoundPreferenceChange(event, key) {
    updateSoundPreference(key, event.currentTarget.checked);
  }

  function handleSoundVolumeChange(event) {
    updateSoundPreference("volume", Math.min(1, Math.max(0, Number(event.currentTarget.value) / 100)));
  }

  const voiceContextMenuRuntime = createVoiceContextMenuRuntime({
    getState: () => ({
      voiceRoomId,
      activeVoiceRoom,
      selectedRoom,
      voiceParticipants,
      voiceRooms,
      textRooms,
      groupMembers,
      messageDraft,
      canMoveVoiceMembers,
      voiceContextMenu,
      profilePreview,
      draggedVoiceParticipantId,
      voiceDropRoomId,
    }),
    setState: (next) => {
      if ("voiceContextMenu" in next) voiceContextMenu = next.voiceContextMenu;
      if ("profilePreview" in next) profilePreview = next.profilePreview;
      if ("draggedVoiceParticipantId" in next) draggedVoiceParticipantId = next.draggedVoiceParticipantId;
      if ("voiceDropRoomId" in next) voiceDropRoomId = next.voiceDropRoomId;
    },
    setGroupState,
    setMessageState,
    visibleVoiceParticipants,
    voiceParticipantDisplayName,
    openRoomContextMenu,
    setVoiceVolumePreference: setVoiceParticipantVolumePreference,
    isVoiceParticipantLocallyMutedPreference,
    toggleVoiceParticipantLocalMutePreference,
    toggleVoiceMute: (...args) => toggleVoiceMute(...args),
    leaveVoiceRoom: (...args) => leaveVoiceRoom(...args),
    sendVoice,
    tick,
  });
  const {
    openUserContextMenu,
    openVoiceContextMenu,
    closeVoiceContextMenu,
    handleVoiceContextMenuKeydown,
    handleGlobalVoiceContextMenu,
    handleGlobalRoomContextMenu,
    handleGlobalUserClick,
    showVoiceProfile,
    mentionVoiceParticipant,
    setVoiceVolume,
    isVoiceParticipantLocallyMuted,
    toggleVoiceParticipantLocalMute,
    toggleContextParticipantServerMute,
    disconnectContextParticipant,
    moveContextParticipant,
    handleVoiceDragStart,
    handleVoiceDragEnd,
    handleVoiceDragOver,
    handleVoiceDragLeave,
    handleVoiceDrop,
  } = voiceContextMenuRuntime;

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

  function createVoicePeer(...args) {
    return voicePeerController?.createPeer(...args) || null;
  }
  function handleVoiceSignal(message) {
    return voiceSignalingController.handleSignal(message);
  }

  function enqueueVoiceSignal(message) {
    return voiceSignalingController.enqueueSignal(message);
  }

  const voiceSocketController = createVoiceSocketController({
    getRoomId: () => voiceRoomId,
    getSocket: () => voiceSocket,
    setSocket: (socket) => { voiceSocket = socket; },
    onMessage: (event, socket) => handleVoiceSocketMessage(event, socket),
    onClosed: (event, socket) => handleVoiceSocketClosed(event, socket),
    reportClientError,
  });

  function sendVoice(message) {
    return voiceSocketController.send(message);
  }

  function setVoiceRuntimeState(next) {
    if ("voiceClientId" in next) voiceClientId = next.voiceClientId;
    if ("voiceLocalStream" in next) voiceLocalStream = next.voiceLocalStream;
    if ("voiceMuted" in next) voiceMuted = next.voiceMuted;
    if ("voiceServerMuted" in next) voiceServerMuted = next.voiceServerMuted;
    if ("voiceDeafened" in next) voiceDeafened = next.voiceDeafened;
    if ("voiceParticipants" in next) voiceParticipants = next.voiceParticipants;
    if ("voiceState" in next) voiceState = next.voiceState;
    if ("voiceError" in next) voiceError = next.voiceError;
    if ("voiceRoomId" in next) voiceRoomId = next.voiceRoomId;
    if ("voiceSpeakingSignalKnownParticipantIds" in next) voiceSpeakingSignalKnownParticipantIds = next.voiceSpeakingSignalKnownParticipantIds;
  }

  const voiceMessageController = createVoiceMessageController({
    getState: () => ({
      voiceClientId,
      voiceLocalStream,
      voiceMuted,
      voiceServerMuted,
      voiceDeafened,
      voiceParticipants,
      voiceState,
      voiceError,
      voiceRoomId,
      voiceSpeakingSignalKnownParticipantIds,
      voicePeerConnections,
      voicePendingSignals,
      user,
      selectedGroupId,
      selectedGroup,
      selectedRoom,
    }),
    setState: setVoiceRuntimeState,
    uniqueParticipants: (...args) => uniqueVoiceParticipants(...args),
    writeReconnectSession: (...args) => writeVoiceReconnectSession(...args),
    attachVoiceActivityStream: (...args) => attachVoiceActivityStream(...args),
    replaceRoomSnapshot: (...args) => replaceVoiceRoomSnapshot(...args),
    upsertRoomParticipant: (...args) => upsertVoiceRoomParticipant(...args),
    removeRoomParticipant: (...args) => removeVoiceRoomParticipant(...args),
    markParticipantSpeaking: (...args) => markVoiceParticipantSpeaking(...args),
    clearVoiceActivityAnalyzer: (...args) => clearVoiceActivityAnalyzer(...args),
    createPeer: (...args) => createVoicePeer(...args),
    shouldInitiatePeer: (...args) => voicePeerShouldInitiate(...args),
    closePeer: (...args) => closeVoicePeer(...args),
    syncLocalTrackToPeers: (...args) => syncVoiceLocalTrackToPeers(...args),
    enqueueSignal: (...args) => enqueueVoiceSignal(...args),
    sendVoice,
    leaveVoiceRoom: (...args) => leaveVoiceRoom(...args),
    refreshGroupOverview: (...args) => refreshGroupOverview(...args),
    schedulePeerRecovery: (...args) => scheduleVoicePeerRecovery(...args),
    playVoiceSound: (...args) => playVoiceSound(...args),
    setGroupState,
  });

  async function handleVoiceSocketMessage(event, socket) {
    if (voiceSocket !== socket || typeof event.data !== "string") return;
    try {
      const message = JSON.parse(event.data);
      if (!acceptGatewayMessage(socket, message)) return;
      await voiceMessageController.handle(message);
    } catch (caught) {
      reportClientError("voice_message_error", caught, { roomId: voiceRoomId });
      voiceError = "A sinalização da sala de voz retornou uma mensagem inválida.";
    }
  }


  function handleVoiceSocketClosed(event, socket) {
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
  }

  function connectVoiceSocket() {
    return voiceSocketController.connect();
  }

  const voiceReconnectController = createVoiceReconnectController({
    getState: () => ({
      voiceReconnectTimer,
      voiceReconnectBusy,
      voiceReconnectSession,
      voiceReconnectVisible,
      voiceState,
      voiceRoomId,
      voiceError,
      user,
      selectedGroupId,
      selectedGroup,
      selectedRoom,
      activeVoiceRoom,
      groupOverview,
    }),
    setState: (next) => {
      if ("voiceReconnectTimer" in next) voiceReconnectTimer = next.voiceReconnectTimer;
      if ("voiceReconnectBusy" in next) voiceReconnectBusy = next.voiceReconnectBusy;
      if ("voiceReconnectVisible" in next) voiceReconnectVisible = next.voiceReconnectVisible;
      if ("voiceError" in next) voiceError = next.voiceError;
    },
    setGroupsView,
    loadGroup,
    getGroupOverview: () => groupOverview,
    setGroupState,
    tick,
    joinVoiceRoom: (...args) => joinVoiceRoom(...args),
    leaveVoiceRoom: (...args) => leaveVoiceRoom(...args),
    writeReconnectSession: (session, options) => writeVoiceReconnectSession(session, options),
    clearReconnectSession: clearVoiceReconnectSession,
    reportClientError,
  });
  const scheduleVoiceReconnect = (...args) => voiceReconnectController.schedule(...args);
  const reconnectSavedVoiceRoom = (...args) => voiceReconnectController.reconnect(...args);
  const handleVoiceNetworkOffline = () => voiceReconnectController.handleOffline();
  const handleVoiceNetworkOnline = () => voiceReconnectController.handleOnline();

  async function handleVoiceDeviceChange() {
    const hadSelectedInput = Boolean(selectedInputDeviceId);
    await loadAudioDevices(false);
    const localTrack = voiceLocalStream?.getAudioTracks?.()[0];
    const selectedInputWasRemoved = hadSelectedInput && !selectedInputDeviceId;
    if (voiceState === "connected" && (selectedInputWasRemoved || !localTrack || localTrack.readyState !== "live")) {
      await recoverVoiceInputTrack(selectedInputWasRemoved ? "selected_device_removed" : "device_change");
    }
  }

  const voiceRoomController = createVoiceRoomController({
    getState: () => ({
      selectedRoom,
      selectedGroupId,
      selectedInputDeviceId,
      user,
      voiceClientId,
      voiceDeafened,
      voiceError,
      voiceLocalStream,
      voiceMuted,
      voiceMutedByCaptureFailure,
      voiceParticipants,
      voicePeerConnections,
      voicePeerAudioHealth,
      voicePeerRelayRecoveryAttempted,
      voicePlaybackBlocked,
      voiceReconnectSession,
      voiceRemoteAudio,
      voiceRoomId,
      voiceServerMuted,
      voiceSpeakingSignalKnownParticipantIds,
      voiceState,
    }),
    setState: (next) => {
      if ("settingsSection" in next) setSettingsState({ settingsSection: next.settingsSection });
      for (const key of [
        "voiceClientId",
        "voiceDeafened",
        "voiceError",
        "voiceLocalStream",
        "voiceMuted",
        "voiceMutedByCaptureFailure",
        "voiceParticipants",
        "voicePlaybackBlocked",
        "voiceRoomId",
        "voiceServerMuted",
        "voiceSpeakingSignalKnownParticipantIds",
        "voiceState",
      ]) {
        if (key in next) {
          if (key === "voiceClientId") voiceClientId = next[key];
          if (key === "voiceDeafened") voiceDeafened = next[key];
          if (key === "voiceError") voiceError = next[key];
          if (key === "voiceLocalStream") voiceLocalStream = next[key];
          if (key === "voiceMuted") voiceMuted = next[key];
          if (key === "voiceMutedByCaptureFailure") voiceMutedByCaptureFailure = next[key];
          if (key === "voiceParticipants") voiceParticipants = next[key];
          if (key === "voicePlaybackBlocked") voicePlaybackBlocked = next[key];
          if (key === "voiceRoomId") voiceRoomId = next[key];
          if (key === "voiceServerMuted") voiceServerMuted = next[key];
          if (key === "voiceSpeakingSignalKnownParticipantIds") voiceSpeakingSignalKnownParticipantIds = next[key];
          if (key === "voiceState") voiceState = next[key];
        }
      }
      if ("speakingVoiceParticipantIds" in next) speakingVoiceParticipantIds = next.speakingVoiceParticipantIds;
    },
    refreshIceConfiguration: (...args) => refreshIceConfigurationIfNeeded(...args),
    connectSocket: (...args) => connectVoiceSocket(...args),
    closeSocket: (...args) => voiceSocketController.close(...args),
    getVoiceSoundContext: (...args) => getVoiceSoundContext(...args),
    captureVoiceInputStream: (...args) => captureVoiceInputStream(...args),
    inputStreamMatchesSelectedDevice: (...args) => voiceInputStreamMatchesSelectedDevice(...args),
    stopVoiceInputStream: (...args) => stopVoiceInputStream(...args),
    bindVoiceLocalTrack: (...args) => bindVoiceLocalTrack(...args),
    sendVoice: (...args) => sendVoice(...args),
    upsertVoiceRoomParticipant: (...args) => upsertVoiceRoomParticipant(...args),
    removeVoiceRoomParticipant: (...args) => removeVoiceRoomParticipant(...args),
    closeVoicePeer: (...args) => closeVoicePeer(...args),
    clearPeerRecovery: () => voicePeerRecoveryController.clearAll(),
    clearVoiceActivityAnalyzer: (...args) => clearVoiceActivityAnalyzer(...args),
    resetVoiceActivity: () => voiceActivityController.reset(),
    clearVoicePeerHealth: () => voicePeerAudioHealth.clear(),
    clearVoicePeerRelayRecovery: () => voicePeerRelayRecoveryAttempted.clear(),
    clearVoiceSignalingQueues: () => voiceSignalingControllerQueues.clear(),
    clearVoicePendingSignals: () => voicePendingSignals.clear(),
    stopVoicePeerHealthTimer: () => stopVoicePeerHealthTimer(),
    clearReconnectSession: () => clearVoiceReconnectSession(),
    clearSpeakingPublishTimer: () => clearVoiceSpeakingPublishTimer(),
    releasePushToTalk: () => releasePushToTalk(),
    resumeVoiceRemoteAudio: () => resumeVoiceRemoteAudio(),
    isLocallyMuted: (participantId) => voiceLocallyMutedParticipants.has(participantId),
    voicePreferenceTargetId: (...args) => voicePreferenceTargetId(...args),
    playVoiceSound: (...args) => playVoiceSound(...args),
    openSettings: (...args) => openSettings(...args),
    loadAudioDevices: (...args) => loadAudioDevices(...args),
    reportClientError,
  });
  const joinVoiceRoom = (...args) => voiceRoomController.joinVoiceRoom(...args);
  const leaveVoiceRoom = (...args) => voiceRoomController.leaveVoiceRoom(...args);
  const toggleVoiceMute = (...args) => voiceRoomController.toggleVoiceMute(...args);
  const setVoiceMuted = (...args) => voiceRoomController.setVoiceMuted(...args);
  const toggleVoiceDeafen = (...args) => voiceRoomController.toggleVoiceDeafen(...args);
  const openVoiceSettings = (...args) => voiceRoomController.openVoiceSettings(...args);

  const voiceLiveController = createVoiceLiveController({
    getStreams: () => groupLiveStreams,
    getUserId: () => user?.id,
    setWatchingStream: (streamId) => setGroupState({ watchingGroupLiveStreamId: streamId }),
  });
  const watchSelectedRoomLive = (streamId = selectedRoomLiveStream?.id) => voiceLiveController.watchSelectedRoomLive(streamId);
  const closeSelectedRoomLive = () => voiceLiveController.closeSelectedRoomLive();
  const privateLiveForParticipant = (...args) => voiceLiveController.privateLiveForParticipant(...args);

  const broadcastPreviewController = createBroadcastPreviewController({
    tick,
    getVideo: () => broadcastVideo,
    getState: () => ({
      activeDisplayProcessId,
      broadcastCameraStream,
      broadcastDisplayStream,
      broadcastMicrophoneStream,
      broadcastRoomId,
      broadcastState,
      broadcastStream,
      selectedQuality,
    }),
    setState: (next) => {
      if ("broadcastAudioWarning" in next) broadcastAudioWarning = next.broadcastAudioWarning;
    },
    setBroadcastState,
    buildOutputStream: (...args) => buildBroadcastOutputStream(...args),
    replaceTracks: (...args) => replaceBroadcastTracks(...args),
    stopWindowAudioBridge: (...args) => stopWindowAudioBridge(...args),
    reportClientError,
    setNotice: (value) => { notice = value; },
    qualityProfiles,
  });
  const attachBroadcastPreview = (...args) => broadcastPreviewController.attachPreview(...args);
  const handleWindowAudioStatus = (...args) => broadcastPreviewController.handleWindowAudioStatus(...args);


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

  let broadcastStartControllerPromise = null;
  function getBroadcastStartController() {
    if (!broadcastStartControllerPromise) {
      broadcastStartControllerPromise = import("./features/broadcast/start-controller.js").then(({ createBroadcastStartController }) => createBroadcastStartController({
        api,
        attachBroadcastPreview,
        buildBroadcastOutputStream,
        captureBroadcastCameraStream,
        captureBroadcastMicrophoneStream,
        captureDisplayStream,
        connectBroadcastSocket,
        formatBroadcastCaptureError,
        formatBroadcastMissingAudio,
        getState: () => ({
          activeDisplayProcessId,
          audioMode,
          broadcastAudioProcessId,
          broadcastAudioSourceName,
          broadcastAudioWarning,
          broadcastCameraDeviceId,
          broadcastCameraEnabled,
          broadcastCameraStream,
          broadcastChatDraft,
          broadcastChatMessageIds,
          broadcastChatMessages,
          broadcastDisplaySurface,
          broadcastDisplayStream,
          broadcastMicrophoneEnabled,
          broadcastMicrophoneStream,
          broadcastRoomId,
          broadcastSelectionKind,
          broadcastSocket,
          broadcastSourceAudioTrack,
          broadcastState,
          broadcastStream,
          broadcastStreamId,
          broadcastTitle,
          broadcastError,
          displaySources,
          isDesktop,
          mediaMode,
          qualityProfiles,
          returnToBroadcast,
          selectedDisplayProcessId,
          selectedInputDeviceId,
          selectedQuality,
          selectedRoomId,
          showDisplayPicker,
          user,
        }),
        handleBroadcastVideoTrackEnded,
        loadGroup,
        loadStreams,
        randomRoom,
        reportClientError,
        requestBroadcastAudioSource,
        sendBroadcast,
        setGroupState,
        setNavigationState,
        setNotice: (value) => { notice = value; },
        setState: (next) => {
          if ("activeDisplayProcessId" in next) activeDisplayProcessId = next.activeDisplayProcessId;
          if ("audioMode" in next) audioMode = next.audioMode;
          if ("broadcastAudioProcessId" in next) broadcastAudioProcessId = next.broadcastAudioProcessId;
          if ("broadcastAudioSourceName" in next) broadcastAudioSourceName = next.broadcastAudioSourceName;
          if ("broadcastAudioWarning" in next) broadcastAudioWarning = next.broadcastAudioWarning;
          if ("broadcastCameraStream" in next) broadcastCameraStream = next.broadcastCameraStream;
          if ("broadcastChatDraft" in next) broadcastChatDraft = next.broadcastChatDraft;
          if ("broadcastChatMessageIds" in next) broadcastChatMessageIds = next.broadcastChatMessageIds;
          if ("broadcastChatMessages" in next) broadcastChatMessages = next.broadcastChatMessages;
          if ("broadcastDisplayStream" in next) broadcastDisplayStream = next.broadcastDisplayStream;
          if ("broadcastMicrophoneStream" in next) broadcastMicrophoneStream = next.broadcastMicrophoneStream;
          if ("broadcastSocket" in next) broadcastSocket = next.broadcastSocket;
          if ("broadcastSourceAudioTrack" in next) broadcastSourceAudioTrack = next.broadcastSourceAudioTrack;
          if ("displaySources" in next) displaySources = next.displaySources;
          if ("selectedDisplayProcessId" in next) selectedDisplayProcessId = next.selectedDisplayProcessId;
          if ("showDisplayPicker" in next) showDisplayPicker = next.showDisplayPicker;
          if ("broadcastError" in next) setBroadcastState({ broadcastError: next.broadcastError });
          if ("broadcastInvite" in next) setBroadcastState({ broadcastInvite: next.broadcastInvite });
          if ("broadcastRoomId" in next) setBroadcastState({ broadcastRoomId: next.broadcastRoomId });
          if ("broadcastSourceType" in next) setBroadcastState({ broadcastSourceType: next.broadcastSourceType });
          if ("broadcastState" in next) setBroadcastState({ broadcastState: next.broadcastState });
          if ("broadcastStream" in next) setBroadcastState({ broadcastStream: next.broadcastStream });
          if ("broadcastStreamId" in next) setBroadcastState({ broadcastStreamId: next.broadcastStreamId });
          if ("broadcastTitle" in next) setBroadcastState({ broadcastTitle: next.broadcastTitle });
          if ("broadcastCameraEnabled" in next) setBroadcastState({ broadcastCameraEnabled: next.broadcastCameraEnabled });
          if ("broadcastDisplaySurface" in next) setBroadcastState({ broadcastDisplaySurface: next.broadcastDisplaySurface });
          if ("pendingBroadcastContext" in next) setBroadcastState({ pendingBroadcastContext: next.pendingBroadcastContext });
        },
        startRelayRecorder,
        startSystemAudioBridge,
        startWindowAudioBridge,
        stopBroadcastAudioMix,
        stopBroadcastVideoComposition,
        stopRelayRecorder,
        stopVoiceInputStream,
        stopWindowAudioBridge,
        waitForPublicBroadcastReview,
      }));
    }
    return broadcastStartControllerPromise;
  }
  async function beginBroadcast(...args) { return (await getBroadcastStartController()).begin(...args); }

  function requestCameraBroadcastStart() {
    requestBroadcastStart("camera");
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
      const nextGroups = groups.filter((group) => group.id !== selectedGroupId);
      setGroupState({ groups: nextGroups, groupOverview: null, selectedRoomId: null, selectedGroupId: nextGroups[0]?.id || null });
      showLeaveGroupDialog = false;
      if (selectedGroupId) await loadGroup(selectedGroupId);
      else setNavigationState({ view: "home" });
      notice = `Você saiu de ${leavingGroupName}.`;
    } catch (error) {
      leaveGroupError = error.message || "Não foi possível sair do grupo agora.";
    } finally {
      leaveGroupBusy = false;
    }
  }

  const broadcastSourceController = createBroadcastSourceController({
    getState: () => ({
      activeDisplayProcessId,
      broadcastCameraDeviceId,
      broadcastCameraEnabled,
      broadcastCameraPosition,
      broadcastCameraStream,
      broadcastDisplayStream,
      broadcastMicrophoneEnabled,
      broadcastMicrophoneStream,
      broadcastMediaSwitching,
      broadcastSourceAudioTrack,
      broadcastSourceType,
      broadcastState,
      broadcastStream,
      broadcastVideoComposition,
      mediaMode,
      selectedInputDeviceId,
      selectedQuality,
    }),
    setState: (next) => {
      if ("activeDisplayProcessId" in next) activeDisplayProcessId = next.activeDisplayProcessId;
      if ("broadcastCameraStream" in next) broadcastCameraStream = next.broadcastCameraStream;
      if ("broadcastMediaSwitching" in next) broadcastMediaSwitching = next.broadcastMediaSwitching;
      if ("broadcastMicrophoneStream" in next) broadcastMicrophoneStream = next.broadcastMicrophoneStream;
      if ("broadcastSourceAudioTrack" in next) broadcastSourceAudioTrack = next.broadcastSourceAudioTrack;
      if ("selectedInputDeviceId" in next) selectedInputDeviceId = next.selectedInputDeviceId;
      const broadcastPatch = {};
      for (const key of ["broadcastError", "broadcastStream", "broadcastCameraDeviceId", "broadcastCameraEnabled", "broadcastCameraPosition", "broadcastMicrophoneEnabled"]) {
        if (key in next) broadcastPatch[key] = next[key];
      }
      if (Object.keys(broadcastPatch).length) setBroadcastState(broadcastPatch);
    },
    buildOutputStream: (...args) => buildBroadcastOutputStream(...args),
    replaceTracks: (...args) => replaceBroadcastTracks(...args),
    attachPreview: (...args) => attachBroadcastPreview(...args),
    captureCamera: (...args) => captureBroadcastCameraStream(...args),
    captureMicrophone: (...args) => captureBroadcastMicrophoneStream(...args),
    stopMicrophone: (stream) => stopVoiceInputStream(stream),
    stopComposition: () => stopBroadcastVideoComposition(),
    isRelayActive: (...args) => isRelayRecorderActive(...args),
    stopRelay: (...args) => stopRelayRecorder(...args),
    startRelay: (...args) => startRelayRecorder(...args),
    qualityProfiles,
    reportClientError,
    setNotice: (value) => { notice = value; },
  });
  const rebuildBroadcastOutput = (...args) => broadcastSourceController.rebuildOutput(...args);
  const handleBroadcastCameraChange = (...args) => broadcastSourceController.handleCameraChange(...args);
  const handleBroadcastCameraToggle = (...args) => broadcastSourceController.handleCameraToggle(...args);
  const handleBroadcastCameraPositionChange = (...args) => broadcastSourceController.handleCameraPositionChange(...args);
  const handleBroadcastMicrophoneChange = (...args) => broadcastSourceController.handleMicrophoneChange(...args);


  const broadcastAudioModeController = createBroadcastAudioModeController({
    getState: () => ({
      activeDisplayProcessId,
      audioMode,
      broadcastAudioProcessId,
      broadcastAudioSourceName,
      broadcastAudioWarning,
      broadcastDisplaySurface,
      broadcastDisplayStream,
      broadcastMediaSwitching,
      broadcastSelectionKind,
      broadcastSourceType,
      broadcastSourceSwitching,
      broadcastState,
      isDesktop,
      broadcastError,
    }),
    setState: (next) => {
      if ("audioMode" in next) audioMode = next.audioMode;
      if ("broadcastAudioProcessId" in next) broadcastAudioProcessId = next.broadcastAudioProcessId;
      if ("broadcastAudioSourceName" in next) broadcastAudioSourceName = next.broadcastAudioSourceName;
      if ("broadcastAudioWarning" in next) broadcastAudioWarning = next.broadcastAudioWarning;
      const broadcastPatch = {};
      for (const key of ["broadcastError"]) if (key in next) broadcastPatch[key] = next[key];
      if (Object.keys(broadcastPatch).length) setBroadcastState(broadcastPatch);
    },
    stopWindowAudioBridge: (...args) => stopWindowAudioBridge(...args),
    requestBroadcastAudioSource: (...args) => requestBroadcastAudioSource(...args),
    startWindowAudioBridge: (...args) => startWindowAudioBridge(...args),
    startSystemAudioBridge: (...args) => startSystemAudioBridge(...args),
    rebuildOutput: (...args) => rebuildBroadcastOutput(...args),
    formatMissingAudio: (...args) => formatBroadcastMissingAudio(...args),
    reportClientError,
    setNotice: (value) => { notice = value; },
  });
  const applyLiveBroadcastAudioMode = (...args) => broadcastAudioModeController.apply(...args);
  const handleBroadcastAudioModeChange = (...args) => broadcastAudioModeController.handleChange(...args);


  const broadcastSwitchController = createBroadcastSwitchController({
    getState: () => ({
      activeDisplayProcessId,
      audioMode,
      broadcastAudioProcessId,
      broadcastAudioSourceName,
      broadcastCameraStream,
      broadcastDisplayStream,
      broadcastMicrophoneStream,
      broadcastSelectionKind,
      broadcastSourceAudioTrack,
      broadcastSourceType,
      broadcastSourceSwitching,
      broadcastState,
      broadcastStream,
      isDesktop,
      mediaMode,
      selectedDisplayProcessId,
      selectedQuality,
    }),
    setState: (next) => {
      if ("activeDisplayProcessId" in next) activeDisplayProcessId = next.activeDisplayProcessId;
      if ("audioMode" in next) audioMode = next.audioMode;
      if ("broadcastAudioProcessId" in next) broadcastAudioProcessId = next.broadcastAudioProcessId;
      if ("broadcastAudioSourceName" in next) broadcastAudioSourceName = next.broadcastAudioSourceName;
      if ("broadcastAudioWarning" in next) broadcastAudioWarning = next.broadcastAudioWarning;
      if ("broadcastDisplayStream" in next) broadcastDisplayStream = next.broadcastDisplayStream;
      if ("broadcastSourceAudioTrack" in next) broadcastSourceAudioTrack = next.broadcastSourceAudioTrack;
      if ("broadcastSourceSwitching" in next) broadcastSourceSwitching = next.broadcastSourceSwitching;
      if ("showDisplayPicker" in next) showDisplayPicker = next.showDisplayPicker;
      if ("displaySources" in next) displaySources = next.displaySources;
      if ("selectedDisplayProcessId" in next) selectedDisplayProcessId = next.selectedDisplayProcessId;
      const broadcastPatch = {};
      for (const key of ["broadcastError", "broadcastStream", "broadcastDisplaySurface"]) {
        if (key in next) broadcastPatch[key] = next[key];
      }
      if (Object.keys(broadcastPatch).length) setBroadcastState(broadcastPatch);
    },
    captureDisplayStream: (...args) => captureDisplayStream(...args),
    buildOutputStream: (...args) => buildBroadcastOutputStream(...args),
    replaceTracks: (...args) => replaceBroadcastTracks(...args),
    attachPreview: (...args) => attachBroadcastPreview(...args),
    requestBroadcastAudioSource: (...args) => requestBroadcastAudioSource(...args),
    startWindowAudioBridge: (...args) => startWindowAudioBridge(...args),
    startSystemAudioBridge: (...args) => startSystemAudioBridge(...args),
    stopWindowAudioBridge: (...args) => stopWindowAudioBridge(...args),
    stopComposition: () => stopBroadcastVideoComposition(),
    isRelayActive: (...args) => isRelayRecorderActive(...args),
    stopRelay: (...args) => stopRelayRecorder(...args),
    startRelay: (...args) => startRelayRecorder(...args),
    handleVideoTrackEnded: (...args) => handleBroadcastVideoTrackEnded(...args),
    clearCaptureRecoveryTimer: () => clearBroadcastCaptureRecoveryTimer(),
    formatMissingAudio: (...args) => formatBroadcastMissingAudio(...args),
    qualityProfiles,
    reportClientError,
    setNotice: (value) => { notice = value; },
  });
  const switchBroadcastSource = (...args) => broadcastSwitchController.switchSource(...args);

  function cancelBroadcastVisibility() {
    setBroadcastState({ showBroadcastVisibilityDialog: false, pendingBroadcastContext: null });
  }

  function confirmBroadcastVisibility() {
    const context = pendingBroadcastContext || {};
    const sourceType = pendingBroadcastSourceType;
    const nextContext = { ...context, visibility: broadcastVisibility };
    setBroadcastState({ showBroadcastVisibilityDialog: false, pendingBroadcastContext: nextContext, broadcastSourceType: sourceType, broadcastState: "idle" });
    setNavigationState({ view: "broadcast" });
    notice = "Escolha uma tela, janela ou aplicativo para iniciar a transmissão.";
    void tick().then(() => beginBroadcast({ sourceType, ...nextContext }));
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
    setNavigationState({ view: "broadcast" });
    if (hasLiveBroadcastCapture()) {
      setBroadcastState({ broadcastState: "live" });
      await attachBroadcastPreview();
      return;
    }
    await loadStreams().catch(() => {});
    const ownStream = streams.find((stream) => stream.channelUsername === user?.username)
      || groupOverview?.streams?.find((stream) => stream.channelUsername === user?.username);
    if (ownStream) {
      setBroadcastState({
        broadcastStreamId: ownStream.id,
        broadcastRoomId: ownStream.roomName || "",
        broadcastTitle: ownStream.title || broadcastTitle,
        broadcastInvite: `${window.location.origin}${ownStream.publicPath || ""}`,
        broadcastState: "error",
        broadcastError: "A live ainda aparece ativa, mas a captura local foi perdida. Você pode encerrá-la aqui ou iniciar uma nova captura.",
      });
    } else {
      setBroadcastState({ broadcastState: "idle", broadcastError: "" });
    }
  }

  async function returnFromViewer() {
    setViewerState({ isViewer: false, viewerRoomId: "", viewerStreamPath: "", viewerStream: null });
    window.history.pushState({}, "", "/");
    setNavigationState({ view: broadcastState === "live" ? "broadcast" : "home" });
    if (broadcastState === "live") await attachBroadcastPreview();
  }

  async function navigateFromViewer(nextView) {
    setViewerState({ isViewer: false, viewerRoomId: "", viewerStreamPath: "", viewerStream: null });
    window.history.pushState({}, "", "/");
    setNavigationState({ view: nextView });
    if (nextView === "live") await loadStreams().catch(() => {});
    if (nextView === "notifications") await loadNotifications().catch(() => {});
    if (nextView === "direct") await loadDirectConversations().catch(() => {});
    if (nextView === "groups" && selectedGroupId) await loadGroup(selectedGroupId);
  }

  const mentionController = createMentionController({
    getState: () => ({ messageDraft, mentionSuggestions, mentionStartIndex, mentionActiveIndex }),
    setState: (next) => setMessageState(next),
    getMembers: () => groupMembers,
    getInput: () => messageComposerInput,
    tick,
  });
  const { updateSuggestions: updateMentionSuggestions, handleKeydown: handleMessageKeydown, insertMention } = mentionController;

  function runtimeVersion() {
    return isDesktop ? desktopVersion : WEB_VERSION;
  }

  function handleLegalConsentAccepted(event) {
    if (!user || !event.detail) return;
    user = { ...user, legal: event.detail };
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

  function handleViewerFullscreenMessage(event) {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "telai-viewer-fullscreen") return;
    setViewerState({ viewerParentFullscreen: Boolean(event.data.active) });
  }

  const handleNavigationViewport = () => viewportController.sync();
  const windowLifecycle = createWindowLifecycle({
    bindings: [
      ["error", (event) => reportClientError("window_error", event.error || event.message, { filename: event.filename, line: event.lineno, column: event.colno })],
      ["unhandledrejection", (event) => reportClientError("unhandled_rejection", event.reason)],
      ["click", closeVoiceContextMenu],
      ["click", closeRoomContextMenu],
      ["popstate", handleBrowserPopState],
      ["message", handleViewerFullscreenMessage],
      ["click", closeGroupContextMenu],
      ["click", handleGlobalAccountClick],
      ["click", handleGlobalUserClick],
      ["resize", closeVoiceContextMenu],
      ["resize", closeRoomContextMenu],
      ["resize", closeGroupContextMenu],
      ["resize", handleNavigationViewport],
      ["contextmenu", handleGlobalVoiceContextMenu],
      ["keydown", handlePushToTalkKeyDown],
      ["keydown", handleMuteShortcutKeyDown],
      ["mousedown", handleMuteShortcutMouseDown, true],
      ["contextmenu", handleGlobalRoomContextMenu],
      ["keyup", handlePushToTalkKeyUp],
      ["blur", releasePushToTalk],
      ["offline", handleVoiceNetworkOffline],
      ["online", handleVoiceNetworkOnline],
      ["pointerdown", handleVoicePlaybackInteraction, true],
      ["keydown", handleVoicePlaybackInteraction, true],
      ["focus", handleVoicePlaybackInteraction],
    ],
    documentBindings: [["visibilitychange", handleVoicePlaybackInteraction]],
    mediaBindings: [["devicechange", handleVoiceDeviceChange]],
  });

  const appLifecycleController = createAppLifecycleController({
    getState: () => ({
      user,
      isViewer,
      view,
      groupsWorkspaceOpen,
      selectedGroupId,
      directConversationId,
      theme,
      broadcastSelectionKind,
      voiceLocalStream,
      voiceReconnectTimer,
      refreshGroupOverview,
      loadStreams,
      loadNotifications,
      loadDirectConversationMessages,
    }),
    setState: (next) => {
      if ("user" in next) user = next.user;
      if ("loading" in next) loading = next.loading;
      if ("notice" in next) notice = next.notice;
      if ("isDesktop" in next) isDesktop = next.isDesktop;
      if ("mediaMode" in next) mediaMode = next.mediaMode;
      if ("voiceReconnectSession" in next) voiceReconnectSession = next.voiceReconnectSession;
      if ("voiceReconnectVisible" in next) voiceReconnectVisible = next.voiceReconnectVisible;
      if ("displaySources" in next) displaySources = next.displaySources;
      if ("displaySourceFilter" in next) displaySourceFilter = next.displaySourceFilter;
      if ("showDisplayPicker" in next) showDisplayPicker = next.showDisplayPicker;
    },
    windowLifecycle,
    stateUnsubscribers: [
      unsubscribeNavigationState,
      unsubscribeAuthState,
      unsubscribeVisualState,
      unsubscribeViewerState,
      unsubscribeLiveState,
      unsubscribeBroadcastState,
      unsubscribeMaintenanceState,
      unsubscribeNotificationState,
      unsubscribeSocialState,
      unsubscribeSettingsState,
      unsubscribeGroupState,
      unsubscribeApplicationCommandState,
      unsubscribeMessageState,
      unsubscribeDirectState,
    ],
    detectViewerRoute,
    loadMaintenance,
    handleNavigationViewport,
    readVoiceReconnectSession,
    setVisualState,
    api,
    setAuthState,
    canonicalizeAuthenticatedRoute,
    maybeShowReleaseNotes,
    refresh,
    loadAudioDevices,
    loadIceConfiguration,
    redeemPendingInvite,
    openPendingChannelRoute,
    loadDesktopVersion,
    loadDesktopLaunchAtLogin,
    loadDesktopHardwareAcceleration,
    handleDesktopPushToTalk,
    handleDesktopMuteShortcut,
    handleDesktopUpdate,
    handleDesktopTrayAction,
    handleWindowAudioStatus,
    clearBroadcastCaptureRecoveryTimer,
    clearVoiceSpeakingPublishTimer,
    stopVoiceTest,
    stopVoiceInputStream,
    groupEventRuntime,
    resetVoiceActivity: () => voiceActivityController.reset(),
    stopVoiceQuality: () => voiceQualityController.stop(),
    voiceReconnectTimer,
    reportClientError,
    updateMaintenanceCountdown,
  });

  onMount(() => {
    void appLifecycleController.start();
  });

  onDestroy(() => {
    appLifecycleController.stop();
  });

  function setTheme(nextTheme) {
    const previousDefaults = visualDefaults[theme];
    const nextDefaults = visualDefaults[nextTheme];
    setVisualState({
      theme: nextTheme,
      buttonColor: buttonColor === previousDefaults.button ? nextDefaults.button : buttonColor,
      inputBackgroundColor: inputBackgroundColor === previousDefaults.input ? nextDefaults.input : inputBackgroundColor,
      backgroundColor: backgroundColor === previousDefaults.background ? nextDefaults.background : backgroundColor,
    });
  }

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark");
    localStorage.setItem("mirante-theme", theme);
    window.miranteDesktop?.setTheme?.(theme);
    if (user) api("/api/auth/preferences", { method: "PATCH", body: JSON.stringify({ theme, defaultQuality: selectedQuality, defaultAudio: audioMode, buttonColor, inputBackgroundColor, backgroundColor, pushToTalkKey }) }).catch(() => {});
  }

</script>

<svelte:head>
  <title>Telai · painel</title>
</svelte:head>

<div class:light={!isDark} class:desktop-app={isDesktop} class:home-shell={view === "home"} class:groups-shell={view === "groups"} class:settings-shell={view === "settings"} class:broadcast-shell={view === "broadcast"} class:multistream-mode={view === "multistream"} class:viewer-shell-active={isViewer || view === "viewer"} class:viewer-parent-fullscreen={viewerParentFullscreen} class:broadcast-active={broadcastState === "live"} class:voice-reconnect-active={voiceReconnectVisible && voiceReconnectSession} class:global-sidebar-collapsed={globalSidebarCollapsed} class="mirante-shell" style={visualStyle}>
  {#if isDesktop}<div class="desktop-titlebar" aria-hidden="true"></div>{/if}
  {#if maintenanceNotice}<div class="maintenance-banner" role="alert" aria-live="assertive"><div><strong>Manutenção programada</strong><span>{maintenanceRemainingSeconds > 0 ? `O Telai será atualizado em ${maintenanceRemainingSeconds}s.` : "A atualização está começando agora."}</span><small>{maintenanceNotice.message}</small></div><b>{maintenanceRemainingSeconds > 0 ? `${maintenanceRemainingSeconds}s` : "agora"}</b></div>{/if}
  <AppEntryWorkspace
    state={{
      loading,
      isViewer,
      view,
      isDark,
      visualStyle,
      viewerRoomId,
      viewerStreamPath,
      viewerStream,
      mediaMode,
      rtcConfig,
      appVersion: runtimeVersion(),
      user,
      authMode,
      authError,
      loginUsername,
      loginPassword,
      registerDisplayName,
      registerUsername,
      registerPassword,
      registerLegalAccepted,
      providers,
      authBusy
    }}
    actions={{
      toggleTheme,
      returnFromViewer,
      navigateFromViewer,
      setAuthState,
      submitAuth,
      startOAuth
    }}
  >
    <AppMainShell
      state={{
        compactViewport,
        showGlobalSidebar,
        globalSidebarCollapsed,
        isDark,
        isDesktop,
        user,
        broadcastState,
        showUserMenu,
        showAboutInAccountMenu,
        notificationUnreadCount,
        desktopVersion,
        webVersion: WEB_VERSION,
        desktopUpdate,
        desktopUpdateLabel,
        view,
        notice,
        voiceReconnectVisible,
        voiceReconnectSession,
        voiceReconnectBusy
      }}
      actions={{
        toggleGlobalNavigation,
        navigateHome: () => setNavigationState({ view: "home" }),
        returnToBroadcast,
        stopBroadcast,
        requestBroadcastStart,
        toggleUserMenu: () => { showUserMenu = !showUserMenu; showAboutInAccountMenu = false; },
        openAccountDestination,
        openReleaseNotes,
        toggleAbout: () => showAboutInAccountMenu = !showAboutInAccountMenu,
        updateDesktopApp,
        toggleTheme,
        logout: () => { showUserMenu = false; void logout(); },
        openNotifications,
        closeGlobalNavigation: () => setNavigationState({ showGlobalSidebar: false }),
        selectView,
        openSettings: () => void openAccountDestination("settings"),
        reconnectVoice: () => void reconnectSavedVoiceRoom(),
        clearVoiceReconnectSession
      }}
    >
      {#if ["home", "notifications", "friends", "following", "direct", "broadcast", "multistream", "live"].includes(view)}
        <AppRouteWorkspace
          state={{
            view,
            homeLiveStreams,
            homeCommunityGroups,
            notificationUnreadCount,
            hideReadNotifications,
            readNotificationCount,
            notificationsError,
            unreadDirectNotification,
            notificationsLoading,
            visibleNotifications,
            notifications,
            inviteActionId,
            socialSearchOpen,
            socialRequestsOpen,
            socialSearchQuery,
            social,
            socialError,
            socialSearchBusy,
            socialSearchResults,
            socialActionId,
            user,
            directConversationError,
            directConversations,
            directConversationId,
            directConversationTarget,
            directConversationLoading,
            directMessages,
            directConversationSending,
            broadcastState,
            broadcastStreamId,
            broadcastTitle,
            broadcastSourceType,
            publicBroadcastSourceLabel,
            broadcastSelectionKind,
            qualityProfiles,
            broadcastError,
            broadcastAudioWarning,
            viewerCount,
            broadcastChatMessages,
            isDesktop,
            broadcastDisplaySurface,
            broadcastAudioSourceName,
            cameraInputDevices,
            audioInputDevices,
            broadcastSourceSwitching,
            broadcastMediaSwitching,
            voiceDevicesBusy,
            broadcastInvite,
            pendingBroadcastContext,
            MultistreamPage,
            streams,
            selectedStreams,
            followingOnly
          }}
          actions={{
            requestBroadcastStart,
            openCreateGroup: () => { showGroupDialog = true; },
            openLive: () => selectView("live"),
            openGroups: () => selectView("groups"),
            openStreamViewer,
            openGroup: (group) => { setGroupState({ selectedGroupId: group.id }); loadGroup(group.id); setGroupsView(); },
            setHideReadNotifications,
            markAllNotificationsRead,
            openDirectNotification,
            markNotificationRead,
            respondToInvite,
            reviewNotification,
            openStreamNotification,
            openHome: () => selectView("home"),
            setSocialState,
            searchSocialUsers,
            openDirectConversationWithUser,
            cancelFriendRequest,
            sendFriendRequest,
            toggleFollowUser,
            toggleBlockUser,
            respondToFriendRequest,
            removeFriend,
            openFriends: () => selectView("friends"),
            setDirectMessageDraft: (event) => setDirectState({ directMessageDraft: event.detail }),
            openDirectConversationById,
            sendDirectMessage,
            handleDirectMessageKeydown,
            stopBroadcast,
            beginBroadcast,
            sendBroadcastChatMessage,
            handleBroadcastAudioModeChange,
            handleBroadcastCameraChange,
            handleBroadcastCameraToggle,
            handleBroadcastCameraPositionChange,
            handleBroadcastMicrophoneChange,
            refreshBroadcastDevices,
            switchBroadcastSource,
            copyBroadcastInvite,
            requestCameraBroadcastStart,
            closeMultistream,
            toggleStream,
            openMultistream,
            handleStreamCardClick,
            handleStreamCardKeydown,
            openStreamViewer,
            toggleFollowStream,
            toggleFollowing: () => { setLiveState({ followingOnly: !followingOnly }); void loadStreams().catch((error) => { notice = error.message; }); }
          }}
          bind:directMessageDraft
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
        />
      {:else if view === "groups"}
        <AppGroupsWorkspace
          state={{
            groupsWorkspaceOpen,
            groups,
            groupPickerGroups,
            groupLoading,
            selectedGroup,
            selectedGroupId,
            groupMembers,
            user,
            groupNavigationCollapsed,
            showMobileChannels,
            showMobileMembers,
            showGroupPicker,
            textRooms,
            voiceRooms,
            selectedRoomId,
            voiceDropRoomId,
            draggedVoiceParticipantId,
            canMoveVoiceMembers,
            voiceState,
            voiceServerMuted,
            voiceMuted,
            voiceDeafened,
            broadcastState,
            selectedRoom,
            GroupVoiceWorkspace,
            selectedRoomLiveStreams,
            watchingGroupLiveStreamId,
            streamViewerUrl,
            voiceLobbyParticipants,
            voiceRoomId,
            activeVoiceRoom,
            voiceError,
            GroupTextChatWorkspace,
            messageDraft,
            roomMessages,
            groupApplicationCommands,
            editingMessageId,
            editingMessageDraft,
            mentionSuggestions,
            mentionActiveIndex,
            messageAttachments,
            memberRoleGroups
          }}
          actions={{
            openGroupSearchDialog,
            openCreateGroupDialog: () => { showGroupDialog = true; },
            openGroupWorkspace,
            closeGroupWorkspace: () => setGroupsView({ openWorkspace: false }),
            openInviteDialog,
            openGroupSettings: () => openSettings("group", "groups"),
            openLeaveGroupDialog,
            goHome: () => selectView("home"),
            loadGroup,
            openGroupContextMenu,
            toggleGroupNavigation: () => { groupNavigationCollapsed = !groupNavigationCollapsed; setNavigationState({ showMobileChannels: false }); },
            toggleGroupPicker: () => { showGroupPicker = !showGroupPicker; },
            openCreateGroupFromChannelRail: () => { showGroupPicker = false; showGroupDialog = true; },
            openCreateRoomDialog: (kind) => { showRoomDialog = true; if (kind) roomKind = kind; },
            selectRoom,
            visibleVoiceParticipants,
            isVoiceParticipantSpeaking,
            voiceParticipantDisplayName,
            privateLiveForParticipant,
            handleVoiceDragOver,
            handleVoiceDragLeave,
            handleVoiceDrop,
            handleVoiceDragStart,
            handleVoiceDragEnd,
            toggleVoiceMute,
            toggleVoiceDeafen,
            requestBroadcastStart,
            openVoiceSettings,
            leaveVoiceRoom,
            toggleMobileChannels: () => setNavigationState({ showMobileChannels: !showMobileChannels, showMobileMembers: false }),
            toggleMobileMembers: () => setNavigationState({ showMobileMembers: !showMobileMembers, showMobileChannels: false }),
            openGroupMessageSearch,
            selectedRoomLiveStreams,
            watchSelectedRoomLive,
            closeSelectedRoomLive,
            joinVoiceRoom,
            setMessageDraft: (event) => setMessageState({ messageDraft: event.detail }),
            setEditingMessageDraft: (event) => setMessageState({ editingMessageDraft: event.detail }),
            sendMessage,
            updateMentionSuggestions,
            handleMessageKeydown,
            insertMention,
            startEditMessage,
            cancelEditMessage,
            saveEditMessage,
            deleteMessage,
            openGroupThread,
            addMessageAttachments,
            removeMessageAttachment,
            submitBotComponent,
            submitBotModal,
            startApplicationInteraction,
            openUserContextMenu,
            openDirectConversationWithUser
          }}
          bind:groupPickerQuery
          bind:messageComposerInput
        />
      {:else if view === "settings"}
        <AppSettingsWorkspace
          state={{
            SettingsPage,
            settingsSection,
            settingsTab,
            selectedGroupId,
            user,
            settingsBusy,
            settingsError,
            channelDisplayName,
            channelAvatarData,
            gameOptions,
            channelGames,
            channelError,
            settingsAvatarData,
            settingsDisplayName,
            avatarError,
            theme,
            buttonColor,
            inputBackgroundColor,
            backgroundColor,
            providers,
            selectedGroup,
            ProfileSettingsExtras,
            isDesktop,
            preferencesResetBusy,
            preferencesResetConfirm,
            launchAtLogin,
            launchAtLoginBusy,
            launchAtLoginError,
            hardwareAccelerationMode,
            hardwareAccelerationBusy,
            hardwareAccelerationError,
            VoiceSettingsPanel,
            voiceNoiseSuppressionStatus,
            voiceNativeProcessingDetails,
            voiceInputProfile,
            voiceAdvancedOptions,
            voiceTestRunning,
            voiceTestLevel,
            voiceTestError,
            voiceTestSpeakerStatus,
            voiceTestStatus,
            voiceDevicesBusy,
            audioInputDevices,
            audioOutputDevices,
            voiceMicrophoneVolume,
            voiceOutputVolume,
            pushToTalkEnabled,
            pushToTalkCapturing,
            pushToTalkActive,
            pushToTalkKey,
            desktopPushToTalkGlobal,
            muteShortcutCapturing,
            muteShortcut,
            desktopMuteShortcutGlobal,
            voiceAdvancedOpen,
            soundPreferences,
            voiceDevicesError,
            voiceSensitivityAuto,
            voiceSensitivity,
            pushToTalkLabel,
            shortcutLabel,
            liveNotificationScopes,
            groupRoles,
            selectedRole,
            groupMembers,
            rolePermissionOptions,
            filteredRoleMembers,
            roleOrderSaving,
            draggedRoleId,
            dragOverRoleId,
            roleEditBusy,
            roleMemberActionId,
            GroupChannelPermissionsSettings,
            GroupAuditLogSettings,
            rooms,
            groupRoomPermissions,
            roomPermissionBusyKey,
            activeGroupInvites,
            groupInviteLink,
            groupInviteCreating,
            groupInviteBusyId,
            groupJoinRequests,
            groupJoinActionId,
            groupAuditEntries,
            groupAuditLoading,
            api,
            groupAdminError
          }}
          actions={{
            selectSettingsSection,
            loadGroupAdministration,
            back: () => setNavigationState({ view: settingsReturnView }),
            selectTab: (tab) => setSettingsState({ settingsTab: tab }),
            setChannelDisplayName: (event) => setSettingsState({ channelDisplayName: event.detail }),
            saveChannelProfile,
            handleChannelAvatarChange,
            clearChannelAvatar,
            toggleChannelGame,
            setSettingsDisplayName: (event) => setSettingsState({ settingsDisplayName: event.detail }),
            setTheme: (event) => setVisualState({ theme: event.detail }),
            setButtonColor: (event) => setVisualState({ buttonColor: event.detail }),
            setInputBackgroundColor: (event) => setVisualState({ inputBackgroundColor: event.detail }),
            setBackgroundColor: (event) => setVisualState({ backgroundColor: event.detail }),
            saveProfile,
            handleAvatarChange,
            clearAvatar,
            savePreferences,
            saveGroupSettings,
            togglePreferencesResetConfirm: () => setSettingsState({ preferencesResetConfirm: !preferencesResetConfirm }),
            resetPreferencesToDefaults,
            toggleLaunchAtLogin,
            setHardwareAcceleration,
            loadAudioDevices,
            applyVoiceInputDevice,
            applyVoiceOutputDevice,
            setVoiceMicrophoneVolume,
            setVoiceOutputVolume,
            applyVoiceInputProfile,
            togglePushToTalk,
            startPushToTalkCapture,
            clearPushToTalkKey,
            startMuteShortcutCapture,
            clearMuteShortcut,
            toggleVoiceAdvanced,
            updateVoiceAdvancedOption,
            handleVoiceSoundEffectsChange,
            handleSoundVolumeChange,
            previewVoiceSound,
            handleSoundPreferenceChange,
            updateVoiceSensitivityAuto,
            updateVoiceSensitivity,
            startVoiceTest,
            stopVoiceTest,
            testVoiceSpeaker,
            setLiveNotificationScope,
            createGroupRole,
            startRoleDrag,
            handleRoleDragOver,
            dropRole,
            endRoleDrag,
            moveRole,
            deleteGroupRole,
            saveGroupRoleDetails,
            updateRolePermission,
            setRoleMember,
            loadGroupRoomPermissions,
            updateGroupRoomPermission,
            resetGroupRoomPermission,
            createGroupInvite,
            copyGroupInvite,
            deleteGroupInvite,
            respondToGroupJoinRequest,
            refreshGroupAfterModeration
          }}
          bind:settingsPageElement
          bind:selectedQuality
          bind:audioMode
          bind:groupSettingsName
          bind:selectedInputDeviceId
          bind:selectedOutputDeviceId
          bind:selectedRoleId
          bind:newRoleName
          bind:newRoleColor
          bind:roleEditName
          bind:roleEditColor
          bind:roleMemberSearchQuery
          bind:selectedRoomPermissionId
        />
      {:else}
        <div class="workspace-loading"><span></span><span></span><span></span></div>
      {/if}
    </AppMainShell>
  </AppEntryWorkspace>

  <AppOverlays
    state={{
      selectedRoomRemoteVoice,
      user,
      voicePlaybackBlocked,
      voiceState,
      voiceDeafened,
      ContextMenus,
      groupContextMenu,
      roomContextMenu,
      voiceContextMenu,
      profilePreview,
      selectedGroupId,
      currentGroupMember,
      selectedGroup,
      socialActionId,
      voiceVolumes,
      canMoveVoiceMembers,
      voiceRoomId,
      voiceRooms,
      activeVoiceRoom,
      GroupDialogs,
      showInviteDialog,
      showGroupSearchDialog,
      showLeaveGroupDialog,
      showDeleteRoomDialog,
      showDeleteGroupDialog,
      showGroupDialog,
      showRoomDialog,
      deleteRoomTarget,
      inviteSearchQuery,
      inviteSearchBusy,
      inviteSearchError,
      inviteSearchResults,
      inviteActionId,
      groupInviteCreating,
      groupInviteLink,
      groupSearchQuery,
      groupSearchBusy,
      groupSearchError,
      groupSearchResults,
      groupJoinActionId,
      leaveGroupBusy,
      leaveGroupError,
      deleteRoomBusy,
      deleteRoomError,
      deleteGroupBusy,
      deleteGroupError,
      groupName,
      roomDialogMode,
      roomName,
      roomKind,
      roomMaxParticipants,
      GroupMessageSearchDialog,
      showGroupMessageSearch,
      groupMessageSearchQuery,
      groupMessageSearchResults,
      groupMessageSearchBusy,
      groupMessageSearchError,
      rooms,
      GroupThreadDialog,
      activeGroupThread,
      groupThreadMessages,
      groupThreadDraft,
      groupThreadBusy,
      groupThreadError,
      BroadcastDialogs,
      isDesktop,
      showPublicBroadcastSetup,
      showPublicBroadcastReview,
      showBroadcastVisibilityDialog,
      showDisplayPicker,
      showBroadcastAudioPicker,
      publicBroadcastTitle,
      publicBroadcastSourceKind,
      publicBroadcastMicrophoneEnabled,
      publicBroadcastCameraEnabled,
      publicBroadcastCameraDeviceId,
      publicBroadcastQuality,
      selectedInputDeviceId,
      audioInputDevices,
      cameraInputDevices,
      broadcastError,
      broadcastTitle,
      broadcastSelectionKind,
      broadcastSelectedSourceName,
      broadcastMicrophoneEnabled,
      broadcastCameraEnabled,
      qualityProfiles,
      selectedQuality,
      broadcastVisibility,
      displayPickerAvailability,
      displaySourceFilter,
      displaySourceGroups,
      broadcastAudioSourceCandidates,
      publicBroadcastAudioLabel,
      publicBroadcastSourceLabel,
      showReleaseNotes,
      releaseNotes,
    }}
    actions={{
      joinVoiceRoom,
      handleLegalConsentAccepted,
      resumeVoiceRemoteAudio,
      handleGroupContextMenuKeydown,
      runGroupContextAction,
      handleRoomContextMenuKeydown,
      runRoomContextAction,
      handleVoiceContextMenuKeydown,
      voiceParticipantDisplayName,
      showVoiceProfile,
      sendFriendRequestFromContext,
      openDirectConversationWithUser,
      mentionVoiceParticipant,
      setVoiceVolume,
      toggleContextParticipantServerMute,
      toggleVoiceParticipantLocalMute,
      isVoiceParticipantLocallyMuted,
      moveContextParticipant,
      disconnectContextParticipant,
      closeProfilePreview: () => profilePreview = null,
      closeInvite: () => showInviteDialog = false,
      setInviteSearchQuery: (value) => inviteSearchQuery = value,
      searchUsers,
      inviteUser,
      createGroupInvite,
      copyGroupInvite,
      closeGroupSearch: () => showGroupSearchDialog = false,
      setGroupSearchQuery: (value) => groupSearchQuery = value,
      searchGroups,
      requestGroupEntry,
      closeLeaveGroup: () => showLeaveGroupDialog = false,
      leaveSelectedGroup,
      closeDeleteRoom: () => showDeleteRoomDialog = false,
      confirmDeleteGroupRoom,
      closeDeleteGroup: () => showDeleteGroupDialog = false,
      deleteSelectedGroup,
      closeGroup: () => showGroupDialog = false,
      setGroupName: (value) => groupName = value,
      createGroup,
      closeRoom: () => showRoomDialog = false,
      setRoomName: (value) => roomName = value,
      setRoomKind: (value) => roomKind = value,
      setRoomMaxParticipants: (value) => roomMaxParticipants = value,
      createRoom,
      setGroupMessageSearchQuery: (value) => setMessageState({ groupMessageSearchQuery: value }),
      searchGroupMessages,
      closeGroupMessageSearch: () => showGroupMessageSearch = false,
      openGroupMessageSearchResult,
      updateGroupThreadDraft,
      sendGroupThreadMessage,
      closeGroupThread,
      startEditMessage,
      deleteMessage,
      setPublicBroadcastTitle: (value) => setBroadcastState({ publicBroadcastTitle: value }),
      setPublicBroadcastSourceKind: (value) => setBroadcastState({ publicBroadcastSourceKind: value }),
      setPublicBroadcastMicrophone: (value) => setBroadcastState({ publicBroadcastMicrophoneEnabled: value }),
      setPublicBroadcastCamera: (value) => setBroadcastState({ publicBroadcastCameraEnabled: value }),
      setPublicBroadcastCameraDevice: (value) => setBroadcastState({ publicBroadcastCameraDeviceId: value }),
      setPublicBroadcastQuality: (value) => setBroadcastState({ publicBroadcastQuality: value }),
      setSelectedInputDevice: (value) => selectedInputDeviceId = value,
      cancelPublicBroadcastSetup,
      confirmPublicBroadcastSetup,
      cancelPublicBroadcastReview,
      confirmPublicBroadcastReview,
      cancelBroadcastVisibility,
      setBroadcastVisibility: (value) => setBroadcastState({ broadcastVisibility: value }),
      confirmBroadcastVisibility,
      cancelDisplayPicker,
      setDisplaySourceFilter: (value) => displaySourceFilter = value,
      selectDisplaySource,
      cancelBroadcastAudioPicker,
      selectBroadcastAudioSource,
      skipBroadcastAudioSource,
      dismissReleaseNotes,
    }}
  />
</div>
