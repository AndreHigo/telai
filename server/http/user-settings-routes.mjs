export function createUserSettingsRoutes({
  json,
  readJson,
  requireUser,
  currentUser,
  userWithLinkedAccounts,
  userProfileRepository,
  channelProfileForUser,
  channelProfileRepository,
  userPreferenceRepository,
  parseChannelGames,
  safePreferenceColor,
  normalizePreferenceVolume,
  normalizePreferenceDeviceId,
  maxAvatarUploadLength,
}) {
  const validAvatar = (value) => /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value)
    && value.length <= maxAvatarUploadLength;

  return async function handleUserSettingsRoutes(request, response, requestUrl) {
    if (requestUrl.pathname === "/api/auth/profile" && request.method === "PATCH") {
      const user = requireUser(request, response);
      if (!user) return true;
      readJson(request, 8 * 1024 * 1024).then((body) => {
        const displayName = String(body.displayName || "").trim().slice(0, 48);
        if (displayName.length < 2) return json(response, 400, { error: "Informe um nome de exibição válido." });
        const avatarWasProvided = Object.prototype.hasOwnProperty.call(body, "avatarData");
        const avatarData = avatarWasProvided && body.avatarData ? String(body.avatarData) : (avatarWasProvided ? null : user.avatarData || null);
        if (avatarData && !validAvatar(avatarData)) {
          return json(response, 400, { error: "A foto deve ser PNG, JPG, WEBP ou GIF com até 5 MB." });
        }
        userProfileRepository.updateProfile(user.id, { displayName, avatarData });
        return json(response, 200, { user: userWithLinkedAccounts(currentUser(request)) });
      }).catch((error) => json(response, 400, { error: error.message === "body-too-large" ? "A foto é muito grande. Use um arquivo de até 5 MB." : "Não foi possível atualizar o perfil." }));
      return true;
    }

    if (requestUrl.pathname === "/api/auth/channel" && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      json(response, 200, { channel: channelProfileForUser(user.id) });
      return true;
    }

    if (requestUrl.pathname === "/api/auth/channel" && request.method === "PATCH") {
      const user = requireUser(request, response);
      if (!user) return true;
      readJson(request, 8 * 1024 * 1024).then((body) => {
        const current = channelProfileForUser(user.id);
        const displayName = String(body.displayName || "").trim().slice(0, 48);
        if (displayName.length < 2) return json(response, 400, { error: "Informe um nome válido para o canal." });
        const avatarWasProvided = Object.prototype.hasOwnProperty.call(body, "avatarData");
        const avatarData = avatarWasProvided && body.avatarData ? String(body.avatarData) : (avatarWasProvided ? null : current?.avatarData || null);
        if (avatarData && !validAvatar(avatarData)) {
          return json(response, 400, { error: "A foto do canal deve ser PNG, JPG, WEBP ou GIF com até 5 MB." });
        }
        const games = Array.isArray(body.games) ? parseChannelGames(body.games) : (current?.games || []);
        return json(response, 200, { channel: channelProfileRepository.saveChannelProfile(user.id, { displayName, avatarData, games, updatedAt: new Date().toISOString() }) });
      }).catch((error) => json(response, 400, { error: error.message === "body-too-large" ? "A foto é muito grande. Use um arquivo de até 5 MB." : "Não foi possível atualizar o canal." }));
      return true;
    }

    if (requestUrl.pathname === "/api/auth/preferences" && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      json(response, 200, { preferences: userPreferenceRepository.getPreferences(user.id) });
      return true;
    }

    if (requestUrl.pathname === "/api/auth/preferences" && request.method === "PATCH") {
      const user = requireUser(request, response);
      if (!user) return true;
      readJson(request).then((body) => {
        const existing = userPreferenceRepository.getStoredPreferences(user.id);
        const theme = Object.prototype.hasOwnProperty.call(body, "theme")
          ? (["dark", "light"].includes(body.theme) ? body.theme : "dark")
          : (existing?.theme || "dark");
        const defaultQuality = Object.prototype.hasOwnProperty.call(body, "defaultQuality")
          ? (["economy", "balanced", "high"].includes(body.defaultQuality) ? body.defaultQuality : "balanced")
          : (existing?.defaultQuality || "balanced");
        const defaultAudio = Object.prototype.hasOwnProperty.call(body, "defaultAudio")
          ? (["source", "system"].includes(body.defaultAudio) ? body.defaultAudio : "source")
          : (existing?.defaultAudio || "source");
        const buttonColor = Object.prototype.hasOwnProperty.call(body, "buttonColor") ? safePreferenceColor(body.buttonColor) : (existing?.buttonColor || null);
        const inputBackgroundColor = Object.prototype.hasOwnProperty.call(body, "inputBackgroundColor") ? safePreferenceColor(body.inputBackgroundColor) : (existing?.inputBackgroundColor || null);
        const backgroundColor = Object.prototype.hasOwnProperty.call(body, "backgroundColor") ? safePreferenceColor(body.backgroundColor) : (existing?.backgroundColor || null);
        const pushToTalkKey = Object.prototype.hasOwnProperty.call(body, "pushToTalkKey")
          ? String(body.pushToTalkKey || "").trim().slice(0, 40) || null
          : existing?.pushToTalkKey || null;
        const muteShortcut = Object.prototype.hasOwnProperty.call(body, "muteShortcut")
          ? String(body.muteShortcut || "").trim().slice(0, 40) || null
          : existing?.muteShortcut || null;
        const liveNotificationScope = ["related", "all"].includes(body.liveNotificationScope)
          ? body.liveNotificationScope
          : (existing?.liveNotificationScope || "related");
        const voiceMicrophoneVolume = Object.prototype.hasOwnProperty.call(body, "voiceMicrophoneVolume")
          ? normalizePreferenceVolume(body.voiceMicrophoneVolume)
          : normalizePreferenceVolume(existing?.voiceMicrophoneVolume);
        const voiceOutputVolume = Object.prototype.hasOwnProperty.call(body, "voiceOutputVolume")
          ? normalizePreferenceVolume(body.voiceOutputVolume)
          : normalizePreferenceVolume(existing?.voiceOutputVolume);
        const preferredInputDeviceId = Object.prototype.hasOwnProperty.call(body, "preferredInputDeviceId")
          ? normalizePreferenceDeviceId(body.preferredInputDeviceId)
          : normalizePreferenceDeviceId(existing?.preferredInputDeviceId);
        const preferredOutputDeviceId = Object.prototype.hasOwnProperty.call(body, "preferredOutputDeviceId")
          ? normalizePreferenceDeviceId(body.preferredOutputDeviceId)
          : normalizePreferenceDeviceId(existing?.preferredOutputDeviceId);
        userPreferenceRepository.savePreferences(user.id, { theme, defaultQuality, defaultAudio, buttonColor, inputBackgroundColor, backgroundColor, pushToTalkKey, muteShortcut, liveNotificationScope, voiceMicrophoneVolume, voiceOutputVolume, preferredInputDeviceId, preferredOutputDeviceId }, new Date().toISOString());
        return json(response, 200, { preferences: userPreferenceRepository.getPreferences(user.id) });
      }).catch(() => json(response, 400, { error: "Não foi possível salvar suas preferências." }));
      return true;
    }

    if (requestUrl.pathname === "/api/auth/voice-preferences" && request.method === "GET") {
      const user = requireUser(request, response);
      if (!user) return true;
      json(response, 200, { preferences: userPreferenceRepository.listVoicePreferences(user.id) });
      return true;
    }

    if (requestUrl.pathname === "/api/auth/voice-preferences" && request.method === "PATCH") {
      const user = requireUser(request, response);
      if (!user) return true;
      readJson(request).then((body) => {
        const targetUserId = String(body.targetUserId || "").trim().slice(0, 128);
        if (!targetUserId || targetUserId === user.id) return json(response, 400, { error: "Informe um usuário de voz válido." });
        if (!userProfileRepository.existsById(targetUserId)) return json(response, 404, { error: "Usuário de voz não encontrado." });
        const current = userPreferenceRepository.getVoicePreference(user.id, targetUserId);
        const volume = Object.prototype.hasOwnProperty.call(body, "volume")
          ? normalizePreferenceVolume(body.volume)
          : normalizePreferenceVolume(current?.volume);
        const locallyMuted = Object.prototype.hasOwnProperty.call(body, "locallyMuted")
          ? Boolean(body.locallyMuted)
          : Boolean(current?.locallyMuted);
        const updatedAt = new Date().toISOString();
        userPreferenceRepository.saveVoicePreference(user.id, targetUserId, volume, locallyMuted, updatedAt);
        return json(response, 200, { preference: { targetUserId, volume, locallyMuted, updatedAt } });
      }).catch(() => json(response, 400, { error: "Não foi possível salvar a preferência de áudio do usuário." }));
      return true;
    }

    if (requestUrl.pathname === "/api/auth/voice-preferences" && request.method === "DELETE") {
      const user = requireUser(request, response);
      if (!user) return true;
      userPreferenceRepository.deleteVoicePreferences(user.id);
      json(response, 200, { preferences: [] });
      return true;
    }

    return false;
  };
}
