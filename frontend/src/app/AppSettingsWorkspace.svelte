<script>
  export let state = {};
  export let actions = {};
  export let settingsPageElement = null;
  export let selectedQuality = "balanced";
  export let audioMode = "voice-optimized";
  export let groupSettingsName = "";
  export let selectedInputDeviceId = "default";
  export let selectedOutputDeviceId = "default";
  export let selectedRoleId = "";
  export let newRoleName = "";
  export let newRoleColor = "#6d5dfc";
  export let roleEditName = "";
  export let roleEditColor = "#6d5dfc";
  export let roleMemberSearchQuery = "";
  export let selectedRoomPermissionId = "";
</script>

{#if state.SettingsPage}
  <svelte:component
    this={state.SettingsPage}
    bind:settingsPageElement
    settingsSection={state.settingsSection}
    settingsTab={state.settingsTab}
    selectedGroupId={state.selectedGroupId}
    user={state.user}
    settingsBusy={state.settingsBusy}
    settingsError={state.settingsError}
    onSelectSection={actions.selectSettingsSection}
    onLoadGroupAdministration={actions.loadGroupAdministration}
    onBack={actions.back}
    onSelectTab={actions.selectTab}
    channelDisplayName={state.channelDisplayName}
    on:channelDisplayName={actions.setChannelDisplayName}
    channelAvatarData={state.channelAvatarData}
    gameOptions={state.gameOptions}
    channelGames={state.channelGames}
    channelError={state.channelError}
    onSaveChannelProfile={actions.saveChannelProfile}
    onChannelAvatarChange={actions.handleChannelAvatarChange}
    onClearChannelAvatar={actions.clearChannelAvatar}
    onToggleChannelGame={actions.toggleChannelGame}
    settingsAvatarData={state.settingsAvatarData}
    settingsDisplayName={state.settingsDisplayName}
    on:settingsDisplayName={actions.setSettingsDisplayName}
    avatarError={state.avatarError}
    theme={state.theme}
    on:theme={actions.setTheme}
    bind:selectedQuality
    bind:audioMode
    buttonColor={state.buttonColor}
    on:buttonColor={actions.setButtonColor}
    inputBackgroundColor={state.inputBackgroundColor}
    on:inputBackgroundColor={actions.setInputBackgroundColor}
    backgroundColor={state.backgroundColor}
    on:backgroundColor={actions.setBackgroundColor}
    providers={state.providers}
    selectedGroup={state.selectedGroup}
    bind:groupSettingsName
    onSaveProfile={actions.saveProfile}
    onAvatarChange={actions.handleAvatarChange}
    onClearAvatar={actions.clearAvatar}
    onSavePreferences={actions.savePreferences}
    onSaveGroupSettings={actions.saveGroupSettings}
    ProfileSettingsExtras={state.ProfileSettingsExtras}
    isDesktop={state.isDesktop}
    preferencesResetBusy={state.preferencesResetBusy}
    preferencesResetConfirm={state.preferencesResetConfirm}
    launchAtLogin={state.launchAtLogin}
    launchAtLoginBusy={state.launchAtLoginBusy}
    launchAtLoginError={state.launchAtLoginError}
    hardwareAccelerationMode={state.hardwareAccelerationMode}
    hardwareAccelerationBusy={state.hardwareAccelerationBusy}
    hardwareAccelerationError={state.hardwareAccelerationError}
    onTogglePreferencesResetConfirm={actions.togglePreferencesResetConfirm}
    onResetPreferences={actions.resetPreferencesToDefaults}
    onToggleLaunchAtLogin={actions.toggleLaunchAtLogin}
    onSetHardwareAcceleration={actions.setHardwareAcceleration}
    VoiceSettingsPanel={state.VoiceSettingsPanel}
    voiceNoiseSuppressionStatus={state.voiceNoiseSuppressionStatus}
    voiceNativeProcessingDetails={state.voiceNativeProcessingDetails}
    voiceInputProfile={state.voiceInputProfile}
    voiceAdvancedOptions={state.voiceAdvancedOptions}
    voiceTestRunning={state.voiceTestRunning}
    voiceTestLevel={state.voiceTestLevel}
    voiceTestError={state.voiceTestError}
    voiceTestSpeakerStatus={state.voiceTestSpeakerStatus}
    voiceTestStatus={state.voiceTestStatus}
    voiceDevicesBusy={state.voiceDevicesBusy}
    bind:selectedInputDeviceId
    bind:selectedOutputDeviceId
    audioInputDevices={state.audioInputDevices}
    audioOutputDevices={state.audioOutputDevices}
    voiceMicrophoneVolume={state.voiceMicrophoneVolume}
    voiceOutputVolume={state.voiceOutputVolume}
    pushToTalkEnabled={state.pushToTalkEnabled}
    pushToTalkCapturing={state.pushToTalkCapturing}
    pushToTalkActive={state.pushToTalkActive}
    pushToTalkKey={state.pushToTalkKey}
    desktopPushToTalkGlobal={state.desktopPushToTalkGlobal}
    muteShortcutCapturing={state.muteShortcutCapturing}
    muteShortcut={state.muteShortcut}
    desktopMuteShortcutGlobal={state.desktopMuteShortcutGlobal}
    voiceAdvancedOpen={state.voiceAdvancedOpen}
    soundPreferences={state.soundPreferences}
    voiceDevicesError={state.voiceDevicesError}
    voiceSensitivityAuto={state.voiceSensitivityAuto}
    voiceSensitivity={state.voiceSensitivity}
    onLoadAudioDevices={actions.loadAudioDevices}
    onApplyVoiceInputDevice={actions.applyVoiceInputDevice}
    onApplyVoiceOutputDevice={actions.applyVoiceOutputDevice}
    onSetVoiceMicrophoneVolume={actions.setVoiceMicrophoneVolume}
    onSetVoiceOutputVolume={actions.setVoiceOutputVolume}
    onApplyVoiceInputProfile={actions.applyVoiceInputProfile}
    onTogglePushToTalk={actions.togglePushToTalk}
    onStartPushToTalkCapture={actions.startPushToTalkCapture}
    onClearPushToTalkKey={actions.clearPushToTalkKey}
    onStartMuteShortcutCapture={actions.startMuteShortcutCapture}
    onClearMuteShortcut={actions.clearMuteShortcut}
    onToggleVoiceAdvanced={actions.toggleVoiceAdvanced}
    onUpdateVoiceAdvancedOption={actions.updateVoiceAdvancedOption}
    onHandleVoiceSoundEffectsChange={actions.handleVoiceSoundEffectsChange}
    onHandleSoundVolumeChange={actions.handleSoundVolumeChange}
    onPreviewVoiceSound={actions.previewVoiceSound}
    onHandleSoundPreferenceChange={actions.handleSoundPreferenceChange}
    onUpdateVoiceSensitivityAuto={actions.updateVoiceSensitivityAuto}
    onUpdateVoiceSensitivity={actions.updateVoiceSensitivity}
    onStartVoiceTest={actions.startVoiceTest}
    onStopVoiceTest={actions.stopVoiceTest}
    onTestVoiceSpeaker={actions.testVoiceSpeaker}
    pushToTalkLabel={state.pushToTalkLabel}
    shortcutLabel={state.shortcutLabel}
    liveNotificationScopes={state.liveNotificationScopes}
    onSetNotificationScope={actions.setLiveNotificationScope}
    groupRoles={state.groupRoles}
    selectedRole={state.selectedRole}
    bind:selectedRoleId
    groupMembers={state.groupMembers}
    rolePermissionOptions={state.rolePermissionOptions}
    filteredRoleMembers={state.filteredRoleMembers}
    roleOrderSaving={state.roleOrderSaving}
    draggedRoleId={state.draggedRoleId}
    dragOverRoleId={state.dragOverRoleId}
    bind:newRoleName
    bind:newRoleColor
    bind:roleEditName
    bind:roleEditColor
    roleEditBusy={state.roleEditBusy}
    bind:roleMemberSearchQuery
    roleMemberActionId={state.roleMemberActionId}
    onCreateRole={actions.createGroupRole}
    onStartRoleDrag={actions.startRoleDrag}
    onRoleDragOver={actions.handleRoleDragOver}
    onDropRole={actions.dropRole}
    onEndRoleDrag={actions.endRoleDrag}
    onMoveRole={actions.moveRole}
    onDeleteRole={actions.deleteGroupRole}
    onSaveRoleDetails={actions.saveGroupRoleDetails}
    onUpdateRolePermission={actions.updateRolePermission}
    onSetRoleMember={actions.setRoleMember}
    GroupChannelPermissionsSettings={state.GroupChannelPermissionsSettings}
    GroupAuditLogSettings={state.GroupAuditLogSettings}
    rooms={state.rooms}
    bind:selectedRoomPermissionId
    groupRoomPermissions={state.groupRoomPermissions}
    roomPermissionBusyKey={state.roomPermissionBusyKey}
    activeGroupInvites={state.activeGroupInvites}
    groupInviteLink={state.groupInviteLink}
    groupInviteCreating={state.groupInviteCreating}
    groupInviteBusyId={state.groupInviteBusyId}
    groupJoinRequests={state.groupJoinRequests}
    groupJoinActionId={state.groupJoinActionId}
    groupAuditEntries={state.groupAuditEntries}
    groupAuditLoading={state.groupAuditLoading}
    api={state.api}
    groupAdminError={state.groupAdminError}
    onLoadRoom={actions.loadGroupRoomPermissions}
    onUpdatePermission={actions.updateGroupRoomPermission}
    onResetPermission={actions.resetGroupRoomPermission}
    onCreateInvite={actions.createGroupInvite}
    onCopyInvite={actions.copyGroupInvite}
    onDeleteInvite={actions.deleteGroupInvite}
    onRespondJoinRequest={actions.respondToGroupJoinRequest}
    onModerationComplete={actions.refreshGroupAfterModeration}
  />
{:else}
  <div class="workspace-loading"><span></span><span></span><span></span></div>
{/if}
