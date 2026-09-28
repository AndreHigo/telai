<script>
  import HomePage from "../features/home/HomePage.svelte";
  import NotificationsPage from "../features/notifications/NotificationsPage.svelte";
  import FriendsPage from "../features/social/FriendsPage.svelte";
  import FollowingPage from "../features/social/FollowingPage.svelte";
  import DirectMessagesPage from "../features/direct/DirectMessagesPage.svelte";
  import BroadcastPage from "../features/broadcast/BroadcastPage.svelte";

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
  <HomePage
    homeLiveStreams={state.homeLiveStreams}
    homeCommunityGroups={state.homeCommunityGroups}
    onRequestBroadcastStart={actions.requestBroadcastStart}
    onCreateGroup={actions.openCreateGroup}
    onOpenLive={actions.openLive}
    onOpenGroups={actions.openGroups}
    onOpenStream={actions.openStreamViewer}
    onOpenGroup={actions.openGroup}
  />
{:else if state.view === "notifications"}
  <NotificationsPage
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
  />
{:else if state.view === "friends"}
  <FriendsPage
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
  />
{:else if state.view === "following"}
  <FollowingPage
    social={state.social}
    socialError={state.socialError}
    socialActionId={state.socialActionId}
    onToggleFollowUser={actions.toggleFollowUser}
    onNavigateFriends={actions.openFriends}
    onNavigateHome={actions.openHome}
  />
{:else if state.view === "direct"}
  <DirectMessagesPage
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
  />
{:else if state.view === "broadcast"}
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
  />
{/if}
