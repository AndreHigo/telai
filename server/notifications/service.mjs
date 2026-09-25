export function createNotificationService({ persistNotification, publishUserEvent } = {}) {
  if (typeof persistNotification !== "function") throw new TypeError("persistNotification is required");

  function createNotification(notification) {
    const publish = (result) => {
      if (!result?.created || typeof publishUserEvent !== "function") return result;
      publishUserEvent(notification.userId, {
        type: "notification-created",
        notification: {
          id: result.id,
          type: notification.type,
          entityId: notification.entityId,
          groupId: notification.groupId || null,
          title: notification.title,
          body: notification.body,
          createdAt: notification.createdAt || new Date().toISOString(),
          readAt: null,
          unread: true,
        },
      });
      return result;
    };
    const result = persistNotification(notification);
    return result && typeof result.then === "function" ? result.then(publish) : publish(result);
  }

  return { createNotification };
}

