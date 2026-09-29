import { createLazyComponentLoader } from "../services/lazy-component-loader.js";

function createComponentLoader({ name, importer, setComponent, reportClientError, errorKind }) {
  return createLazyComponentLoader({
    importer,
    assign: (component) => setComponent(name, component),
    onError: (error) => reportClientError(errorKind, error),
  }).load;
}

/**
 * Owns the lazy import map for the shell. App.svelte keeps the reactive
 * references and decides when each loader should run; this registry only
 * centralizes import paths and error categories.
 */
export function createAppComponentLoaders({ setComponent, reportClientError } = {}) {
  if (typeof setComponent !== "function") throw new TypeError("setComponent precisa ser uma função");
  if (typeof reportClientError !== "function") throw new TypeError("reportClientError precisa ser uma função");

  const register = (name, importer, errorKind) => createComponentLoader({ name, importer, setComponent, reportClientError, errorKind });

  return {
    loadHomePage: register("HomePage", () => import("../features/home/HomePage.svelte"), "home_page_load_error"),
    loadNotificationsPage: register("NotificationsPage", () => import("../features/notifications/NotificationsPage.svelte"), "notifications_page_load_error"),
    loadFriendsPage: register("FriendsPage", () => import("../features/social/FriendsPage.svelte"), "friends_page_load_error"),
    loadFollowingPage: register("FollowingPage", () => import("../features/social/FollowingPage.svelte"), "following_page_load_error"),
    loadDirectMessagesPage: register("DirectMessagesPage", () => import("../features/direct/DirectMessagesPage.svelte"), "direct_messages_page_load_error"),
    loadBroadcastPage: register("BroadcastPage", () => import("../features/broadcast/BroadcastPage.svelte"), "broadcast_page_load_error"),
    loadLivePage: register("LivePage", () => import("../features/live/LivePage.svelte"), "live_page_load_error"),
    loadGroupTextWorkspace: register("GroupTextChatWorkspace", () => import("../features/groups/GroupTextChatWorkspace.svelte"), "text_workspace_load_error"),
    loadGroupVoiceWorkspace: register("GroupVoiceWorkspace", () => import("../features/groups/GroupVoiceWorkspace.svelte"), "voice_workspace_load_error"),
    loadGroupMessageSearchDialog: register("GroupMessageSearchDialog", () => import("../features/groups/GroupMessageSearchDialog.svelte"), "group_message_search_dialog_load_error"),
    loadGroupThreadDialog: register("GroupThreadDialog", () => import("../features/groups/GroupThreadDialog.svelte"), "group_thread_dialog_load_error"),
    loadGroupChannelPermissionsSettings: register("GroupChannelPermissionsSettings", () => import("../features/settings/GroupChannelPermissionsSettings.svelte"), "group_channel_permissions_load_error"),
    loadGroupAuditLogSettings: register("GroupAuditLogSettings", () => import("../features/settings/GroupAuditLogSettings.svelte"), "group_audit_log_load_error"),
    loadSettingsPage: register("SettingsPage", () => import("../features/settings/SettingsPage.svelte"), "settings_page_load_error"),
    loadMultistreamPage: register("MultistreamPage", () => import("../features/live/MultistreamPage.svelte"), "multistream_page_load_error"),
    loadContextMenus: register("ContextMenus", () => import("../features/shell/ContextMenus.svelte"), "context_menus_load_error"),
    loadGroupDialogs: register("GroupDialogs", () => import("../features/groups/GroupDialogs.svelte"), "group_dialogs_load_error"),
    loadBroadcastDialogs: register("BroadcastDialogs", () => import("../features/broadcast/BroadcastDialogs.svelte"), "broadcast_dialogs_load_error"),
    loadProfileSettingsExtras: register("ProfileSettingsExtras", () => import("../features/settings/ProfileSettingsExtras.svelte"), "profile_settings_extras_load_error"),
    loadVoiceSettingsPanel: register("VoiceSettingsPanel", () => import("../features/settings/VoiceSettingsPanel.svelte"), "voice_settings_panel_load_error"),
  };
}
