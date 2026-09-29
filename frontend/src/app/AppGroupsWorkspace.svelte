<script>
  import { HugeiconsIcon } from "@hugeicons/svelte";
  import { iconFor } from "../config/ui.js";
  import GroupPickerPage from "../features/groups/GroupPickerPage.svelte";
  import GroupMemberRail from "../features/groups/GroupMemberRail.svelte";
  import GroupServerRail from "../features/groups/GroupServerRail.svelte";
  import GroupChannelRail from "../features/groups/GroupChannelRail.svelte";
  import GroupWorkspaceHeader from "../features/groups/GroupWorkspaceHeader.svelte";
  import GroupChatHeader from "../features/groups/GroupChatHeader.svelte";
  import WorkspaceLoading from "./WorkspaceLoading.svelte";

  export let state = {};
  export let actions = {};
  export let groupPickerQuery = "";
  export let messageComposerInput = null;
</script>

<div class="groups-view">
  {#if !state.groupsWorkspaceOpen}
    <GroupPickerPage
      groups={state.groups}
      bind:groupPickerQuery
      groupPickerGroups={state.groupPickerGroups}
      groupLoading={state.groupLoading}
      onSearch={actions.openGroupSearchDialog}
      onCreate={actions.openCreateGroupDialog}
      onOpenGroup={actions.openGroupWorkspace}
    />
  {:else if !state.groups.length || !state.selectedGroupId}
    <section class="groups-empty-state panel" aria-labelledby="groups-empty-title">
      <span class="groups-empty-icon telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("communities")} size={28} strokeWidth={1.8} /></span>
      <p class="eyebrow">suas comunidades</p>
      <h1 id="groups-empty-title">Você ainda não faz parte de nenhum grupo</h1>
      <p class="muted">Crie seu próprio grupo ou pesquise uma comunidade para começar a conversar, entrar em voz e acompanhar transmissões.</p>
      <div class="groups-empty-actions">
        <button class="primary rounded-xl px-4 py-3 text-sm font-extrabold" type="button" on:click={actions.openCreateGroupDialog}>Criar grupo <span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("add")} size={15} strokeWidth={1.8} /></span></button>
        <button class="outline rounded-xl px-4 py-3 text-sm font-extrabold" type="button" on:click={actions.openGroupSearchDialog}>Pesquisar grupos <span class="telai-icon" aria-hidden="true"><HugeiconsIcon icon={iconFor("search")} size={15} strokeWidth={1.8} /></span></button>
      </div>
    </section>
  {:else}
    <GroupWorkspaceHeader
      selectedGroup={state.selectedGroup}
      selectedGroupId={state.selectedGroupId}
      groupLoading={state.groupLoading}
      groupMembers={state.groupMembers}
      user={state.user}
      onBack={actions.closeGroupWorkspace}
      onInvite={actions.openInviteDialog}
      onOpenSettings={actions.openGroupSettings}
      onLeave={actions.openLeaveGroupDialog}
    />
    <section class:group-navigation-collapsed={state.groupNavigationCollapsed} class="discord-layout">
      <GroupServerRail
        groups={state.groups}
        selectedGroupId={state.selectedGroupId}
        groupLoading={state.groupLoading}
        groupNavigationCollapsed={state.groupNavigationCollapsed}
        onGoHome={actions.goHome}
        onLoadGroup={actions.loadGroup}
        onOpenGroupContextMenu={actions.openGroupContextMenu}
        onCreateGroup={actions.openCreateGroupDialog}
        onToggleNavigation={actions.toggleGroupNavigation}
        onSearchGroups={actions.openGroupSearchDialog}
        onOpenSettings={actions.openGroupSettings}
      />
      <GroupChannelRail
        showMobileChannels={state.showMobileChannels}
        showGroupPicker={state.showGroupPicker}
        groups={state.groups}
        selectedGroup={state.selectedGroup}
        selectedGroupId={state.selectedGroupId}
        groupLoading={state.groupLoading}
        textRooms={state.textRooms}
        voiceRooms={state.voiceRooms}
        selectedRoomId={state.selectedRoomId}
        voiceDropRoomId={state.voiceDropRoomId}
        draggedVoiceParticipantId={state.draggedVoiceParticipantId}
        canMoveVoiceMembers={state.canMoveVoiceMembers}
        user={state.user}
        voiceState={state.voiceState}
        voiceServerMuted={state.voiceServerMuted}
        voiceMuted={state.voiceMuted}
        voiceDeafened={state.voiceDeafened}
        broadcastState={state.broadcastState}
        onToggleGroupPicker={actions.toggleGroupPicker}
        onLoadGroup={actions.loadGroup}
        onCreateGroup={actions.openCreateGroupFromChannelRail}
        onCreateRoom={actions.openCreateRoomDialog}
        onSelectRoom={actions.selectRoom}
        onVisibleVoiceParticipants={actions.visibleVoiceParticipants}
        onIsVoiceParticipantSpeaking={actions.isVoiceParticipantSpeaking}
        onVoiceParticipantDisplayName={actions.voiceParticipantDisplayName}
        onPrivateLiveForParticipant={actions.privateLiveForParticipant}
        onHandleVoiceDragOver={actions.handleVoiceDragOver}
        onHandleVoiceDragLeave={actions.handleVoiceDragLeave}
        onHandleVoiceDrop={actions.handleVoiceDrop}
        onHandleVoiceDragStart={actions.handleVoiceDragStart}
        onHandleVoiceDragEnd={actions.handleVoiceDragEnd}
        onToggleVoiceMute={actions.toggleVoiceMute}
        onToggleVoiceDeafen={actions.toggleVoiceDeafen}
        onRequestBroadcastStart={actions.requestBroadcastStart}
        onOpenVoiceSettings={actions.openVoiceSettings}
        onLeaveVoiceRoom={actions.leaveVoiceRoom}
      />
      <section class="chat-workspace">
        <GroupChatHeader
          selectedGroup={state.selectedGroup}
          selectedGroupId={state.selectedGroupId}
          groupLoading={state.groupLoading}
          selectedRoom={state.selectedRoom}
          showMobileChannels={state.showMobileChannels}
          showMobileMembers={state.showMobileMembers}
          onToggleChannels={actions.toggleMobileChannels}
          onToggleMembers={actions.toggleMobileMembers}
          onCreateChannel={actions.openCreateRoomDialog}
          onSearchMessages={actions.openGroupMessageSearch}
        />
        {#if state.groupLoading}
          <WorkspaceLoading label="Carregando sala" />
        {:else if state.selectedRoom?.kind === "voice"}
          {#if state.GroupVoiceWorkspace}
            <svelte:component
              this={state.GroupVoiceWorkspace}
              selectedRoomLiveStreams={state.selectedRoomLiveStreams}
              currentUserId={state.user?.id}
              watchingStreamId={state.watchingGroupLiveStreamId}
              streamUrl={state.streamViewerUrl}
              voiceLobbyParticipants={state.voiceLobbyParticipants}
              voiceState={state.voiceState}
              voiceRoomId={state.voiceRoomId}
              selectedRoom={state.selectedRoom}
              activeVoiceRoom={state.activeVoiceRoom}
              voiceError={state.voiceError}
              onWatchSelectedRoomLive={actions.watchSelectedRoomLive}
              onCloseSelectedRoomLive={actions.closeSelectedRoomLive}
              onIsVoiceParticipantSpeaking={actions.isVoiceParticipantSpeaking}
              onVoiceParticipantDisplayName={actions.voiceParticipantDisplayName}
              onJoinVoiceRoom={actions.joinVoiceRoom}
              onLeaveVoiceRoom={actions.leaveVoiceRoom}
            />
          {:else}
            <WorkspaceLoading label="Carregando sala de voz" />
          {/if}
        {:else if state.GroupTextChatWorkspace}
          <svelte:component
            this={state.GroupTextChatWorkspace}
            bind:messageComposerInput
            messageDraft={state.messageDraft}
            on:messageDraft={actions.setMessageDraft}
            selectedRoom={state.selectedRoom}
            roomMessages={state.roomMessages}
            groupApplicationCommands={state.groupApplicationCommands}
            currentUserId={state.user?.id}
            editingMessageId={state.editingMessageId}
            editingMessageDraft={state.editingMessageDraft}
            on:editingMessageDraft={actions.setEditingMessageDraft}
            mentionSuggestions={state.mentionSuggestions}
            mentionActiveIndex={state.mentionActiveIndex}
            messageAttachments={state.messageAttachments}
            onSendMessage={actions.sendMessage}
            onUpdateMentionSuggestions={actions.updateMentionSuggestions}
            onHandleMessageKeydown={actions.handleMessageKeydown}
            onInsertMention={actions.insertMention}
            onStartEditMessage={actions.startEditMessage}
            onCancelEditMessage={actions.cancelEditMessage}
            onSaveEditMessage={actions.saveEditMessage}
            onDeleteMessage={actions.deleteMessage}
            onOpenThread={actions.openGroupThread}
            onAddMessageAttachments={actions.addMessageAttachments}
            onRemoveMessageAttachment={actions.removeMessageAttachment}
            onSubmitBotComponent={actions.submitBotComponent}
            onSubmitBotModal={actions.submitBotModal}
            onStartApplicationInteraction={actions.startApplicationInteraction}
          />
        {:else}
          <WorkspaceLoading label="Carregando conversa" />
        {/if}
      </section>
      <GroupMemberRail
        user={state.user}
        memberRoleGroups={state.memberRoleGroups}
        memberCount={state.groupMembers.length}
        showMobileMembers={state.showMobileMembers}
        onOpenUserContextMenu={actions.openUserContextMenu}
        onOpenDirectConversation={actions.openDirectConversationWithUser}
      />
    </section>
  {/if}
</div>
