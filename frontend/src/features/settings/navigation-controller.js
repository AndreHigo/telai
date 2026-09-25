export function createSettingsNavigationController({
  api,
  getState,
  setState,
  readStoredVoiceDeviceId,
  readStoredVoiceDeviceLabel,
  loadGroupAdministration,
  loadAudioDevices,
  tick,
  getSettingsPageElement,
}) {
  async function openSettings(tab = "user", returnView) {
    const current = getState();
    setState({
      showGlobalSidebar: false,
      settingsTab: tab,
      settingsSection: tab === "group" ? "group" : "profile",
      settingsReturnView: returnView ?? current.view,
      settingsError: "",
      settingsDisplayName: current.user?.displayName || "",
      settingsAvatarData: current.user?.avatarData || "",
      avatarError: "",
      channelDisplayName: current.user?.displayName || "",
      channelAvatarData: "",
      channelGames: [],
      channelError: "",
      groupSettingsName: current.selectedGroup?.name || "",
      groupRoles: [],
      groupInvites: [],
      groupInviteLink: "",
      groupAdminError: "",
      draggedRoleId: "",
      dragOverRoleId: "",
      roleOrderSaving: false,
      selectedInputDeviceId: current.selectedInputDeviceId || readStoredVoiceDeviceId("mirante-voice-input"),
      selectedInputDeviceLabel: current.selectedInputDeviceLabel || readStoredVoiceDeviceLabel("mirante-voice-input-label"),
      selectedOutputDeviceId: current.selectedOutputDeviceId || readStoredVoiceDeviceId("mirante-voice-output"),
      voiceDevicesError: "",
      view: "settings",
    });
    try {
      const result = await api("/api/auth/channel");
      setState({
        channelDisplayName: result.channel?.displayName || current.user?.displayName || "",
        channelAvatarData: result.channel?.avatarData || "",
        channelGames: result.channel?.games || [],
      });
    } catch (error) {
      setState({ channelError: error.message });
    }
    if (tab === "group" && current.selectedGroupId) await loadGroupAdministration();
    void loadAudioDevices(false).catch((error) => {
      setState({ voiceDevicesError: error.message || "Não foi possível carregar os dispositivos de áudio." });
    });
  }

  function selectSettingsSection(section, tab = "user") {
    setState({ settingsSection: section, settingsTab: tab });
    void tick().then(() => getSettingsPageElement()?.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  return { openSettings, selectSettingsSection };
}
