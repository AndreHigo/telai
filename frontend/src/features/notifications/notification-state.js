import { createStateStore } from "../../services/state-store.js";

const DEFAULT_NOTIFICATION_STATE = {
  notifications: [],
  notificationUnreadCount: 0,
  hideReadNotifications: false,
  notificationHideReadPreferenceUserId: "",
  notificationSoundInitialized: false,
  knownNotificationIds: new Set(),
  notificationsLoading: false,
  notificationsError: "",
  notificationsRefreshInFlight: false,
};

function createDefaultNotificationState() {
  return {
    ...DEFAULT_NOTIFICATION_STATE,
    notifications: [],
    knownNotificationIds: new Set(),
  };
}

export function createNotificationStateStore(initial = {}) {
  return createStateStore(createDefaultNotificationState(), initial, createDefaultNotificationState);
}
