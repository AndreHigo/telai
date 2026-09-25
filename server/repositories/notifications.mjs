import { randomUUID } from "node:crypto";

export function createNotificationRepository(database, { createId = randomUUID } = {}) {
  function createNotification({ userId, type, entityId, groupId = null, title, body, createdAt = new Date().toISOString() }) {
    database.prepare(`
      INSERT OR IGNORE INTO notifications (id, user_id, type, entity_id, group_id, title, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(createId(), userId, type, entityId, groupId, title, body, createdAt);
  }

  function listNotifications(userId, now) {
    return database.prepare(`
      SELECT notifications.id, notifications.type, notifications.entity_id AS entityId,
        notifications.group_id AS groupId, notifications.title, notifications.body,
        notifications.created_at AS createdAt, notifications.read_at AS readAt,
        groups.name AS groupName, group_user_invites.status AS inviteStatus,
        group_user_invites.expires_at AS inviteExpiresAt,
        group_join_requests.status AS joinRequestStatus,
        streams.id AS streamId, streams.visibility AS streamVisibility,
        streams.group_id AS streamGroupId, streams.created_by AS streamCreatedBy,
        COALESCE(stream_channel_profiles.display_name, stream_users.display_name) AS streamChannelName,
        stream_users.username AS streamChannelUsername,
        stream_groups.name AS streamGroupName,
        stream_groups.slug AS streamGroupSlug,
        stream_voice_rooms.name AS streamVoiceRoomName,
        stream_live_rooms.name AS streamLiveRoomName,
        direct_messages.conversation_id AS directConversationId
      FROM notifications
      LEFT JOIN groups ON groups.id = notifications.group_id
      LEFT JOIN group_user_invites ON notifications.type = 'group_invite' AND group_user_invites.id = notifications.entity_id
      LEFT JOIN group_join_requests ON notifications.type IN ('group_join_request', 'group_join_decision') AND group_join_requests.id = notifications.entity_id
      LEFT JOIN streams ON notifications.type = 'channel_live' AND streams.id = notifications.entity_id
      LEFT JOIN users AS stream_users ON stream_users.id = streams.created_by
      LEFT JOIN channel_profiles AS stream_channel_profiles ON stream_channel_profiles.user_id = streams.created_by
      LEFT JOIN groups AS stream_groups ON stream_groups.id = streams.group_id
      LEFT JOIN group_voice_rooms AS stream_voice_rooms ON stream_voice_rooms.id = streams.voice_room_id
      LEFT JOIN group_rooms AS stream_live_rooms ON stream_live_rooms.id = streams.room_id
      LEFT JOIN direct_messages ON notifications.type = 'direct_message' AND direct_messages.id = notifications.entity_id
      WHERE notifications.user_id = ?
        AND (
          notifications.type <> 'group_invite'
          OR (group_user_invites.status = 'pending' AND group_user_invites.expires_at > ?)
          OR notifications.read_at IS NOT NULL
        )
      ORDER BY notifications.created_at DESC
      LIMIT 100
    `).all(userId, now);
  }

  function markAllRead(userId, readAt) {
    database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?").run(readAt, userId);
  }

  function hasNotification(userId, notificationId) {
    return Boolean(database.prepare("SELECT id FROM notifications WHERE id = ? AND user_id = ?").get(notificationId, userId));
  }

  function markRead(notificationId, readAt) {
    database.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?").run(readAt, notificationId);
  }

  return { createNotification, listNotifications, markAllRead, hasNotification, markRead };
}
