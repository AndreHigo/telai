<script>
  import WorkspaceLoading from "./WorkspaceLoading.svelte";

  export let state = {};
  export let actions = {};
  export let directMessageDraft = "";
  export let selectedQuality = "balanced";
  export let broadcastVideo = null;
  export let broadcastChatListElement = null;
  export let broadcastChatDraft = "";
  export let audioMode = "voice-optimized";
  export let broadcastCameraDeviceId = "default";
  export let broadcastCameraEnabled = false;
  export let broadcastCameraPosition = "user";
  export let selectedInputDeviceId = "default";
  export let broadcastMicrophoneEnabled = false;
</script>

{#if state.view === "home"}
  {#if state.HomePage}<svelte:component this={state.HomePage}
    homeLiveStreams={state.homeLiveStreams}
    homeCommunityGroups={state.homeCommunityGroups}
    onRequestBroadcastStart={actions.requestBroadcastStart}
    onCreateGroup={actions.openCreateGroup}
    onOpenLive={actions.openLive}
    onOpenGroups={actions.openGroups}
    onOpenStream={actions.openStreamViewer}
    onOpenGroup={actions.openGroup}
  />{:else}<WorkspaceLoading label="Carregando início" />{/if}
{:else if state.view === "notifications"}
  {#if state.NotificationsPage}<svelte:component this={state.NotificationsPage}
    notificationUnreadCount={state.notificationUnreadCount}
    hideReadNotifications={state.hideReadNotifications}
    readNotificationCount={state.readNotificationCount}
    notificationsError={state.notificationsError}
    unreadDirectNotification={state.unreadDirectNotification}
    notificationsLoading={state.notificationsLoading}
    visibleNotifications={state.visibleNotifications}
    notifications={state.notifications}
    inviteActionId={state.inviteActionId}
    onHideReadChange={actions.setHideReadNotifications}
    onMarkAllRead={actions.markAllNotificationsRead}
    onOpenDirectNotification={actions.openDirectNotification}
    onMarkNotificationRead={actions.markNotificationRead}
    onRespondToInvite={actions.respondToInvite}
    onReviewNotification={actions.reviewNotification}
    onOpenStreamNotification={actions.openStreamNotification}
    onNavigateHome={actions.openHome}
  />{:else}<WorkspaceLoading label="Carregando notificações" />{/if}
{:else if state.view === "friends"}
  {#if state.FriendsPage}<svelte:component this={state.FriendsPage}
    socialSearchOpen={state.socialSearchOpen}
    socialRequestsOpen={state.socialRequestsOpen}
    socialSearchQuery={state.socialSearchQuery}
    social={state.social}
    socialError={state.socialError}
    socialSearchBusy={state.socialSearchBusy}
    socialSearchResults={state.socialSearchResults}
    socialActionId={state.socialActionId}
    onStateChange={actions.setSocialState}
    onSearchUsers={actions.searchSocialUsers}
    onOpenDirectConversation={actions.openDirectConversationWithUser}
    onCancelFriendRequest={actions.cancelFriendRequest}
    onSendFriendRequest={actions.sendFriendRequest}
    onToggleFollowUser={actions.toggleFollowUser}
    onToggleBlockUser={actions.toggleBlockUser}
    onRespondToFriendRequest={actions.respondToFriendRequest}
    onRemoveFriend={actions.removeFriend}
    onNavigateHome={actions.openHome}
  />{:else}<WorkspaceLoading label="Carregando amigos" />{/if}
{:else if state.view === "following"}
  {#if state.FollowingPage}<svelte:component this={state.FollowingPage}
    social={state.social}
    socialError={state.socialError}
    socialActionId={state.socialActionId}
    onToggleFollowUser={actions.toggleFollowUser}
    onNavigateFriends={actions.openFriends}
    onNavigateHome={actions.openHome}
  />{:else}<WorkspaceLoading label="Carregando seguindo" />{/if}
{:else if state.view === "direct"}
  {#if state.DirectMessagesPage}<svelte:component this={state.DirectMessagesPage}
    user={state.user}
    directConversationError={state.directConversationError}
    directConversations={state.directConversations}
    directConversationId={state.directConversationId}
    directConversationTarget={state.directConversationTarget}
    directConversationLoading={state.directConversationLoading}
    directMessages={state.directMessages}
    bind:directMessageDraft
    on:directMessageDraft={actions.setDirectMessageDraft}
    directConversationSending={state.directConversationSending}
    onOpenConversation={actions.openDirectConversationById}
    onSendMessage={actions.sendDirectMessage}
    onMessageKeydown={actions.handleDirectMessageKeydown}
    onNavigateHome={actions.openHome}
  />{:else}<WorkspaceLoading label="Carregando mensagens" />{/if}
{:else if state.view === "broadcast"}
  {#if state.BroadcastPage}<svelte:component this={state.BroadcastPage}
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
    broadcastState={state.broadcastState}
    broadcastStreamId={state.broadcastStreamId}
    broadcastTitle={state.broadcastTitle}
    broadcastSourceType={state.broadcastSourceType}
    publicBroadcastSourceLabel={state.publicBroadcastSourceLabel}
    broadcastSelectionKind={state.broadcastSelectionKind}
    qualityProfiles={state.qualityProfiles}
    broadcastError={state.broadcastError}
    broadcastAudioWarning={state.broadcastAudioWarning}
    viewerCount={state.viewerCount}
    broadcastChatMessages={state.broadcastChatMessages}
    isDesktop={state.isDesktop}
    broadcastDisplaySurface={state.broadcastDisplaySurface}
    broadcastAudioSourceName={state.broadcastAudioSourceName}
    cameraInputDevices={state.cameraInputDevices}
    audioInputDevices={state.audioInputDevices}
    broadcastSourceSwitching={state.broadcastSourceSwitching}
    broadcastMediaSwitching={state.broadcastMediaSwitching}
    voiceDevicesBusy={state.voiceDevicesBusy}
    broadcastInvite={state.broadcastInvite}
    pendingBroadcastContext={state.pendingBroadcastContext}
    onStopBroadcast={actions.stopBroadcast}
    onNavigateHome={actions.openHome}
    onBeginBroadcast={actions.beginBroadcast}
    onSendChat={actions.sendBroadcastChatMessage}
    onBroadcastAudioModeChange={actions.handleBroadcastAudioModeChange}
    onCameraChange={actions.handleBroadcastCameraChange}
    onCameraToggle={actions.handleBroadcastCameraToggle}
    onCameraPositionChange={actions.handleBroadcastCameraPositionChange}
    onMicrophoneChange={actions.handleBroadcastMicrophoneChange}
    onRefreshDevices={actions.refreshBroadcastDevices}
    onSwitchSource={actions.switchBroadcastSource}
    onCopyInvite={actions.copyBroadcastInvite}
    onRequestCameraStart={actions.requestCameraBroadcastStart}
  />{:else}<WorkspaceLoading label="Carregando transmissão" />{/if}
{:else if state.view === "multistream"}
  {#if state.MultistreamPage}
    <svelte:component
      this={state.MultistreamPage}
      streams={state.streams}
      selectedStreams={state.selectedStreams}
      onClose={actions.closeMultistream}
      onSelectLive={actions.openLive}
      onToggleStream={actions.toggleStream}
    />
  {:else}
    <WorkspaceLoading label="Carregando transmissão" />
  {/if}
{:else}
  {#if state.LivePage}<svelte:component this={state.LivePage}
    streams={state.streams}
    selectedStreams={state.selectedStreams}
    followingOnly={state.followingOnly}
    socialActionId={state.socialActionId}
    onToggleFollowing={actions.toggleFollowing}
    onOpenMultistream={actions.openMultistream}
    onStreamCardClick={actions.handleStreamCardClick}
    onStreamCardKeydown={actions.handleStreamCardKeydown}
    onToggleStream={actions.toggleStream}
    onOpenStreamViewer={actions.openStreamViewer}
    onToggleFollowStream={actions.toggleFollowStream}
  />{:else}<WorkspaceLoading label="Carregando ao vivo" />{/if}
{/if}
