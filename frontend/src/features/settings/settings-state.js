import { createStateStore } from "../../services/state-store.js";

const DEFAULT_SETTINGS_STATE = {
  settingsTab: "user",
  settingsSection: "profile",
  settingsReturnView: "home",
  settingsBusy: false,
  settingsError: "",
  preferencesResetConfirm: false,
  preferencesResetBusy: false,
  settingsDisplayName: "",
  settingsAvatarData: "",
  avatarError: "",
  channelDisplayName: "",
  channelAvatarData: "",
  channelGames: [],
  channelError: "",
};

function createDefaultSettingsState() {
  return {
    ...DEFAULT_SETTINGS_STATE,
    channelGames: [],
  };
}

export function createSettingsStateStore(initial = {}) {
  return createStateStore(DEFAULT_SETTINGS_STATE, initial, createDefaultSettingsState);
}
