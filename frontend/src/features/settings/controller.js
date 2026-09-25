const LOCAL_PREFERENCE_KEYS = [
  "mirante-theme",
  "mirante-push-to-talk",
  "mirante-push-to-talk-enabled",
  "mirante-mute-shortcut",
  "mirante-voice-input",
  "mirante-voice-input-label",
  "mirante-voice-output",
  "mirante-voice-microphone-volume",
  "mirante-voice-output-volume",
  "mirante-voice-noise-mode",
  "mirante-voice-profile",
  "mirante-voice-sensitivity-auto",
  "mirante-voice-sensitivity",
  "mirante-voice-advanced-open",
  "mirante-voice-advanced",
  "mirante-sound-preferences",
  "mirante-voice-sounds",
];

function validColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

export function createSettingsController({
  api,
  getState,
  setState,
  qualityProfiles,
  visualDefaults,
  VoicePreferenceMap,
  normalizeAudioVolume,
  readStoredVoiceDeviceId,
  loadStreams,
  syncDesktopShortcuts,
  reapplyVoiceInputSettings,
  resetVoiceActivityCalibration,
  effectiveVoiceOutputVolume,
  voicePreferenceTargetId,
  soundPreferenceDefaults,
  reportClientError,
}) {
  const state = () => getState();

  async function loadPreferences() {
    const result = await api("/api/auth/preferences");
    const preferences = result.preferences || {};
    const theme = preferences.theme === "light" ? "light" : "dark";
    const selectedQuality = qualityProfiles[preferences.defaultQuality] ? preferences.defaultQuality : "balanced";
    const audioMode = ["source", "system"].includes(preferences.defaultAudio) ? preferences.defaultAudio : "source";
    const selectedInputDeviceId = preferences.preferredInputDeviceId || readStoredVoiceDeviceId("mirante-voice-input");
    const selectedOutputDeviceId = preferences.preferredOutputDeviceId || readStoredVoiceDeviceId("mirante-voice-output");
    const voiceMicrophoneVolume = normalizeAudioVolume(preferences.voiceMicrophoneVolume, 1);
    const voiceOutputVolume = normalizeAudioVolume(preferences.voiceOutputVolume, 1);
    const liveNotificationScope = ["related", "all"].includes(preferences.liveNotificationScope)
      ? preferences.liveNotificationScope
      : "related";
    const pushToTalkKey = preferences.pushToTalkKey || "";
    const muteShortcut = preferences.muteShortcut || "";

    try {
      if (selectedInputDeviceId) localStorage.setItem("mirante-voice-input", selectedInputDeviceId);
      if (selectedOutputDeviceId) localStorage.setItem("mirante-voice-output", selectedOutputDeviceId);
      localStorage.setItem("mirante-voice-microphone-volume", String(voiceMicrophoneVolume));
      localStorage.setItem("mirante-voice-output-volume", String(voiceOutputVolume));
      localStorage.setItem("mirante-theme", theme);
    } catch (error) {
      reportClientError("preferences_local_persist_error", error);
    }

    const current = state();
    let pushToTalkEnabled = current.pushToTalkEnabled;
    try {
      if (localStorage.getItem("mirante-push-to-talk-enabled") === null) pushToTalkEnabled = Boolean(pushToTalkKey);
    } catch (error) {
      reportClientError("preferences_local_read_error", error);
    }
    setState({
      theme,
      selectedQuality,
      audioMode,
      selectedInputDeviceId,
      selectedOutputDeviceId,
      voiceMicrophoneVolume,
      voiceOutputVolume,
      liveNotificationScope,
      liveNotificationScopes: liveNotificationScope === "all" ? ["related", "all"] : ["related"],
      pushToTalkKey,
      pushToTalkEnabled,
      muteShortcut,
      buttonColor: validColor(preferences.buttonColor, visualDefaults[theme].button),
      inputBackgroundColor: validColor(preferences.inputBackgroundColor, visualDefaults[theme].input),
      backgroundColor: validColor(preferences.backgroundColor, visualDefaults[theme].background),
    });
    void syncDesktopShortcuts();
  }

  async function loadVoiceUserPreferences() {
    try {
      const result = await api("/api/auth/voice-preferences");
      const preferences = Array.isArray(result.preferences) ? result.preferences : [];
      const voiceVolumes = new VoicePreferenceMap(preferences.map((preference) => [
        String(preference.targetUserId),
        normalizeAudioVolume(preference.volume),
      ]));
      const voiceLocallyMutedParticipants = new Set(preferences
        .filter((preference) => preference.locallyMuted)
        .map((preference) => String(preference.targetUserId)));
      setState({ voiceVolumes, voiceLocallyMutedParticipants });
      const current = state();
      for (const [participantId, audio] of current.voiceRemoteAudio) {
        audio.volume = effectiveVoiceOutputVolume(participantId);
        audio.muted = current.voiceDeafened || voiceLocallyMutedParticipants.has(voicePreferenceTargetId(participantId));
      }
    } catch (error) {
      reportClientError("voice_preferences_load_failed", error);
      setState({ voiceVolumes: new VoicePreferenceMap(), voiceLocallyMutedParticipants: new Set() });
    }
  }

  async function saveChannelProfile() {
    const current = state();
    if (current.channelDisplayName.trim().length < 2) return;
    setState({ settingsBusy: true, channelError: "" });
    try {
      const result = await api("/api/auth/channel", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: current.channelDisplayName.trim(),
          avatarData: current.channelAvatarData || null,
          games: current.channelGames,
        }),
      });
      setState({
        channelDisplayName: result.channel.displayName,
        channelAvatarData: result.channel.avatarData || "",
        channelGames: result.channel.games || [],
        notice: "Perfil do canal atualizado.",
      });
      await loadStreams();
    } catch (error) {
      setState({ channelError: error.message });
    } finally {
      setState({ settingsBusy: false });
    }
  }

  async function saveProfile() {
    const current = state();
    if (current.settingsDisplayName.trim().length < 2) return;
    setState({ settingsBusy: true, settingsError: "" });
    try {
      const result = await api("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: current.settingsDisplayName.trim(),
          avatarData: current.settingsAvatarData || null,
        }),
      });
      setState({ user: result.user, notice: "Perfil atualizado." });
    } catch (error) {
      setState({ settingsError: error.message });
    } finally {
      setState({ settingsBusy: false });
    }
  }

  async function savePreferences() {
    const current = state();
    setState({ settingsBusy: true, settingsError: "" });
    try {
      const result = await api("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          theme: current.theme,
          defaultQuality: current.selectedQuality,
          defaultAudio: current.audioMode,
          buttonColor: current.buttonColor,
          inputBackgroundColor: current.inputBackgroundColor,
          backgroundColor: current.backgroundColor,
          pushToTalkKey: current.pushToTalkKey,
          muteShortcut: current.muteShortcut,
          liveNotificationScope: current.liveNotificationScope,
          voiceMicrophoneVolume: current.voiceMicrophoneVolume,
          voiceOutputVolume: current.voiceOutputVolume,
        }),
      });
      const preferences = result.preferences || {};
      const voiceMicrophoneVolume = normalizeAudioVolume(preferences.voiceMicrophoneVolume, current.voiceMicrophoneVolume);
      const voiceOutputVolume = normalizeAudioVolume(preferences.voiceOutputVolume, current.voiceOutputVolume);
      const liveNotificationScope = ["related", "all"].includes(preferences.liveNotificationScope)
        ? preferences.liveNotificationScope
        : "related";
      setState({
        theme: preferences.theme || current.theme,
        buttonColor: preferences.buttonColor || current.buttonColor,
        inputBackgroundColor: preferences.inputBackgroundColor || current.inputBackgroundColor,
        backgroundColor: preferences.backgroundColor || current.backgroundColor,
        muteShortcut: preferences.muteShortcut || current.muteShortcut,
        voiceMicrophoneVolume,
        voiceOutputVolume,
        liveNotificationScope,
        liveNotificationScopes: liveNotificationScope === "all" ? ["related", "all"] : ["related"],
        notice: "Preferências salvas.",
      });
      try {
        localStorage.setItem("mirante-voice-microphone-volume", String(voiceMicrophoneVolume));
        localStorage.setItem("mirante-voice-output-volume", String(voiceOutputVolume));
        localStorage.setItem("mirante-push-to-talk", current.pushToTalkKey);
        localStorage.setItem("mirante-mute-shortcut", preferences.muteShortcut || current.muteShortcut);
        localStorage.setItem("mirante-theme", preferences.theme || current.theme);
      } catch (error) {
        reportClientError("preferences_local_persist_error", error);
      }
      await syncDesktopShortcuts();
      window.miranteDesktop?.setTheme?.(preferences.theme || current.theme);
    } catch (error) {
      setState({ settingsError: error.message });
    } finally {
      setState({ settingsBusy: false });
    }
  }

  async function resetPreferencesToDefaults() {
    setState({ preferencesResetBusy: true, settingsError: "" });
    try {
      const defaults = visualDefaults.dark;
      await api("/api/auth/voice-preferences", { method: "DELETE" });
      await api("/api/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          theme: "dark",
          defaultQuality: "balanced",
          defaultAudio: "source",
          buttonColor: defaults.button,
          inputBackgroundColor: defaults.input,
          backgroundColor: defaults.background,
          pushToTalkKey: "",
          muteShortcut: "",
          liveNotificationScope: "related",
          voiceMicrophoneVolume: 1,
          voiceOutputVolume: 1,
        }),
      });

      try {
        LOCAL_PREFERENCE_KEYS.forEach((key) => localStorage.removeItem(key));
        localStorage.setItem("mirante-theme", "dark");
        localStorage.setItem("mirante-voice-microphone-volume", "1");
        localStorage.setItem("mirante-voice-output-volume", "1");
      } catch (error) {
        reportClientError("preferences_local_reset_error", error);
      }

      setState({
        theme: "dark",
        selectedQuality: "balanced",
        audioMode: "source",
        buttonColor: defaults.button,
        inputBackgroundColor: defaults.input,
        backgroundColor: defaults.background,
        pushToTalkKey: "",
        pushToTalkEnabled: false,
        muteShortcut: "",
        liveNotificationScope: "related",
        liveNotificationScopes: ["related"],
        voiceMicrophoneVolume: 1,
        voiceOutputVolume: 1,
        voiceVolumes: new VoicePreferenceMap(),
        voiceLocallyMutedParticipants: new Set(),
        selectedInputDeviceId: "",
        selectedInputDeviceLabel: "",
        selectedOutputDeviceId: "",
        voiceNoiseMode: "native",
        voiceInputProfile: "isolation",
        voiceSensitivityAuto: true,
        voiceSensitivity: 0.5,
        voiceAdvancedOpen: false,
        voiceAdvancedOptions: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        soundPreferences: { ...soundPreferenceDefaults },
        voiceSoundEffects: true,
        preferencesResetConfirm: false,
        notice: "Preferências restauradas para os padrões.",
      });

      const current = state();
      for (const [participantId, audio] of current.voiceRemoteAudio) {
        audio.volume = effectiveVoiceOutputVolume(participantId);
        audio.muted = current.voiceDeafened;
      }
      window.miranteDesktop?.setTheme?.("dark");
      await syncDesktopShortcuts();
      await reapplyVoiceInputSettings();
      for (const [participantId, audio] of current.voiceRemoteAudio) audio.volume = effectiveVoiceOutputVolume(participantId);
      resetVoiceActivityCalibration();
    } catch (error) {
      setState({ settingsError: error.message });
    } finally {
      setState({ preferencesResetBusy: false });
    }
  }

  return {
    loadPreferences,
    loadVoiceUserPreferences,
    saveChannelProfile,
    saveProfile,
    savePreferences,
    resetPreferencesToDefaults,
  };
}
