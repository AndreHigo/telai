<script>
  import LegalConsentGate from "../LegalConsentGate.svelte";

  export let state = {};
  export let actions = {};
</script>

{#if state.selectedRoomRemoteVoice}
  <div class="voice-remote-session-banner" role="status">
    <div><strong>Você já está nesta sala em outra janela.</strong><span>Ao entrar pelo app, a outra janela sairá automaticamente da sala.</span></div>
    <button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={actions.joinVoiceRoom}>Entrar nesta janela →</button>
  </div>
{/if}
<LegalConsentGate user={state.user} on:accepted={actions.handleLegalConsentAccepted} />
{#if state.voicePlaybackBlocked && state.voiceState === "connected" && !state.voiceDeafened}
  <div class="voice-playback-banner" role="status">
    <span>O navegador bloqueou o áudio da sala.</span>
    <button class="primary rounded-lg px-3 py-2 text-xs font-extrabold" type="button" on:click={actions.resumeVoiceRemoteAudio}>Ativar áudio da sala</button>
  </div>
{/if}
{#if state.ContextMenus}
  <svelte:component
    this={state.ContextMenus}
    groupContextMenu={state.groupContextMenu}
    roomContextMenu={state.roomContextMenu}
    voiceContextMenu={state.voiceContextMenu}
    profilePreview={state.profilePreview}
    selectedGroupId={state.selectedGroupId}
    currentGroupMember={state.currentGroupMember}
    selectedGroup={state.selectedGroup}
    user={state.user}
    socialActionId={state.socialActionId}
    voiceVolumes={state.voiceVolumes}
    canMoveVoiceMembers={state.canMoveVoiceMembers}
    voiceRoomId={state.voiceRoomId}
    voiceRooms={state.voiceRooms}
    activeVoiceRoom={state.activeVoiceRoom}
    onGroupContextMenuKeydown={actions.handleGroupContextMenuKeydown}
    onRunGroupContextAction={actions.runGroupContextAction}
    onRoomContextMenuKeydown={actions.handleRoomContextMenuKeydown}
    onRunRoomContextAction={actions.runRoomContextAction}
    onVoiceContextMenuKeydown={actions.handleVoiceContextMenuKeydown}
    onVoiceParticipantDisplayName={actions.voiceParticipantDisplayName}
    onShowVoiceProfile={actions.showVoiceProfile}
    onSendFriendRequest={actions.sendFriendRequestFromContext}
    onOpenDirectConversation={actions.openDirectConversationWithUser}
    onMentionVoiceParticipant={actions.mentionVoiceParticipant}
    onSetVoiceVolume={actions.setVoiceVolume}
    onToggleContextParticipantServerMute={actions.toggleContextParticipantServerMute}
    onToggleVoiceParticipantLocalMute={actions.toggleVoiceParticipantLocalMute}
    onIsVoiceParticipantLocallyMuted={actions.isVoiceParticipantLocallyMuted}
    onMoveContextParticipant={actions.moveContextParticipant}
    onDisconnectContextParticipant={actions.disconnectContextParticipant}
    onCloseProfilePreview={actions.closeProfilePreview}
  />
{/if}
{#if state.GroupDialogs}
  <svelte:component
    this={state.GroupDialogs}
    showInviteDialog={state.showInviteDialog}
    showGroupSearchDialog={state.showGroupSearchDialog}
    showLeaveGroupDialog={state.showLeaveGroupDialog}
    showDeleteRoomDialog={state.showDeleteRoomDialog}
    showDeleteGroupDialog={state.showDeleteGroupDialog}
    showGroupDialog={state.showGroupDialog}
    showRoomDialog={state.showRoomDialog}
    selectedGroup={state.selectedGroup}
    deleteRoomTarget={state.deleteRoomTarget}
    inviteSearchQuery={state.inviteSearchQuery}
    inviteSearchBusy={state.inviteSearchBusy}
    inviteSearchError={state.inviteSearchError}
    inviteSearchResults={state.inviteSearchResults}
    inviteActionId={state.inviteActionId}
    groupInviteCreating={state.groupInviteCreating}
    groupInviteLink={state.groupInviteLink}
    groupSearchQuery={state.groupSearchQuery}
    groupSearchBusy={state.groupSearchBusy}
    groupSearchError={state.groupSearchError}
    groupSearchResults={state.groupSearchResults}
    groupJoinActionId={state.groupJoinActionId}
    leaveGroupBusy={state.leaveGroupBusy}
    leaveGroupError={state.leaveGroupError}
    deleteRoomBusy={state.deleteRoomBusy}
    deleteRoomError={state.deleteRoomError}
    deleteGroupBusy={state.deleteGroupBusy}
    deleteGroupError={state.deleteGroupError}
    groupName={state.groupName}
    roomDialogMode={state.roomDialogMode}
    roomName={state.roomName}
    roomKind={state.roomKind}
    roomMaxParticipants={state.roomMaxParticipants}
    onCloseInvite={actions.closeInvite}
    onInviteSearchQueryChange={actions.setInviteSearchQuery}
    onSearchUsers={actions.searchUsers}
    onInviteUser={actions.inviteUser}
    onCreateGroupInvite={actions.createGroupInvite}
    onCopyGroupInvite={actions.copyGroupInvite}
    onCloseGroupSearch={actions.closeGroupSearch}
    onGroupSearchQueryChange={actions.setGroupSearchQuery}
    onSearchGroups={actions.searchGroups}
    onRequestGroupEntry={actions.requestGroupEntry}
    onCloseLeaveGroup={actions.closeLeaveGroup}
    onLeaveSelectedGroup={actions.leaveSelectedGroup}
    onCloseDeleteRoom={actions.closeDeleteRoom}
    onConfirmDeleteGroupRoom={actions.confirmDeleteGroupRoom}
    onCloseDeleteGroup={actions.closeDeleteGroup}
    onDeleteSelectedGroup={actions.deleteSelectedGroup}
    onCloseGroup={actions.closeGroup}
    onGroupNameChange={actions.setGroupName}
    onCreateGroup={actions.createGroup}
    onCloseRoom={actions.closeRoom}
    onRoomNameChange={actions.setRoomName}
    onRoomKindChange={actions.setRoomKind}
    onRoomMaxParticipantsChange={actions.setRoomMaxParticipants}
    onCreateRoom={actions.createRoom}
  />
{:else if state.showInviteDialog || state.showGroupSearchDialog || state.showLeaveGroupDialog || state.showDeleteRoomDialog || state.showDeleteGroupDialog || state.showGroupDialog || state.showRoomDialog}
  <div class="workspace-loading" role="status" aria-label="Carregando diálogos"><span></span><span></span><span></span></div>
{/if}
{#if state.showGroupMessageSearch}
  {#if state.GroupMessageSearchDialog}
    <svelte:component
      this={state.GroupMessageSearchDialog}
      query={state.groupMessageSearchQuery}
      results={state.groupMessageSearchResults}
      busy={state.groupMessageSearchBusy}
      error={state.groupMessageSearchError}
      rooms={state.rooms}
      onQueryChange={actions.setGroupMessageSearchQuery}
      onSearch={actions.searchGroupMessages}
      onClose={actions.closeGroupMessageSearch}
      onSelect={actions.openGroupMessageSearchResult}
    />
  {:else}
    <div class="workspace-loading" role="status" aria-label="Carregando busca de mensagens"><span></span><span></span><span></span></div>
  {/if}
{/if}
{#if state.activeGroupThread}
  {#if state.GroupThreadDialog}
    <svelte:component
      this={state.GroupThreadDialog}
      parent={state.activeGroupThread}
      messages={state.groupThreadMessages}
      currentUserId={state.user?.id}
      draft={state.groupThreadDraft}
      busy={state.groupThreadBusy}
      error={state.groupThreadError}
      onDraftChange={actions.updateGroupThreadDraft}
      onSend={actions.sendGroupThreadMessage}
      onClose={actions.closeGroupThread}
      onStartEdit={actions.startEditMessage}
      onDelete={actions.deleteMessage}
    />
  {:else}
    <div class="workspace-loading" role="status" aria-label="Carregando respostas"><span></span><span></span><span></span></div>
  {/if}
{/if}
{#if state.BroadcastDialogs}
  <svelte:component
    this={state.BroadcastDialogs}
    isDesktop={state.isDesktop}
    showPublicBroadcastSetup={state.showPublicBroadcastSetup}
    showPublicBroadcastReview={state.showPublicBroadcastReview}
    showBroadcastVisibilityDialog={state.showBroadcastVisibilityDialog}
    showDisplayPicker={state.showDisplayPicker}
    showBroadcastAudioPicker={state.showBroadcastAudioPicker}
    publicBroadcastTitle={state.publicBroadcastTitle}
    publicBroadcastSourceKind={state.publicBroadcastSourceKind}
    publicBroadcastMicrophoneEnabled={state.publicBroadcastMicrophoneEnabled}
    publicBroadcastCameraEnabled={state.publicBroadcastCameraEnabled}
    publicBroadcastCameraDeviceId={state.publicBroadcastCameraDeviceId}
    publicBroadcastQuality={state.publicBroadcastQuality}
    selectedInputDeviceId={state.selectedInputDeviceId}
    audioInputDevices={state.audioInputDevices}
    cameraInputDevices={state.cameraInputDevices}
    broadcastError={state.broadcastError}
    broadcastTitle={state.broadcastTitle}
    broadcastSelectionKind={state.broadcastSelectionKind}
    broadcastSelectedSourceName={state.broadcastSelectedSourceName}
    broadcastMicrophoneEnabled={state.broadcastMicrophoneEnabled}
    broadcastCameraEnabled={state.broadcastCameraEnabled}
    qualityProfiles={state.qualityProfiles}
    selectedQuality={state.selectedQuality}
    broadcastVisibility={state.broadcastVisibility}
    displayPickerAvailability={state.displayPickerAvailability}
    displaySourceFilter={state.displaySourceFilter}
    displaySourceGroups={state.displaySourceGroups}
    broadcastAudioSourceCandidates={state.broadcastAudioSourceCandidates}
    publicBroadcastAudioLabel={state.publicBroadcastAudioLabel}
    publicBroadcastSourceLabel={state.publicBroadcastSourceLabel}
    onPublicBroadcastTitleChange={actions.setPublicBroadcastTitle}
    onPublicBroadcastSourceKindChange={actions.setPublicBroadcastSourceKind}
    onPublicBroadcastMicrophoneChange={actions.setPublicBroadcastMicrophone}
    onPublicBroadcastCameraChange={actions.setPublicBroadcastCamera}
    onPublicBroadcastCameraDeviceChange={actions.setPublicBroadcastCameraDevice}
    onPublicBroadcastQualityChange={actions.setPublicBroadcastQuality}
    onSelectedInputDeviceChange={actions.setSelectedInputDevice}
    onCancelPublicBroadcastSetup={actions.cancelPublicBroadcastSetup}
    onConfirmPublicBroadcastSetup={actions.confirmPublicBroadcastSetup}
    onCancelPublicBroadcastReview={actions.cancelPublicBroadcastReview}
    onConfirmPublicBroadcastReview={actions.confirmPublicBroadcastReview}
    onCancelBroadcastVisibility={actions.cancelBroadcastVisibility}
    onBroadcastVisibilityChange={actions.setBroadcastVisibility}
    onConfirmBroadcastVisibility={actions.confirmBroadcastVisibility}
    onCancelDisplayPicker={actions.cancelDisplayPicker}
    onDisplaySourceFilterChange={actions.setDisplaySourceFilter}
    onSelectDisplaySource={actions.selectDisplaySource}
    onCancelBroadcastAudioPicker={actions.cancelBroadcastAudioPicker}
    onSelectBroadcastAudioSource={actions.selectBroadcastAudioSource}
    onSkipBroadcastAudioSource={actions.skipBroadcastAudioSource}
  />
{:else if state.showPublicBroadcastSetup || state.showPublicBroadcastReview || state.showBroadcastVisibilityDialog || state.showDisplayPicker || state.showBroadcastAudioPicker}
  <div class="workspace-loading" role="status" aria-label="Carregando controles de transmissão"><span></span><span></span><span></span></div>
{/if}
{#if state.showReleaseNotes && state.releaseNotes}
  <div class="modal-backdrop release-notes-backdrop" role="presentation" on:click={actions.dismissReleaseNotes}>
    <div class="modal-shell release-notes-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="release-notes-title" on:click|stopPropagation on:keydown|stopPropagation>
      <header class="modal-header">
        <div>
          <p class="eyebrow">atualização do Telai · {state.releaseNotes.platformLabel} · {state.releaseNotes.version}</p>
          <h2 id="release-notes-title">{state.releaseNotes.title}</h2>
          <p>{state.releaseNotes.summary}</p>
        </div>
        <button class="modal-close outline" type="button" aria-label="Fechar notas da atualização" on:click={actions.dismissReleaseNotes}>×</button>
      </header>
      <div class="modal-body release-notes-body">
        {#each state.releaseNotes.sections as section, sectionIndex}
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
        <button class="primary rounded-xl px-4 py-2 text-sm font-extrabold" type="button" on:click={actions.dismissReleaseNotes}>Entendi</button>
      </footer>
    </div>
  </div>
{/if}
