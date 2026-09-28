<script>
  import { onDestroy, onMount, tick } from "svelte";
  import Viewer from "./Viewer.svelte";
  import AuthPage from "./features/auth/AuthPage.svelte";
  import { createAuthController } from "./features/auth/controller.js";
  import { createAuthStateStore } from "./features/auth/auth-state.js";
  import NotificationsPage from "./features/notifications/NotificationsPage.svelte";
  import { createNotificationController } from "./features/notifications/controller.js";
  import { createNotificationStateStore } from "./features/notifications/notification-state.js";
  import FriendsPage from "./features/social/FriendsPage.svelte";
  import FollowingPage from "./features/social/FollowingPage.svelte";
  import { createSocialStateStore } from "./features/social/social-state.js";
  import DirectMessagesPage from "./features/direct/DirectMessagesPage.svelte";
  import BroadcastPage from "./features/broadcast/BroadcastPage.svelte";
  import { createBroadcastStateStore } from "./features/broadcast/broadcast-state.js";
  import LivePage from "./features/live/LivePage.svelte";
  import { createLiveStateStore } from "./features/live/live-state.js";
  import HomePage from "./features/home/HomePage.svelte";
  import GroupPickerPage from "./features/groups/GroupPickerPage.svelte";
  import GroupMemberRail from "./features/groups/GroupMemberRail.svelte";
  import GroupServerRail from "./features/groups/GroupServerRail.svelte";
  import GroupChannelRail from "./features/groups/GroupChannelRail.svelte";
  import GroupWorkspaceHeader from "./features/groups/GroupWorkspaceHeader.svelte";
  import GroupChatHeader from "./features/groups/GroupChatHeader.svelte";
  import AppHeader from "./features/shell/AppHeader.svelte";
  import GlobalSidebar from "./features/shell/GlobalSidebar.svelte";
  import VoiceReconnectBanner from "./features/shell/VoiceReconnectBanner.svelte";
  import { createViewportController } from "./features/shell/viewport-controller.js";
  import { createRouteController } from "./features/shell/route-controller.js";
  import { createAccountController } from "./features/shell/account-controller.js";
  import { createContextMenuController } from "./features/shell/context-menu-controller.js";
  import { createNavigationStateStore } from "./features/shell/navigation-state.js";
  import { createViewerStateStore } from "./features/shell/viewer-state.js";
  import { createSettingsNavigationController } from "./features/settings/navigation-controller.js";
  import { createVisualStateStore, VISUAL_DEFAULTS, visualStyleFromState } from "./features/settings/visual-state.js";
  import GroupLiveGallery from "./GroupLiveGallery.svelte";
  import AccountPrivacy from "./AccountPrivacy.svelte";
  import LegalConsentGate from "./LegalConsentGate.svelte";
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
  import { createClientPollingController } from "./services/client-polling.js";
  import { createGatewaySequenceGuard } from "./services/gateway-sequence.js";
  import { createMaintenanceController } from "./features/shell/maintenance-controller.js";
  import { createBroadcastRuntimeController } from "./features/broadcast/runtime-controller.js";
  import { createBroadcastLifecycleController } from "./features/broadcast/lifecycle-controller.js";
  import { createAppComponentLoaders } from "./app/component-loader-registry.js";
  import { copyTextValue } from "./services/clipboard.js";
  import { globalNavSections, iconFor, notificationIconFor } from "./config/ui.js";
  import { createVoiceActivityController } from "./features/voice/activity-controller.js";
  import { createVoiceParticipantStateController } from "./features/voice/participant-state.js";
  import { BROADCAST_QUALITY_PROFILES as qualityProfiles, hasTurnServer } from "../../shared/media-contract.mjs";
  import { HugeiconsIcon } from "@hugeicons/svelte";
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
  let windowAudioStatusUnsubscribe = null;
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
    onSpeakingStateChange: (participantId, speaking) => markVoiceParticipantSpeaking(participantId, speaking),
    onRtcSpeakingStateChange: (participantId, speaking) => markVoiceParticipantSpeaking(participantId, speaking, "rtc"),
    onTrackEnded: (participantId, track) => reportClientError(
      "voice_activity_track_ended",
      new Error("A faixa do microfone/áudio terminou durante a sala de voz."),
      { participantId, isDesktop, trackReadyState: track?.readyState },
    ),
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
  $: if (selectedGroupId && selectedRoom?.kind === "text" && groupOverview?.group?.id === selectedGroupId) {
    const autoReadKey = `${selectedGroupId}:${selectedRoom.id}`;
    if (lastAutoMarkedGroupRoomKey !== autoReadKey) {
      lastAutoMarkedGroupRoomKey = autoReadKey;
      void markGroupRoomRead(selectedRoom);
    }
  }
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
  $: visualStyle = visualStyleFromState({ buttonColor, inputBackgroundColor, backgroundColor });
  $: roomMessages = (groupOverview?.messages || []).filter((message) => !selectedRoom || !message.roomId || message.roomId === selectedRoom.id);
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
        processVoiceInputStream,
        rememberCapturedInputDevice,
        reportClientError,
        setState: (next) => {
          if ("broadcastMicrophoneStream" in next) broadcastMicrophoneStream = next.broadcastMicrophoneStream;
          if ("displaySourceFilter" in next) displaySourceFilter = next.displaySourceFilter;
          if ("displaySourceSelection" in next) displaySourceSelection = next.displaySourceSelection;
          if ("displaySources" in next) displaySources = next.displaySources;
          if ("notice" in next) notice = next.notice;
          if ("showDisplayPicker" in next) showDisplayPicker = next.showDisplayPicker;
        },
        stopVoiceInputStream,
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
    stopVoiceInputStream,
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
    if (voiceReconnectTimer) window.clearTimeout(voiceReconnectTimer);
    voiceReconnectTimer = null;
    voiceReconnectStorage.clear();
  }

  function randomRoom() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
    updateVoiceMicrophoneGain(voiceAudioTestController.getState().stream);
    updateVoiceMicrophoneGain(broadcastMicrophoneStream);
    if (updatedLocalGain || !voiceLocalStream || voiceInputLifecycleController.isRecoveryInFlight()) return;
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

  const bindVoiceLocalTrack = (track) => voiceInputLifecycleController.bindLocalTrack(track);

  async function negotiateVoicePeer(participantId, peer, reason = "audio_track_added") {
    return voiceTrackSyncService.negotiate(participantId, peer, reason);
  }

  async function syncVoiceLocalTrackToPeers({ negotiateMissing = true } = {}) {
    return voiceTrackSyncService.sync({ negotiateMissing });
  }

  const recoverVoiceInputTrack = (reason = "track_unavailable") => voiceInputLifecycleController.recover(reason);

  const reapplyVoiceInputSettings = () => voiceInputLifecycleController.reapplySettings();

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

  function handleAvatarChange(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setSettingsState({ avatarError: "" });
    if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type)) {
      setSettingsState({ avatarError: "Escolha uma imagem PNG, JPG, WEBP ou GIF." });
      event.currentTarget.value = "";
      return;
    }
    if (file.size > maxAvatarFileBytes) {
      setSettingsState({ avatarError: "A foto precisa ter no máximo 5 MB." });
      event.currentTarget.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setSettingsState({ settingsAvatarData: String(reader.result || "") }); };
    reader.onerror = () => { setSettingsState({ avatarError: "Não foi possível ler essa foto." }); };
    reader.readAsDataURL(file);
  }

  function clearAvatar() {
    setSettingsState({ settingsAvatarData: "", avatarError: "" });
    if (avatarFileInput) avatarFileInput.value = "";
  }

  function handleChannelAvatarChange(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setSettingsState({ channelError: "" });
    if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type)) {
      setSettingsState({ channelError: "Escolha uma imagem PNG, JPG, WEBP ou GIF para o canal." });
      event.currentTarget.value = "";
      return;
    }
    if (file.size > maxAvatarFileBytes) {
      setSettingsState({ channelError: "A foto do canal precisa ter no máximo 5 MB." });
      event.currentTarget.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setSettingsState({ channelAvatarData: String(reader.result || "") }); };
    reader.onerror = () => { setSettingsState({ channelError: "Não foi possível ler essa foto do canal." }); };
    reader.readAsDataURL(file);
  }

  function clearChannelAvatar() {
    setSettingsState({ channelAvatarData: "", channelError: "" });
    if (channelAvatarFileInput) channelAvatarFileInput.value = "";
  }

  function toggleChannelGame(game) {
    setSettingsState({
      channelGames: channelGames.includes(game)
        ? channelGames.filter((item) => item !== game)
        : [...channelGames, game].slice(0, 8),
    });
  }

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

  async function saveGroupSettings() {
    if (!selectedGroupId || groupSettingsName.trim().length < 2) return;
    setSettingsState({ settingsBusy: true, settingsError: "" });
    try {
      const result = await api(`/api/groups/${encodeURIComponent(selectedGroupId)}`, { method: "PATCH", body: JSON.stringify({ name: groupSettingsName.trim() }) });
      setGroupState({
        groups: groups.map((group) => group.id === selectedGroupId ? { ...group, name: result.group.name, slug: result.group.slug } : group),
        groupOverview: groupOverview ? { ...groupOverview, group: { ...groupOverview.group, ...result.group } } : groupOverview,
      });
      notice = "Configurações do grupo salvas.";
    } catch (error) { setSettingsState({ settingsError: error.message }); }
    finally { setSettingsState({ settingsBusy: false }); }
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
      setGroupState({ groupOverview: { ...groupOverview, members: groupOverview.members.map((item) => item.id === member.id ? { ...item, roleId: result.roleId, roleName: assignedRole?.name || "Membro", roleColor: assignedRole?.color || "#5865f2", ...Object.fromEntries(rolePermissionOptions.map(({ key }) => [key, Boolean(assignedRole?.[key])] )) } : item) } });
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
      setGroupState({ groupOverview: {
        ...groupOverview,
        members: groupOverview.members.map((member) => member.roleId === role.id ? { ...member, ...updatedRole } : member),
      } });
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
      setGroupState({ groupOverview: {
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
      } });
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
      setGroupState({ groupOverview: {
        ...groupOverview,
        members: groupOverview.members.map((member) => member.roleId === updatedRole.id
          ? { ...member, roleName: updatedRole.name, roleColor: updatedRole.color, ...permissions }
          : member),
      } });
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
      setGroupState({ groupOverview: {
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
      } });
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
      setGroupState({ knownGroupMessageIds: new Set([...knownGroupMessageIds, ...(groupOverview?.messages || []).filter((message) => messageBelongsToRoom(message, room)).map((message) => message.id)]) });
      if (room.kind === "text") void markGroupRoomRead(room);
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
      const nextGroups = groups.filter((group) => group.id !== selectedGroupId);
      setGroupState({ groups: nextGroups, groupOverview: null, selectedRoomId: null, selectedGroupId: nextGroups[0]?.id || null });
      showDeleteGroupDialog = false;
      if (selectedGroupId) await loadGroup(selectedGroupId);
      else setNavigationState({ view: "home" });
      notice = `${deletedGroupName} foi excluído.`;
    } catch (error) {
      deleteGroupError = error.message || "Não foi possível excluir o grupo agora.";
    } finally {
      deleteGroupBusy = false;
    }
  }

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

  function sendVoice(message) {
    if (voiceSocket?.readyState === WebSocket.OPEN) voiceSocket.send(JSON.stringify(message));
  }

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
    const analyzer = voiceActivityController.getAnalyzer(participantId);
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

  function clearVoiceActivityAnalyzer(participantId) {
    voiceActivityController.clearAnalyzer(participantId);
    markVoiceParticipantSpeaking(participantId, false, "cleanup");
    markVoiceParticipantSpeaking(participantId, false, "rtc");
  }

  function scheduleVoicePeerRecovery(...args) {
    return voicePeerRecoveryController.schedule(...args);
  }

  function recoverVoicePeer(...args) {
    return voicePeerRecoveryController.recover(...args);
  }

  function ensureVoiceActivityTimer() {
    voiceActivityController.ensureTimer();
  }

  function clearVoiceSpeakingPublishTimer() {
    voiceActivityController.resetPublisher();
  }

  async function attachVoiceActivityStream(participantId, stream) {
    return voiceActivityController.attachStream(participantId, stream);
  }

  function attachVoiceActivityDetector(participantId, audio) {
    voiceActivityController.attachDetector(participantId, audio);
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

  const contextMenuController = createContextMenuController({
    getVoiceRoomId: () => voiceRoomId,
    getActiveVoiceRoom: () => activeVoiceRoom,
    getSelectedRoom: () => selectedRoom,
    getVoiceParticipants: () => voiceParticipants,
    getVoiceRooms: () => voiceRooms,
    getTextRooms: () => textRooms,
    getGroupMembers: () => groupMembers,
    visibleVoiceParticipants,
    voiceParticipantDisplayName,
    openVoiceContextMenu,
    openRoomContextMenu,
    openUserContextMenu,
  });
  const handleGlobalVoiceContextMenu = contextMenuController.handleVoiceContextMenu;
  const handleGlobalRoomContextMenu = contextMenuController.handleRoomContextMenu;
  const handleGlobalUserClick = contextMenuController.handleUserClick;

  function showVoiceProfile(participant) {
    profilePreview = participant;
    closeVoiceContextMenu();
  }

  async function mentionVoiceParticipant(participant) {
    const textRoom = textRooms[0];
    if (!textRoom) return;
    setGroupState({ selectedRoomId: textRoom.id });
    setMessageState({ messageDraft: `${messageDraft.trim()}${messageDraft.trim() ? " " : ""}@${participant.username || participant.displayName || "usuario"} ` });
    closeVoiceContextMenu();
    await tick();
    document.querySelector(".message-composer textarea")?.focus();
  }

  const setVoiceVolume = (participantId, value) => setVoiceParticipantVolumePreference(participantId, value);
  const isVoiceParticipantLocallyMuted = (participantId) => isVoiceParticipantLocallyMutedPreference(participantId);
  function toggleVoiceParticipantLocalMute(participantId) {
    if (toggleVoiceParticipantLocalMutePreference(participantId)) closeVoiceContextMenu();
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

  function createVoicePeer(...args) {
    return voicePeerController?.createPeer(...args) || null;
  }
  function handleVoiceSignal(message) {
    return voiceSignalingController.handleSignal(message);
  }

  function enqueueVoiceSignal(message) {
    return voiceSignalingController.enqueueSignal(message);
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
          if (!acceptGatewayMessage(socket, message)) return;
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
            setGroupState({ selectedRoomId: message.voiceRoomId });
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
              if (participantId !== voiceClientId) clearVoiceActivityAnalyzer(participantId);
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
      setGroupState({ selectedGroupId: saved.groupId, selectedRoomId: room.id });
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
    voicePeerRecoveryController.clearAll();
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
    voiceActivityController.reset();
    voicePeerAudioHealth.clear();
    voicePeerRelayRecoveryAttempted.clear();
    voiceSignalingControllerQueues.clear();
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
    setSettingsState({ settingsSection: "voice" });
  }

  function watchSelectedRoomLive(streamId = selectedRoomLiveStream?.id) {
    const stream = selectedRoomLiveStreams.find((candidate) => candidate.id === streamId);
    if (!stream || stream.createdBy === user?.id) return;
    setGroupState({ watchingGroupLiveStreamId: stream.id });
  }

  function closeSelectedRoomLive() {
    setGroupState({ watchingGroupLiveStreamId: "" });
  }

  function privateLiveForParticipant(participant, roomId) {
    if (!participant?.userId || !roomId) return null;
    return groupLiveStreams.find((stream) => stream.visibility === "private" && stream.voiceRoomId === roomId && stream.createdBy === participant.userId) || null;
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
      if (broadcastStream === currentStream) setBroadcastState({ broadcastStream: fallbackStream });
      broadcastAudioWarning = status.status === "ended"
        ? "A captura de áudio da janela foi encerrada. A transmissão de vídeo continua ativa."
        : "A captura de áudio da janela falhou. A transmissão de vídeo continua ativa.";
      reportClientError("window_audio_capture_ended", new Error(broadcastAudioWarning), { status: status.status, processId: activeDisplayProcessId });
    } catch (error) {
      reportClientError("window_audio_fallback_error", error, { status: status.status, processId: activeDisplayProcessId });
    }
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

  async function rebuildBroadcastOutput({ cameraStream = broadcastCameraStream, microphoneStream = broadcastMicrophoneStream, sourceAudioTrack = broadcastSourceAudioTrack, cameraPosition = broadcastCameraPosition } = {}) {
    if (broadcastState !== "live" || broadcastMediaSwitching) return false;
    const previousStream = broadcastStream;
    const previousComposition = broadcastVideoComposition;
    const wasRelay = mediaMode === "relay" && await isRelayRecorderActive();
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
      setBroadcastState({ broadcastStream: nextStream });
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
      if (wasRelay && !(await isRelayRecorderActive()) && broadcastStream) {
        try { await startRelayRecorder(); } catch (relayError) { reportClientError("broadcast_relay_restart_error", relayError, { mediaMode }); }
      }
      nextStream?.getTracks?.().forEach((track) => track.stop());
      setBroadcastState({ broadcastError: error.message || "Não foi possível atualizar os dispositivos da transmissão." });
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
    setBroadcastState({ broadcastCameraDeviceId: requestedDeviceId, ...(!requestedDeviceId && broadcastSourceType === "screen" ? { broadcastCameraEnabled: false } : {}) });
    if (broadcastState !== "live") return;
    if (broadcastSourceType === "camera" && !requestedDeviceId) {
      setBroadcastState({ broadcastError: "A transmissão por câmera precisa manter uma câmera selecionada." });
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
        setBroadcastState({ broadcastCameraEnabled: previousCameraEnabled });
        return;
      }
      broadcastCameraStream = nextCameraStream;
      previousCameraStream?.getTracks?.().forEach((track) => track.stop());
      notice = requestedDeviceId ? "Câmera trocada sem interromper a live." : "Câmera removida sem interromper a live.";
    } catch (error) {
      nextCameraStream?.getTracks?.().forEach((track) => track.stop());
      setBroadcastState({ broadcastCameraDeviceId: previousCameraDeviceId, broadcastCameraEnabled: previousCameraEnabled, broadcastError: error.message || "Não foi possível trocar a câmera." });
      reportClientError("broadcast_camera_switch_error", error, { deviceId: requestedDeviceId });
    }
  }

  async function handleBroadcastCameraToggle(event) {
    const requestedEnabled = Boolean(event.currentTarget?.checked);
    const previousEnabled = broadcastCameraEnabled;
    const previousCameraStream = broadcastCameraStream;
    setBroadcastState({ broadcastCameraEnabled: requestedEnabled });
    if (broadcastState !== "live") return;
    let nextCameraStream = null;
    try {
      if (requestedEnabled) nextCameraStream = await captureBroadcastCameraStream(qualityProfiles[selectedQuality]);
      const applied = await rebuildBroadcastOutput({ cameraStream: nextCameraStream });
      if (!applied) {
        setBroadcastState({ broadcastCameraEnabled: previousEnabled });
        nextCameraStream?.getTracks?.().forEach((track) => track.stop());
        return;
      }
      broadcastCameraStream = nextCameraStream;
      previousCameraStream?.getTracks?.().forEach((track) => track.stop());
      notice = requestedEnabled ? "Câmera incluída na transmissão." : "Câmera removida da transmissão.";
    } catch (error) {
      setBroadcastState({ broadcastCameraEnabled: previousEnabled });
      nextCameraStream?.getTracks?.().forEach((track) => track.stop());
      setBroadcastState({ broadcastError: error.message || "Não foi possível atualizar a câmera." });
      reportClientError("broadcast_camera_toggle_error", error, { enabled: requestedEnabled, deviceId: broadcastCameraDeviceId });
    }
  }

  async function handleBroadcastCameraPositionChange(event) {
    const positions = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
    const requestedPosition = String(event.currentTarget?.value || "bottom-right");
    if (!positions.has(requestedPosition)) return;
    const previousPosition = broadcastCameraPosition;
    setBroadcastState({ broadcastCameraPosition: requestedPosition });
    if (broadcastState !== "live" || broadcastSourceType !== "screen" || !broadcastCameraStream) return;
    const applied = await rebuildBroadcastOutput({ cameraPosition: requestedPosition });
    if (!applied) {
      setBroadcastState({ broadcastCameraPosition: previousPosition });
      return;
    }
    notice = "Posição da câmera atualizada sem interromper a live.";
  }

  async function handleBroadcastMicrophoneChange(event) {
    if (event.currentTarget?.classList?.contains("broadcast-microphone-enabled")) {
      setBroadcastState({ broadcastMicrophoneEnabled: Boolean(event.currentTarget.checked) });
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
      setBroadcastState({ broadcastMicrophoneEnabled: Boolean(previousMicrophoneStream), broadcastError: error.message || "Não foi possível trocar o microfone." });
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
          if (!sourceAudioTrack) throw new Error(formatBroadcastMissingAudio({ isDesktop, displaySurface: broadcastDisplaySurface, selectionKind: broadcastSelectionKind }));
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
      setBroadcastState({ broadcastError: error.message || "Não foi possível trocar o áudio da transmissão." });
      return false;
    }
  }

  async function switchBroadcastSource() {
    if (broadcastState !== "live" || broadcastSourceType !== "screen" || broadcastSourceSwitching) return;
    broadcastSourceSwitching = true;
    setBroadcastState({ broadcastError: "" });
    broadcastAudioWarning = "";
    const previousStream = broadcastStream;
    const previousDisplayStream = broadcastDisplayStream;
    const previousCameraStream = broadcastCameraStream;
    const previousProcessId = activeDisplayProcessId;
    const previousAudioMode = audioMode;
    const wasRelay = mediaMode === "relay" && await isRelayRecorderActive();
    let capturedStream = null;
    let nextStream = null;
    try {
      const profile = qualityProfiles[selectedQuality];
      capturedStream = await captureDisplayStream(profile);
      const nextVideoTrack = capturedStream.getVideoTracks()[0];
      if (!nextVideoTrack) throw new Error("A nova fonte não forneceu vídeo.");
      const displaySurface = nextVideoTrack.getSettings?.().displaySurface;
      if (displaySurface === "monitor" || displaySurface === "screen") {
        setBroadcastState({ broadcastDisplaySurface: "screen" });
      } else if (displaySurface) {
        setBroadcastState({ broadcastDisplaySurface: "window" });
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
        throw new Error(formatBroadcastMissingAudio({ isDesktop, displaySurface: broadcastDisplaySurface, selectionKind: broadcastSelectionKind }));
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
      setBroadcastState({ broadcastStream: nextStream });
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
          setBroadcastState({ broadcastStream: restoredStream });
          broadcastDisplayStream = previousDisplayStream;
          broadcastSourceAudioTrack = restoredSourceAudioTrack;
          broadcastCameraStream = previousCameraStream;
          activeDisplayProcessId = previousProcessId;
          await attachBroadcastPreview();
          if (wasRelay) await startRelayRecorder();
        } catch (restoreError) {
          setBroadcastState({ broadcastError: restoreError.message || "Não foi possível restaurar a transmissão anterior." });
        }
      }
      if (error.name !== "NotAllowedError") setBroadcastState({ broadcastError: error.message || "Não foi possível trocar a fonte da transmissão." });
      return false;
    } finally {
      showDisplayPicker = false;
      displaySources = [];
      selectedDisplayProcessId = activeDisplayProcessId;
      broadcastSourceSwitching = false;
    }
  }

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

  onMount(async () => {
    detectViewerRoute();
    void loadMaintenance();
    const handleNavigationViewport = () => viewportController.sync();
    handleNavigationViewport();
    voiceReconnectSession = readVoiceReconnectSession();
    voiceReconnectVisible = Boolean(voiceReconnectSession);
    const handleWindowError = (event) => reportClientError("window_error", event.error || event.message, { filename: event.filename, line: event.lineno, column: event.colno });
    const handleUnhandledRejection = (event) => reportClientError("unhandled_rejection", event.reason);
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
    setVisualState({ theme: localStorage.getItem("mirante-theme") === "light" ? "light" : "dark" });
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
      setAuthState({ providers: availableProviders });
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

  const clientPollingController = createClientPollingController({
    getState: () => ({ user, isViewer, view, groupsWorkspaceOpen, selectedGroupId, directConversationId }),
    refreshGroupOverview: () => refreshGroupOverview({ includeMessages: false }).catch((error) => reportClientError("group_overview_refresh_error", error, { groupId: selectedGroupId })),
    loadStreams: () => loadStreams().catch(() => {}),
    loadNotifications: () => loadNotifications({ silent: true }).catch(() => {}),
    loadDirectConversationMessages: () => loadDirectConversationMessages({ silent: true }).catch(() => {}),
    loadMaintenance,
    updateMaintenanceCountdown,
  });
  clientPollingController.start();
  onDestroy(() => {
    unsubscribeNavigationState();
    unsubscribeAuthState();
    unsubscribeVisualState();
    unsubscribeViewerState();
    unsubscribeLiveState();
    unsubscribeBroadcastState();
    unsubscribeMaintenanceState();
    unsubscribeNotificationState();
    unsubscribeSocialState();
    unsubscribeSettingsState();
    unsubscribeGroupState();
    unsubscribeApplicationCommandState();
    unsubscribeMessageState();
    unsubscribeDirectState();
    clearBroadcastCaptureRecoveryTimer();
    clearVoiceSpeakingPublishTimer();
    stopVoiceTest();
    stopVoiceInputStream(voiceLocalStream);
    clientPollingController.stop();
    groupEventRuntime.close();
    voiceActivityController.reset();
    voiceQualityController.stop();
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
  {#if loading}
    <div class="grid min-h-screen place-items-center"><div class="text-sm text-slate-400">Abrindo seu espaço…</div></div>
  {:else if isViewer || view === "viewer"}
    <div class:light={!isDark} class="mirante-shell viewer-shell" style={visualStyle}>
      <Viewer roomId={viewerRoomId} streamPath={viewerStreamPath} streamData={viewerStream} initialMediaMode={mediaMode} initialRtcConfig={rtcConfig} appVersion={runtimeVersion()} isDark={isDark} currentUser={user} onToggleTheme={toggleTheme} onBack={returnFromViewer} onNavigate={navigateFromViewer} />
    </div>
  {:else if !user}
    <AuthPage
      {authMode}
      {authError}
      {loginUsername}
      {loginPassword}
      {registerDisplayName}
      {registerUsername}
      {registerPassword}
      {registerLegalAccepted}
      {isDark}
      {providers}
      {authBusy}
      onStateChange={setAuthState}
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
      onNavigateHome={() => setNavigationState({ view: "home" })}
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
        onClose={() => setNavigationState({ showGlobalSidebar: false })}
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
          onOpenGroup={(group) => { setGroupState({ selectedGroupId: group.id }); loadGroup(group.id); setGroupsView(); }}
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
          {socialSearchOpen}
          {socialRequestsOpen}
          {socialSearchQuery}
          {social}
          {socialError}
          {socialSearchBusy}
          {socialSearchResults}
          {socialActionId}
          onStateChange={setSocialState}
          onSearchUsers={searchSocialUsers}
          onOpenDirectConversation={openDirectConversationWithUser}
          onCancelFriendRequest={cancelFriendRequest}
          onSendFriendRequest={sendFriendRequest}
          onToggleFollowUser={toggleFollowUser}
          onToggleBlockUser={toggleBlockUser}
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
          directMessageDraft={directMessageDraft}
          on:directMessageDraft={(event) => setDirectState({ directMessageDraft: event.detail })}
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
          onToggleNavigation={() => { groupNavigationCollapsed = !groupNavigationCollapsed; setNavigationState({ showMobileChannels: false }); }}
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
        <section class="chat-workspace"><GroupChatHeader {selectedGroup} {selectedGroupId} {groupLoading} {selectedRoom} {showMobileChannels} {showMobileMembers} onToggleChannels={() => setNavigationState({ showMobileChannels: !showMobileChannels, showMobileMembers: false })} onToggleMembers={() => setNavigationState({ showMobileMembers: !showMobileMembers, showMobileChannels: false })} onCreateChannel={() => { showRoomDialog = true; }} onSearchMessages={openGroupMessageSearch} />{#if groupLoading}<div class="workspace-loading"><span></span><span></span><span></span></div>{:else if selectedRoom?.kind === "voice"}{#if GroupVoiceWorkspace}<svelte:component this={GroupVoiceWorkspace} {selectedRoomLiveStreams} currentUserId={user?.id} watchingStreamId={watchingGroupLiveStreamId} streamUrl={streamViewerUrl} {voiceLobbyParticipants} {voiceState} {voiceRoomId} {selectedRoom} {activeVoiceRoom} {voiceError} onWatchSelectedRoomLive={watchSelectedRoomLive} onCloseSelectedRoomLive={closeSelectedRoomLive} onIsVoiceParticipantSpeaking={isVoiceParticipantSpeaking} onVoiceParticipantDisplayName={voiceParticipantDisplayName} onJoinVoiceRoom={joinVoiceRoom} onLeaveVoiceRoom={leaveVoiceRoom} />{:else}<div class="workspace-loading"><span></span><span></span><span></span></div>{/if}{:else if GroupTextChatWorkspace}<svelte:component this={GroupTextChatWorkspace} bind:messageComposerInput messageDraft={messageDraft} on:messageDraft={(event) => setMessageState({ messageDraft: event.detail })} {selectedRoom} {roomMessages} {groupApplicationCommands} currentUserId={user?.id} {editingMessageId} editingMessageDraft={editingMessageDraft} on:editingMessageDraft={(event) => setMessageState({ editingMessageDraft: event.detail })} {mentionSuggestions} {mentionActiveIndex} {messageAttachments} onSendMessage={sendMessage} onUpdateMentionSuggestions={updateMentionSuggestions} onHandleMessageKeydown={handleMessageKeydown} onInsertMention={insertMention} onStartEditMessage={startEditMessage} onCancelEditMessage={cancelEditMessage} onSaveEditMessage={saveEditMessage} onDeleteMessage={deleteMessage} onOpenThread={openGroupThread} onAddMessageAttachments={addMessageAttachments} onRemoveMessageAttachment={removeMessageAttachment} onSubmitBotComponent={submitBotComponent} onSubmitBotModal={submitBotModal} onStartApplicationInteraction={startApplicationInteraction} />{:else}<div class="workspace-loading"><span></span><span></span><span></span></div>{/if}</section>
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
        {#if SettingsPage}
        <svelte:component this={SettingsPage}
          bind:settingsPageElement
          {settingsSection}
          {settingsTab}
          {selectedGroupId}
          {user}
          {settingsBusy}
          {settingsError}
          onSelectSection={selectSettingsSection}
          onLoadGroupAdministration={loadGroupAdministration}
          onBack={() => setNavigationState({ view: settingsReturnView })}
          onSelectTab={(tab) => setSettingsState({ settingsTab: tab })}
          channelDisplayName={channelDisplayName}
          on:channelDisplayName={(event) => setSettingsState({ channelDisplayName: event.detail })}
          {channelAvatarData}
          {gameOptions}
          {channelGames}
          {channelError}
          onSaveChannelProfile={saveChannelProfile}
          onChannelAvatarChange={handleChannelAvatarChange}
          onClearChannelAvatar={clearChannelAvatar}
          onToggleChannelGame={toggleChannelGame}
          {settingsAvatarData}
          settingsDisplayName={settingsDisplayName}
          on:settingsDisplayName={(event) => setSettingsState({ settingsDisplayName: event.detail })}
          {avatarError}
          theme={theme}
          on:theme={(event) => setVisualState({ theme: event.detail })}
          bind:selectedQuality
          bind:audioMode
          buttonColor={buttonColor}
          on:buttonColor={(event) => setVisualState({ buttonColor: event.detail })}
          inputBackgroundColor={inputBackgroundColor}
          on:inputBackgroundColor={(event) => setVisualState({ inputBackgroundColor: event.detail })}
          backgroundColor={backgroundColor}
          on:backgroundColor={(event) => setVisualState({ backgroundColor: event.detail })}
          {providers}
          {selectedGroup}
          bind:groupSettingsName
          onSaveProfile={saveProfile}
          onAvatarChange={handleAvatarChange}
          onClearAvatar={clearAvatar}
          onSavePreferences={savePreferences}
          onSaveGroupSettings={saveGroupSettings}
          {ProfileSettingsExtras}
          {isDesktop}
          {preferencesResetBusy}
          {preferencesResetConfirm}
          {launchAtLogin}
          {launchAtLoginBusy}
          {launchAtLoginError}
          {hardwareAccelerationMode}
          {hardwareAccelerationBusy}
          {hardwareAccelerationError}
          onTogglePreferencesResetConfirm={() => setSettingsState({ preferencesResetConfirm: !preferencesResetConfirm })}
          onResetPreferences={resetPreferencesToDefaults}
          onToggleLaunchAtLogin={toggleLaunchAtLogin}
          onSetHardwareAcceleration={setHardwareAcceleration}
          {VoiceSettingsPanel}
          {voiceNoiseSuppressionStatus}
          {voiceNativeProcessingDetails}
          {voiceInputProfile}
          {voiceAdvancedOptions}
          {voiceTestRunning}
          {voiceTestLevel}
          {voiceTestError}
          {voiceTestSpeakerStatus}
          {voiceTestStatus}
          {voiceDevicesBusy}
          bind:selectedInputDeviceId
          bind:selectedOutputDeviceId
          {audioInputDevices}
          {audioOutputDevices}
          {voiceMicrophoneVolume}
          {voiceOutputVolume}
          {pushToTalkEnabled}
          {pushToTalkCapturing}
          {pushToTalkActive}
          {pushToTalkKey}
          {desktopPushToTalkGlobal}
          {muteShortcutCapturing}
          {muteShortcut}
          {desktopMuteShortcutGlobal}
          {voiceAdvancedOpen}
          {soundPreferences}
          {voiceDevicesError}
          {voiceSensitivityAuto}
          {voiceSensitivity}
          onLoadAudioDevices={loadAudioDevices}
          onApplyVoiceInputDevice={applyVoiceInputDevice}
          onApplyVoiceOutputDevice={applyVoiceOutputDevice}
          onSetVoiceMicrophoneVolume={setVoiceMicrophoneVolume}
          onSetVoiceOutputVolume={setVoiceOutputVolume}
          onApplyVoiceInputProfile={applyVoiceInputProfile}
          onTogglePushToTalk={togglePushToTalk}
          onStartPushToTalkCapture={startPushToTalkCapture}
          onClearPushToTalkKey={clearPushToTalkKey}
          onStartMuteShortcutCapture={startMuteShortcutCapture}
          onClearMuteShortcut={clearMuteShortcut}
          onToggleVoiceAdvanced={toggleVoiceAdvanced}
          onUpdateVoiceAdvancedOption={updateVoiceAdvancedOption}
          onHandleVoiceSoundEffectsChange={handleVoiceSoundEffectsChange}
          onHandleSoundVolumeChange={handleSoundVolumeChange}
          onPreviewVoiceSound={previewVoiceSound}
          onHandleSoundPreferenceChange={handleSoundPreferenceChange}
          onUpdateVoiceSensitivityAuto={updateVoiceSensitivityAuto}
          onUpdateVoiceSensitivity={updateVoiceSensitivity}
          onStartVoiceTest={startVoiceTest}
          onStopVoiceTest={stopVoiceTest}
          onTestVoiceSpeaker={testVoiceSpeaker}
          {pushToTalkLabel}
          {shortcutLabel}
          {liveNotificationScopes}
          onSetNotificationScope={setLiveNotificationScope}
          {groupRoles}
          {selectedRole}
          bind:selectedRoleId
          {groupMembers}
          {rolePermissionOptions}
          {filteredRoleMembers}
          {roleOrderSaving}
          {draggedRoleId}
          {dragOverRoleId}
          bind:newRoleName
          bind:newRoleColor
          bind:roleEditName
          bind:roleEditColor
          {roleEditBusy}
          bind:roleMemberSearchQuery
          {roleMemberActionId}
          onCreateRole={createGroupRole}
          onStartRoleDrag={startRoleDrag}
          onRoleDragOver={handleRoleDragOver}
          onDropRole={dropRole}
          onEndRoleDrag={endRoleDrag}
          onMoveRole={moveRole}
          onDeleteRole={deleteGroupRole}
          onSaveRoleDetails={saveGroupRoleDetails}
          onUpdateRolePermission={updateRolePermission}
          onSetRoleMember={setRoleMember}
          {GroupChannelPermissionsSettings}
          {GroupAuditLogSettings}
          {rooms}
          bind:selectedRoomPermissionId
          {groupRoomPermissions}
          {roomPermissionBusyKey}
          {activeGroupInvites}
          {groupInviteLink}
          {groupInviteCreating}
          {groupInviteBusyId}
          {groupJoinRequests}
          {groupJoinActionId}
          {groupAuditEntries}
          {groupAuditLoading}
          {api}
          {groupAdminError}
          onLoadRoom={loadGroupRoomPermissions}
          onUpdatePermission={updateGroupRoomPermission}
          onResetPermission={resetGroupRoomPermission}
          onCreateInvite={createGroupInvite}
          onCopyInvite={copyGroupInvite}
          onDeleteInvite={deleteGroupInvite}
          onRespondJoinRequest={respondToGroupJoinRequest}
          onModerationComplete={refreshGroupAfterModeration}
        />
        {:else}
          <div class="workspace-loading"><span></span><span></span><span></span></div>
        {/if}
      {:else if view === "multistream"}
        {#if MultistreamPage}
          <svelte:component
            this={MultistreamPage}
            {streams}
            {selectedStreams}
            onClose={closeMultistream}
            onSelectLive={() => selectView("live")}
            onToggleStream={toggleStream}
          />
        {:else}
          <div class="workspace-loading"><span></span><span></span><span></span></div>
        {/if}
       {:else}
        <LivePage
          {streams}
          {selectedStreams}
          {followingOnly}
          {socialActionId}
          onToggleFollowing={() => { setLiveState({ followingOnly: !followingOnly }); void loadStreams().catch((error) => { notice = error.message; }); }}
          onOpenMultistream={openMultistream}
          onStreamCardClick={handleStreamCardClick}
          onStreamCardKeydown={handleStreamCardKeydown}
          onToggleStream={toggleStream}
          onOpenStreamViewer={openStreamViewer}
          onToggleFollowStream={toggleFollowStream}
        />
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
  {#if ContextMenus}
    <svelte:component
      this={ContextMenus}
      {groupContextMenu}
      {roomContextMenu}
      {voiceContextMenu}
      {profilePreview}
      {selectedGroupId}
      {currentGroupMember}
      {selectedGroup}
      {user}
      {socialActionId}
      {voiceVolumes}
      {canMoveVoiceMembers}
      {voiceRoomId}
      {voiceRooms}
      {activeVoiceRoom}
      onGroupContextMenuKeydown={handleGroupContextMenuKeydown}
      onRunGroupContextAction={runGroupContextAction}
      onRoomContextMenuKeydown={handleRoomContextMenuKeydown}
      onRunRoomContextAction={runRoomContextAction}
      onVoiceContextMenuKeydown={handleVoiceContextMenuKeydown}
      onVoiceParticipantDisplayName={voiceParticipantDisplayName}
      onShowVoiceProfile={showVoiceProfile}
      onSendFriendRequest={sendFriendRequestFromContext}
      onOpenDirectConversation={openDirectConversationWithUser}
      onMentionVoiceParticipant={mentionVoiceParticipant}
      onSetVoiceVolume={setVoiceVolume}
      onToggleContextParticipantServerMute={toggleContextParticipantServerMute}
      onToggleVoiceParticipantLocalMute={toggleVoiceParticipantLocalMute}
      onIsVoiceParticipantLocallyMuted={isVoiceParticipantLocallyMuted}
      onMoveContextParticipant={moveContextParticipant}
      onDisconnectContextParticipant={disconnectContextParticipant}
      onCloseProfilePreview={() => profilePreview = null}
    />
  {/if}
  {#if GroupDialogs}
    <svelte:component
      this={GroupDialogs}
      {showInviteDialog}
      {showGroupSearchDialog}
      {showLeaveGroupDialog}
      {showDeleteRoomDialog}
      {showDeleteGroupDialog}
      {showGroupDialog}
      {showRoomDialog}
      {selectedGroup}
      {deleteRoomTarget}
      {inviteSearchQuery}
      {inviteSearchBusy}
      {inviteSearchError}
      {inviteSearchResults}
      {inviteActionId}
      {groupInviteCreating}
      {groupInviteLink}
      {groupSearchQuery}
      {groupSearchBusy}
      {groupSearchError}
      {groupSearchResults}
      {groupJoinActionId}
      {leaveGroupBusy}
      {leaveGroupError}
      {deleteRoomBusy}
      {deleteRoomError}
      {deleteGroupBusy}
      {deleteGroupError}
      {groupName}
      {roomDialogMode}
      {roomName}
      {roomKind}
      {roomMaxParticipants}
      onCloseInvite={() => showInviteDialog = false}
      onInviteSearchQueryChange={(value) => inviteSearchQuery = value}
      onSearchUsers={searchUsers}
      onInviteUser={inviteUser}
      onCreateGroupInvite={createGroupInvite}
      onCopyGroupInvite={copyGroupInvite}
      onCloseGroupSearch={() => showGroupSearchDialog = false}
      onGroupSearchQueryChange={(value) => groupSearchQuery = value}
      onSearchGroups={searchGroups}
      onRequestGroupEntry={requestGroupEntry}
      onCloseLeaveGroup={() => showLeaveGroupDialog = false}
      onLeaveSelectedGroup={leaveSelectedGroup}
      onCloseDeleteRoom={() => showDeleteRoomDialog = false}
      onConfirmDeleteGroupRoom={confirmDeleteGroupRoom}
      onCloseDeleteGroup={() => showDeleteGroupDialog = false}
      onDeleteSelectedGroup={deleteSelectedGroup}
      onCloseGroup={() => showGroupDialog = false}
      onGroupNameChange={(value) => groupName = value}
      onCreateGroup={createGroup}
      onCloseRoom={() => showRoomDialog = false}
      onRoomNameChange={(value) => roomName = value}
      onRoomKindChange={(value) => roomKind = value}
      onRoomMaxParticipantsChange={(value) => roomMaxParticipants = value}
      onCreateRoom={createRoom}
    />
  {:else if showInviteDialog || showGroupSearchDialog || showLeaveGroupDialog || showDeleteRoomDialog || showDeleteGroupDialog || showGroupDialog || showRoomDialog}
    <div class="workspace-loading" role="status" aria-label="Carregando diálogos"><span></span><span></span><span></span></div>
  {/if}
  {#if showGroupMessageSearch}
    {#if GroupMessageSearchDialog}
      <svelte:component
        this={GroupMessageSearchDialog}
        query={groupMessageSearchQuery}
        results={groupMessageSearchResults}
        busy={groupMessageSearchBusy}
        error={groupMessageSearchError}
        {rooms}
        onQueryChange={(value) => setMessageState({ groupMessageSearchQuery: value })}
        onSearch={searchGroupMessages}
        onClose={() => showGroupMessageSearch = false}
        onSelect={openGroupMessageSearchResult}
      />
    {:else}
      <div class="workspace-loading" role="status" aria-label="Carregando busca de mensagens"><span></span><span></span><span></span></div>
    {/if}
  {/if}
  {#if activeGroupThread}
    {#if GroupThreadDialog}
      <svelte:component
        this={GroupThreadDialog}
        parent={activeGroupThread}
        messages={groupThreadMessages}
        currentUserId={user?.id}
        draft={groupThreadDraft}
        busy={groupThreadBusy}
        error={groupThreadError}
        onDraftChange={updateGroupThreadDraft}
        onSend={sendGroupThreadMessage}
        onClose={closeGroupThread}
        onStartEdit={startEditMessage}
        onDelete={deleteMessage}
      />
    {:else}
      <div class="workspace-loading" role="status" aria-label="Carregando respostas"><span></span><span></span><span></span></div>
    {/if}
  {/if}
  {#if BroadcastDialogs}
    <svelte:component
      this={BroadcastDialogs}
      {isDesktop}
      {showPublicBroadcastSetup}
      {showPublicBroadcastReview}
      {showBroadcastVisibilityDialog}
      {showDisplayPicker}
      {showBroadcastAudioPicker}
      {publicBroadcastTitle}
      {publicBroadcastSourceKind}
      {publicBroadcastMicrophoneEnabled}
      {publicBroadcastCameraEnabled}
      {publicBroadcastCameraDeviceId}
      {publicBroadcastQuality}
      {selectedInputDeviceId}
      {audioInputDevices}
      {cameraInputDevices}
      {broadcastError}
      {broadcastTitle}
      {broadcastSelectionKind}
      {broadcastSelectedSourceName}
      {broadcastMicrophoneEnabled}
      {broadcastCameraEnabled}
      {qualityProfiles}
      {selectedQuality}
      {broadcastVisibility}
      {displayPickerAvailability}
      {displaySourceFilter}
      {displaySourceGroups}
      {broadcastAudioSourceCandidates}
      {publicBroadcastAudioLabel}
      {publicBroadcastSourceLabel}
      onPublicBroadcastTitleChange={(value) => setBroadcastState({ publicBroadcastTitle: value })}
      onPublicBroadcastSourceKindChange={(value) => setBroadcastState({ publicBroadcastSourceKind: value })}
      onPublicBroadcastMicrophoneChange={(value) => setBroadcastState({ publicBroadcastMicrophoneEnabled: value })}
      onPublicBroadcastCameraChange={(value) => setBroadcastState({ publicBroadcastCameraEnabled: value })}
      onPublicBroadcastCameraDeviceChange={(value) => setBroadcastState({ publicBroadcastCameraDeviceId: value })}
      onPublicBroadcastQualityChange={(value) => setBroadcastState({ publicBroadcastQuality: value })}
      onSelectedInputDeviceChange={(value) => selectedInputDeviceId = value}
      onCancelPublicBroadcastSetup={cancelPublicBroadcastSetup}
      onConfirmPublicBroadcastSetup={confirmPublicBroadcastSetup}
      onCancelPublicBroadcastReview={cancelPublicBroadcastReview}
      onConfirmPublicBroadcastReview={confirmPublicBroadcastReview}
      onCancelBroadcastVisibility={cancelBroadcastVisibility}
      onBroadcastVisibilityChange={(value) => setBroadcastState({ broadcastVisibility: value })}
      onConfirmBroadcastVisibility={confirmBroadcastVisibility}
      onCancelDisplayPicker={cancelDisplayPicker}
      onDisplaySourceFilterChange={(value) => displaySourceFilter = value}
      onSelectDisplaySource={selectDisplaySource}
      onCancelBroadcastAudioPicker={cancelBroadcastAudioPicker}
      onSelectBroadcastAudioSource={selectBroadcastAudioSource}
      onSkipBroadcastAudioSource={skipBroadcastAudioSource}
    />
  {:else if showPublicBroadcastSetup || showPublicBroadcastReview || showBroadcastVisibilityDialog || showDisplayPicker || showBroadcastAudioPicker}
    <div class="workspace-loading" role="status" aria-label="Carregando controles de transmissão"><span></span><span></span><span></span></div>
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
