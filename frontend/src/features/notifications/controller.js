export function createNotificationController({ api, getUser, getState, setState, playVoiceSound }) {
  function syncNotificationHideReadPreference() {
    const userId = getUser()?.id == null ? "" : String(getUser().id);
    if (!userId) {
      setState({ notificationHideReadPreferenceUserId: "", hideReadNotifications: false });
      return;
    }
    if (getState().notificationHideReadPreferenceUserId === userId) return;
    let hidden = false;
    try { hidden = localStorage.getItem(`mirante-hide-read-notifications:${userId}`) === "true"; } catch {}
    setState({ notificationHideReadPreferenceUserId: userId, hideReadNotifications: hidden });
  }

  function setHideReadNotifications(hidden) {
    const hide = Boolean(hidden);
    const userId = getUser()?.id == null ? "" : String(getUser().id);
    setState({ hideReadNotifications: hide, ...(userId ? { notificationHideReadPreferenceUserId: userId } : {}) });
    if (!userId) return;
    try { localStorage.setItem(`mirante-hide-read-notifications:${userId}`, String(hide)); } catch {}
  }

  async function loadNotifications({ silent = false } = {}) {
    if (getState().notificationsRefreshInFlight) return;
    setState({
      notificationsRefreshInFlight: true,
      ...(silent ? {} : { notificationsLoading: true }),
      notificationsError: "",
    });
    syncNotificationHideReadPreference();
    try {
      const result = await api("/api/notifications");
      const allNotifications = result.notifications || [];
      const unreadNotifications = allNotifications.filter((notification) => notification.unread);
      const state = getState();
      if (state.notificationSoundInitialized && unreadNotifications.some((notification) => notification.id && !state.knownNotificationIds.has(notification.id))) {
        playVoiceSound("notification");
      }
      setState({
        knownNotificationIds: new Set(unreadNotifications.map((notification) => notification.id).filter(Boolean)),
        notificationSoundInitialized: true,
        notifications: allNotifications,
        notificationUnreadCount: Number(result.unreadCount || 0),
      });
    } catch (error) {
      setState({ notificationsError: error.message });
    } finally {
      setState({ notificationsRefreshInFlight: false, ...(silent ? {} : { notificationsLoading: false }) });
    }
  }

  async function markNotificationRead(notification) {
    const notificationId = notification?.id;
    const state = getState();
    const current = state.notifications.find((item) => item.id === notificationId);
    if (!notificationId || !current?.unread) return;
    const readAt = new Date().toISOString();
    setState({
      notifications: state.notifications.map((item) => item.id === notificationId ? { ...item, readAt, unread: false } : item),
      notificationUnreadCount: Math.max(0, state.notificationUnreadCount - 1),
      notificationsError: "",
    });
    try {
      await api(`/api/notifications/${encodeURIComponent(notificationId)}`, { method: "PATCH" });
    } catch (error) {
      const currentState = getState();
      setState({
        notifications: currentState.notifications.map((item) => item.id === notificationId ? { ...item, readAt: current.readAt || null, unread: true } : item),
        notificationUnreadCount: currentState.notificationUnreadCount + 1,
        notificationsError: error.message,
      });
    }
  }

  async function markAllNotificationsRead() {
    const state = getState();
    if (!state.notificationUnreadCount && !state.notifications.some((notification) => notification.unread)) return;
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      const readAt = new Date().toISOString();
      setState({
        notifications: getState().notifications.map((notification) => ({ ...notification, readAt: notification.readAt || readAt, unread: false })),
        notificationUnreadCount: 0,
        notificationsError: "",
      });
    } catch (error) {
      setState({ notificationsError: error.message });
    }
  }

  function receiveNotification(notification) {
    if (!notification?.id || notification.userId && notification.userId !== getUser()?.id) return;
    const state = getState();
    if (state.notifications.some((item) => item.id === notification.id)) return;
    const nextNotification = { ...notification, readAt: notification.readAt || null, unread: true };
    setState({
      notifications: [nextNotification, ...state.notifications].slice(0, 100),
      knownNotificationIds: new Set([...state.knownNotificationIds, notification.id]),
      notificationUnreadCount: state.notificationUnreadCount + 1,
      notificationSoundInitialized: true,
    });
    playVoiceSound("notification");
  }

  return {
    loadNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    receiveNotification,
    setHideReadNotifications,
    syncNotificationHideReadPreference,
  };
}
