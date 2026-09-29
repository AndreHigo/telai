<script>
  import { createEventDispatcher } from "svelte";
  import SettingsCategoryNav from "./SettingsCategoryNav.svelte";
  import SettingsHeading from "./SettingsHeading.svelte";
  import ChannelProfileSettings from "./ChannelProfileSettings.svelte";
  import SettingsInternalNav from "./SettingsInternalNav.svelte";
  import AccountProfileSettings from "./AccountProfileSettings.svelte";
  import PreferencesSettings from "./PreferencesSettings.svelte";
  import LinkedAccountsSettings from "./LinkedAccountsSettings.svelte";
  import GroupAdministrationSettings from "./GroupAdministrationSettings.svelte";
  import GroupRolePermissionsPanel from "./GroupRolePermissionsPanel.svelte";
  import GroupAccessSettingsPanel from "./GroupAccessSettingsPanel.svelte";
  import NotificationPreferencesSettings from "./NotificationPreferencesSettings.svelte";
  import ApplicationsSettings from "./ApplicationsSettings.svelte";
  import AccountPrivacy from "../../AccountPrivacy.svelte";
  import WorkspaceLoading from "../../app/WorkspaceLoading.svelte";

  const dispatch = createEventDispatcher();

  export let settingsPageElement;
  export let settingsSection = "profile";
  export let settingsTab = "user";
  export let selectedGroupId = "";
  export let user = null;
  export let settingsBusy = false;
  export let settingsError = "";
  export let onSelectSection = () => {};
  export let onLoadGroupAdministration = () => {};
  export let onBack = () => {};
  export let onSelectTab = () => {};

  export let channelDisplayName = "";
  export let channelAvatarData = "";
  export let gameOptions = [];
  export let channelGames = [];
  export let channelError = "";
  export let onSaveChannelProfile = () => {};
  export let onChannelAvatarChange = () => {};
  export let onClearChannelAvatar = () => {};
  export let onToggleChannelGame = () => {};

  export let settingsAvatarData = "";
  export let settingsDisplayName = "";
  export let avatarError = "";
  export let theme = "dark";
  export let selectedQuality = "high";
  export let audioMode = "standard";
  export let buttonColor = "";
  export let inputBackgroundColor = "";
  export let backgroundColor = "";
  export let providers = [];
  export let selectedGroup = null;
  export let groupSettingsName = "";
  export let onSaveProfile = () => {};
  export let onAvatarChange = () => {};
  export let onClearAvatar = () => {};
  export let onSavePreferences = () => {};
  export let onSaveGroupSettings = () => {};

  export let ProfileSettingsExtras = null;
  export let isDesktop = false;
  export let preferencesResetBusy = false;
  export let preferencesResetConfirm = false;
  export let launchAtLogin = false;
  export let launchAtLoginBusy = false;
  export let launchAtLoginError = "";
  export let hardwareAccelerationMode = "default";
  export let hardwareAccelerationBusy = false;
  export let hardwareAccelerationError = "";
  export let onTogglePreferencesResetConfirm = () => {};
  export let onResetPreferences = () => {};
  export let onToggleLaunchAtLogin = () => {};
  export let onSetHardwareAcceleration = () => {};

  export let VoiceSettingsPanel = null;
  export let voiceNoiseSuppressionStatus = "idle";
  export let voiceNativeProcessingDetails = null;
  export let voiceInputProfile = "standard";
  export let voiceAdvancedOptions = {};
  export let voiceTestRunning = false;
  export let voiceTestLevel = 0;
  export let voiceTestError = "";
  export let voiceTestSpeakerStatus = "idle";
  export let voiceTestStatus = "idle";
  export let voiceDevicesBusy = false;
  export let selectedInputDeviceId = "default";
  export let selectedOutputDeviceId = "default";
  export let audioInputDevices = [];
  export let audioOutputDevices = [];
  export let voiceMicrophoneVolume = 100;
  export let voiceOutputVolume = 100;
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
  export let pushToTalkLabel = "";
  export let shortcutLabel = "";
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

  export let liveNotificationScopes = [];
  export let onSetNotificationScope = () => {};

  export let groupRoles = [];
  export let selectedRole = null;
  export let selectedRoleId = "";
  export let groupMembers = [];
  export let rolePermissionOptions = [];
  export let filteredRoleMembers = [];
  export let roleOrderSaving = false;
  export let draggedRoleId = "";
  export let dragOverRoleId = "";
  export let newRoleName = "";
  export let newRoleColor = "";
  export let roleEditName = "";
  export let roleEditColor = "";
  export let roleEditBusy = false;
  export let roleMemberSearchQuery = "";
  export let roleMemberActionId = "";
  export let onCreateRole = () => {};
  export let onStartRoleDrag = () => {};
  export let onRoleDragOver = () => {};
  export let onDropRole = () => {};
  export let onEndRoleDrag = () => {};
  export let onMoveRole = () => {};
  export let onDeleteRole = () => {};
  export let onSaveRoleDetails = () => {};
  export let onUpdateRolePermission = () => {};
  export let onSetRoleMember = () => {};

  export let GroupChannelPermissionsSettings = null;
  export let GroupAuditLogSettings = null;
  export let rooms = [];
  export let selectedRoomPermissionId = "";
  export let groupRoomPermissions = [];
  export let roomPermissionBusyKey = "";
  export let activeGroupInvites = [];
  export let groupInviteLink = "";
  export let groupInviteCreating = false;
  export let groupInviteBusyId = "";
  export let groupJoinRequests = [];
  export let groupJoinActionId = "";
  export let groupAuditEntries = [];
  export let groupAuditLoading = false;
  export let api = () => {};
  export let groupAdminError = "";
  export let onLoadRoom = () => {};
  export let onUpdatePermission = () => {};
  export let onResetPermission = () => {};
  export let onCreateInvite = () => {};
  export let onCopyInvite = () => {};
  export let onDeleteInvite = () => {};
  export let onRespondJoinRequest = () => {};
  export let onModerationComplete = () => {};
