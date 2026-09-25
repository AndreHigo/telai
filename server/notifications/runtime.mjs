export function liveNotificationContext(stream, canRevealPrivate = true) {
  if (!stream || (stream.visibility === "private" && !canRevealPrivate)) return null;
  const initiatorName = String(stream.channelName || stream.channelUsername || "Alguém").trim();
  const isPrivate = stream.visibility === "private";
  const locationParts = isPrivate
    ? [
        stream.groupName ? `grupo ${stream.groupName}` : null,
        stream.voiceRoomName ? `sala de voz ${stream.voiceRoomName}` : null,
        stream.liveRoomName ? `canal ${stream.liveRoomName}` : null,
      ].filter(Boolean)
    : ["canal público"];
  const locationLabel = locationParts.length ? locationParts.join(" · ") : (isPrivate ? "sala privada" : "canal público");
  return {
    initiatorName,
    visibility: isPrivate ? "private" : "public",
    visibilityLabel: isPrivate ? "Privada" : "Pública",
    locationLabel,
    groupName: stream.groupName || null,
    voiceRoomName: stream.voiceRoomName || null,
    liveRoomName: stream.liveRoomName || null,
  };
}

export function createNotificationRuntime({ notificationSyncService, canAccessStream }) {
  function liveNotificationPresentation(notification, userId) {
    if (notification.type !== "channel_live" || !notification.streamId) return { liveContext: null };
    const stream = {
      visibility: notification.streamVisibility,
      createdBy: notification.streamCreatedBy,
      groupId: notification.streamGroupId,
      channelName: notification.streamChannelName,
      channelUsername: notification.streamChannelUsername,
      groupName: notification.streamGroupName,
      voiceRoomName: notification.streamVoiceRoomName,
      liveRoomName: notification.streamLiveRoomName,
    };
    const liveContext = liveNotificationContext(stream, canAccessStream(userId, stream));
    if (!liveContext) return { liveContext: null, streamPath: null };
    return {
      title: `${liveContext.initiatorName} está ao vivo`,
      body: `${liveContext.visibilityLabel} · ${liveContext.locationLabel}.`,
      liveContext,
    };
  }

  function syncNotificationsForUser(userId) {
    notificationSyncService.sync(userId);
  }

  return { liveNotificationPresentation, syncNotificationsForUser };
}
