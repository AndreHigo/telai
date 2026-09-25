export function createPostgresNotificationSyncService(database, { getNotificationScope, isStreamLive, createLiveContext, createNotification }) {
  async function sync(userId) {
    const notificationScope = await getNotificationScope(userId);
    const liveStreams = notificationScope === "all"
      ? (await database.query(`
          SELECT streams.id, streams.room_name AS "roomName", streams.group_id AS "groupId", streams.created_by AS "createdBy",
            streams.visibility, streams.started_at AS "startedAt",
            COALESCE(channel_profiles.display_name, users.display_name) AS "channelName", users.username AS "channelUsername",
            groups.name AS "groupName", group_voice_rooms.name AS "voiceRoomName", group_rooms.name AS "liveRoomName"
          FROM streams JOIN users ON users.id = streams.created_by
            LEFT JOIN channel_profiles ON channel_profiles.user_id = streams.created_by
            LEFT JOIN groups ON groups.id = streams.group_id
            LEFT JOIN group_voice_rooms ON group_voice_rooms.id = streams.voice_room_id
            LEFT JOIN group_rooms ON group_rooms.id = streams.room_id
          WHERE streams.visibility = 'public' AND streams.ended_at IS NULL
        `)).rows
      : (await database.query(`
          SELECT streams.id, streams.room_name AS "roomName", streams.group_id AS "groupId", streams.created_by AS "createdBy",
            streams.visibility, streams.started_at AS "startedAt",
            COALESCE(channel_profiles.display_name, users.display_name) AS "channelName", users.username AS "channelUsername",
            groups.name AS "groupName", group_voice_rooms.name AS "voiceRoomName", group_rooms.name AS "liveRoomName"
          FROM streams JOIN users ON users.id = streams.created_by
            LEFT JOIN channel_profiles ON channel_profiles.user_id = streams.created_by
            LEFT JOIN groups ON groups.id = streams.group_id
            LEFT JOIN group_voice_rooms ON group_voice_rooms.id = streams.voice_room_id
            LEFT JOIN group_rooms ON group_rooms.id = streams.room_id
          LEFT JOIN follows ON follows.followed_id = streams.created_by AND follows.follower_id = $1
          LEFT JOIN group_members ON group_members.group_id = streams.group_id AND group_members.user_id = $2
          WHERE streams.ended_at IS NULL
            AND (follows.follower_id IS NOT NULL OR group_members.user_id IS NOT NULL)
        `, [userId, userId])).rows;

    for (const stream of liveStreams.filter((item) => item.createdBy !== userId && isStreamLive(item))) {
      const liveContext = createLiveContext(stream);
      await createNotification({
        userId,
        type: "channel_live",
        entityId: stream.id,
        groupId: stream.groupId,
        title: `${liveContext?.initiatorName || "Uma transmissão"} está ao vivo`,
        body: liveContext ? `${liveContext.visibilityLabel} · ${liveContext.locationLabel}.` : "Uma nova transmissão começou.",
        createdAt: stream.startedAt,
      });
    }

    const pendingInvites = (await database.query(`
      SELECT group_user_invites.id, group_user_invites.group_id AS "groupId",
        group_user_invites.created_at AS "createdAt", groups.name AS "groupName",
        users.display_name AS "invitedBy"
      FROM group_user_invites
      JOIN groups ON groups.id = group_user_invites.group_id
      JOIN users ON users.id = group_user_invites.invited_by
      WHERE group_user_invites.invited_user_id = $1 AND group_user_invites.status = 'pending'
        AND group_user_invites.expires_at > $2
    `, [userId, new Date().toISOString()])).rows;
    for (const invite of pendingInvites) {
      await createNotification({
        userId,
        type: "group_invite",
        entityId: invite.id,
        groupId: invite.groupId,
        title: `Convite para ${invite.groupName}`,
        body: `${invite.invitedBy} convidou você para entrar neste grupo.`,
        createdAt: invite.createdAt,
      });
    }

    const pendingRequests = (await database.query(`
      SELECT group_join_requests.id, group_join_requests.group_id AS "groupId",
        group_join_requests.created_at AS "createdAt", groups.name AS "groupName",
        users.display_name AS "requesterName"
      FROM group_join_requests
      JOIN groups ON groups.id = group_join_requests.group_id
      JOIN users ON users.id = group_join_requests.user_id
      WHERE groups.owner_id = $1 AND group_join_requests.status = 'pending'
    `, [userId])).rows;
    for (const request of pendingRequests) {
      await createNotification({
        userId,
        type: "group_join_request",
        entityId: request.id,
        groupId: request.groupId,
        title: `Solicitação para ${request.groupName}`,
        body: `${request.requesterName} pediu para entrar no grupo.`,
        createdAt: request.createdAt,
      });
    }

    const decidedRequests = (await database.query(`
      SELECT group_join_requests.id, group_join_requests.group_id AS "groupId",
        group_join_requests.updated_at AS "updatedAt", group_join_requests.status,
        groups.name AS "groupName"
      FROM group_join_requests
      JOIN groups ON groups.id = group_join_requests.group_id
      WHERE group_join_requests.user_id = $1 AND group_join_requests.status IN ('approved', 'rejected')
    `, [userId])).rows;
    for (const request of decidedRequests) {
      const approved = request.status === "approved";
      await createNotification({
        userId,
        type: "group_join_decision",
        entityId: request.id,
        groupId: request.groupId,
        title: approved ? `Entrada aprovada em ${request.groupName}` : `Solicitação recusada em ${request.groupName}`,
        body: approved ? "Agora você já pode acessar este grupo." : "O administrador recusou sua solicitação de entrada.",
        createdAt: request.updatedAt,
      });
    }
  }

  return { sync };
}