</script>

<section bind:this={settingsPageElement} class="settings-page window-page" class:settings-profile={settingsSection === "profile"} class:settings-channel={settingsSection === "channel"} class:settings-voice={settingsSection === "voice"} class:settings-group={settingsSection === "group"} class:settings-notifications={settingsSection === "notifications"} class:settings-applications={settingsSection === "applications"}>
  <SettingsCategoryNav
    {settingsSection}
    {selectedGroupId}
    onSelectSection={onSelectSection}
    onLoadGroupAdministration={onLoadGroupAdministration}
  />
  <SettingsHeading onBack={onBack} />
  {#if settingsSection === "channel"}
    <ChannelProfileSettings
      {channelDisplayName}
      on:channelDisplayName={(event) => {
        channelDisplayName = event.detail;
        dispatch("channelDisplayName", event.detail);
      }}
      {channelAvatarData}
      {gameOptions}
      {channelGames}
      {channelError}
      {settingsBusy}
      onSave={onSaveChannelProfile}
      onAvatarChange={onChannelAvatarChange}
      onClearAvatar={onClearChannelAvatar}
      onToggleChannelGame={onToggleChannelGame}
    />
  {/if}
  <div class="settings-layout">
    <SettingsInternalNav {settingsTab} {selectedGroupId} onSelectTab={onSelectTab} />
    <div class="settings-content">
      {#if settingsTab === "user"}
        <AccountProfileSettings
          {settingsBusy}
          {user}
          {settingsAvatarData}
          {settingsDisplayName}
          on:settingsDisplayName={(event) => {
            settingsDisplayName = event.detail;
            dispatch("settingsDisplayName", event.detail);
          }}
          {avatarError}
          onSave={onSaveProfile}
          onAvatarChange={onAvatarChange}
          onClearAvatar={onClearAvatar}
        />
        <PreferencesSettings
          {settingsBusy}
          bind:theme
          bind:selectedQuality
          bind:audioMode
          bind:buttonColor
          bind:inputBackgroundColor
          bind:backgroundColor
          on:theme={(event) => dispatch("theme", event.detail)}
          on:buttonColor={(event) => dispatch("buttonColor", event.detail)}
          on:inputBackgroundColor={(event) => dispatch("inputBackgroundColor", event.detail)}
          on:backgroundColor={(event) => dispatch("backgroundColor", event.detail)}
          onSave={onSavePreferences}
        />
        <LinkedAccountsSettings {user} {providers} />
      {:else}
        <GroupAdministrationSettings {selectedGroup} {settingsBusy} bind:groupSettingsName onSave={onSaveGroupSettings} />
      {/if}
      {#if settingsError}<p class="settings-error" role="alert">{settingsError}</p>{/if}
    </div>
  </div>

  {#if ProfileSettingsExtras}
    <svelte:component this={ProfileSettingsExtras}
      {settingsSection}
      {settingsTab}
      {isDesktop}
      {settingsBusy}
      {preferencesResetBusy}
      {preferencesResetConfirm}
      {launchAtLogin}
      {launchAtLoginBusy}
      {launchAtLoginError}
      {hardwareAccelerationMode}
      {hardwareAccelerationBusy}
      {hardwareAccelerationError}
      onTogglePreferencesResetConfirm={onTogglePreferencesResetConfirm}
      onResetPreferences={onResetPreferences}
      onToggleLaunchAtLogin={onToggleLaunchAtLogin}
      onSetHardwareAcceleration={onSetHardwareAcceleration}
    />
  {:else}
    <WorkspaceLoading label="Carregando preferências" />
  {/if}

  {#if settingsTab === "user" && settingsSection === "profile"}<AccountPrivacy {user} />{/if}
  {#if settingsSection === "voice"}
    {#if VoiceSettingsPanel}
      <svelte:component this={VoiceSettingsPanel}
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
        onLoadAudioDevices={onLoadAudioDevices}
        onApplyVoiceInputDevice={onApplyVoiceInputDevice}
        onApplyVoiceOutputDevice={onApplyVoiceOutputDevice}
        onSetVoiceMicrophoneVolume={onSetVoiceMicrophoneVolume}
        onSetVoiceOutputVolume={onSetVoiceOutputVolume}
        onApplyVoiceInputProfile={onApplyVoiceInputProfile}
        onTogglePushToTalk={onTogglePushToTalk}
        onStartPushToTalkCapture={onStartPushToTalkCapture}
        onClearPushToTalkKey={onClearPushToTalkKey}
        onStartMuteShortcutCapture={onStartMuteShortcutCapture}
        onClearMuteShortcut={onClearMuteShortcut}
        onToggleVoiceAdvanced={onToggleVoiceAdvanced}
        onUpdateVoiceAdvancedOption={onUpdateVoiceAdvancedOption}
        onHandleVoiceSoundEffectsChange={onHandleVoiceSoundEffectsChange}
        onHandleSoundVolumeChange={onHandleSoundVolumeChange}
        onPreviewVoiceSound={onPreviewVoiceSound}
        onHandleSoundPreferenceChange={onHandleSoundPreferenceChange}
        onUpdateVoiceSensitivityAuto={onUpdateVoiceSensitivityAuto}
        onUpdateVoiceSensitivity={onUpdateVoiceSensitivity}
        onStartVoiceTest={onStartVoiceTest}
        onStopVoiceTest={onStopVoiceTest}
        onTestVoiceSpeaker={onTestVoiceSpeaker}
        {pushToTalkLabel}
        {shortcutLabel}
      />
    {:else}
      <WorkspaceLoading label="Carregando configurações de voz" />
    {/if}
  {/if}

  {#if settingsSection === "notifications"}
    <NotificationPreferencesSettings {settingsBusy} {liveNotificationScopes} onSave={onSavePreferences} onSetScope={onSetNotificationScope} />
  {/if}

  {#if settingsSection === "applications"}
    <ApplicationsSettings {api} />
  {/if}

  {#if settingsTab === "group" && selectedGroupId}
    <GroupRolePermissionsPanel
      {selectedGroup}
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
      onCreateRole={onCreateRole}
      onStartRoleDrag={onStartRoleDrag}
      onRoleDragOver={onRoleDragOver}
      onDropRole={onDropRole}
      onEndRoleDrag={onEndRoleDrag}
      onMoveRole={onMoveRole}
      onDeleteRole={onDeleteRole}
      onSaveRoleDetails={onSaveRoleDetails}
      onUpdateRolePermission={onUpdateRolePermission}
      onSetRoleMember={onSetRoleMember}
    />
    <GroupAccessSettingsPanel
      {selectedGroup}
      {GroupChannelPermissionsSettings}
      {GroupAuditLogSettings}
      {rooms}
      bind:selectedRoomPermissionId
      {groupRoles}
      {groupRoomPermissions}
      {roomPermissionBusyKey}
      {activeGroupInvites}
      {groupInviteLink}
      {groupInviteCreating}
      {groupInviteBusyId}
      {groupMembers}
      {user}
      {groupJoinRequests}
      {groupJoinActionId}
      {groupAuditEntries}
      {groupAuditLoading}
      {api}
      {selectedGroupId}
      {groupAdminError}
      onLoadRoom={onLoadRoom}
      onUpdatePermission={onUpdatePermission}
      onResetPermission={onResetPermission}
      onCreateInvite={onCreateInvite}
      onCopyInvite={onCopyInvite}
      onDeleteInvite={onDeleteInvite}
      onRespondJoinRequest={onRespondJoinRequest}
      onModerationComplete={onModerationComplete}
    />
  {/if}
</section>
