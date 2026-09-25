export function createNotificationRoutes({
  json,
  requireUser,
  groupInviteRepository,
  notificationRepository,
  syncNotificationsForUser,
  liveNotificationPresentation,
  streamPublicPath,
}) {
  return async function handleNotificationRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/notifications" && request.method === "GET") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const now = new Date().toISOString();
      await groupInviteRepository.expireMemberInvites(user.id, now);
      await syncNotificationsForUser(user.id);
      const notifications = await Promise.all((await notificationRepository.listNotifications(user.id, now)).map(async (notification) => {
        const presentation = await liveNotificationPresentation(notification, user.id);
        const streamPath = notification.streamId && presentation.liveContext
          ? streamPublicPath({ visibility: notification.streamVisibility, channelName: notification.streamChannelName, channelUsername: notification.streamChannelUsername, groupSlug: notification.streamGroupSlug })
          : null;
        const {
          streamId, streamVisibility, streamGroupId, streamCreatedBy, streamChannelName, streamChannelUsername,
          streamGroupName, streamGroupSlug, streamVoiceRoomName, streamLiveRoomName, ...safeNotification
        } = notification;
        return {
          ...safeNotification,
          ...presentation,
          streamPath,
          unread: !notification.readAt,
          actionable: notification.type === "group_invite" ? notification.inviteStatus === "pending" : notification.type === "group_join_request" ? notification.joinRequestStatus === "pending" : notification.type === "channel_live" ? Boolean(streamPath) : notification.type === "direct_message" ? Boolean(notification.directConversationId) : false,
        };
      }));
      json(response, 200, { notifications, unreadCount: notifications.filter((notification) => notification.unread).length });
      return true;
    }

    if (requestUrl.pathname === "/api/notifications/read-all" && request.method === "POST") {
      const user = await requireUser(request, response);
      if (!user) return true;
      await notificationRepository.markAllRead(user.id, new Date().toISOString());
      json(response, 200, { ok: true });
      return true;
    }

    const notificationMatch = requestUrl.pathname.match(/^\/api\/notifications\/([\w-]{16,64})$/);
    if (notificationMatch && request.method === "PATCH") {
      const user = await requireUser(request, response);
      if (!user) return true;
      const notificationId = notificationMatch[1];
      if (!await notificationRepository.hasNotification(user.id, notificationId)) {
        json(response, 404, { error: "Notificação não encontrada." });
        return true;
      }
      await notificationRepository.markRead(notificationId, new Date().toISOString());
      json(response, 200, { ok: true });
      return true;
    }

    return false;
  };
}
