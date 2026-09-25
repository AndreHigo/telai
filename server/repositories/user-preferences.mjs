export function createUserPreferenceRepository(database, { normalizePreferenceVolume }) {
  function getPreferences(userId) {
    const preferences = database.prepare(`
      SELECT theme, default_quality AS defaultQuality, default_audio AS defaultAudio,
        button_color AS buttonColor, input_background_color AS inputBackgroundColor,
        background_color AS backgroundColor, push_to_talk_key AS pushToTalkKey,
        mute_shortcut AS muteShortcut, live_notification_scope AS liveNotificationScope,
        voice_microphone_volume AS voiceMicrophoneVolume, voice_output_volume AS voiceOutputVolume,
        preferred_input_device_id AS preferredInputDeviceId, preferred_output_device_id AS preferredOutputDeviceId
      FROM user_preferences WHERE user_id = ?
    `).get(userId);
    return {
      theme: preferences?.theme || "dark",
      defaultQuality: preferences?.defaultQuality || "balanced",
      defaultAudio: preferences?.defaultAudio || "source",
      buttonColor: preferences?.buttonColor || null,
      inputBackgroundColor: preferences?.inputBackgroundColor || null,
      backgroundColor: preferences?.backgroundColor || null,
      pushToTalkKey: preferences?.pushToTalkKey || null,
      muteShortcut: preferences?.muteShortcut || null,
      liveNotificationScope: preferences?.liveNotificationScope === "all" ? "all" : "related",
      voiceMicrophoneVolume: normalizePreferenceVolume(preferences?.voiceMicrophoneVolume),
      voiceOutputVolume: normalizePreferenceVolume(preferences?.voiceOutputVolume),
      preferredInputDeviceId: preferences?.preferredInputDeviceId || null,
      preferredOutputDeviceId: preferences?.preferredOutputDeviceId || null,
    };
  }

  function getStoredPreferences(userId) {
    return database.prepare(`
      SELECT theme, default_quality AS defaultQuality, default_audio AS defaultAudio,
        button_color AS buttonColor, input_background_color AS inputBackgroundColor,
        background_color AS backgroundColor, push_to_talk_key AS pushToTalkKey,
        mute_shortcut AS muteShortcut, live_notification_scope AS liveNotificationScope,
        voice_microphone_volume AS voiceMicrophoneVolume, voice_output_volume AS voiceOutputVolume,
        preferred_input_device_id AS preferredInputDeviceId, preferred_output_device_id AS preferredOutputDeviceId
      FROM user_preferences WHERE user_id = ?
    `).get(userId);
  }

  function savePreferences(userId, values, updatedAt) {
    database.prepare(`
      INSERT INTO user_preferences (user_id, theme, default_quality, default_audio, button_color, input_background_color, background_color, push_to_talk_key, mute_shortcut, live_notification_scope, voice_microphone_volume, voice_output_volume, preferred_input_device_id, preferred_output_device_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, default_quality = excluded.default_quality, default_audio = excluded.default_audio, button_color = excluded.button_color, input_background_color = excluded.input_background_color, background_color = excluded.background_color, push_to_talk_key = excluded.push_to_talk_key, mute_shortcut = excluded.mute_shortcut, live_notification_scope = excluded.live_notification_scope, voice_microphone_volume = excluded.voice_microphone_volume, voice_output_volume = excluded.voice_output_volume, preferred_input_device_id = excluded.preferred_input_device_id, preferred_output_device_id = excluded.preferred_output_device_id, updated_at = excluded.updated_at
    `).run(userId, values.theme, values.defaultQuality, values.defaultAudio, values.buttonColor, values.inputBackgroundColor, values.backgroundColor, values.pushToTalkKey, values.muteShortcut, values.liveNotificationScope, values.voiceMicrophoneVolume, values.voiceOutputVolume, values.preferredInputDeviceId, values.preferredOutputDeviceId, updatedAt);
  }

  function listVoicePreferences(userId) {
    return database.prepare(`
      SELECT target_user_id AS targetUserId, volume, locally_muted AS locallyMuted, updated_at AS updatedAt
      FROM user_voice_preferences
      WHERE user_id = ?
      ORDER BY updated_at
    `).all(userId).map((item) => ({ ...item, locallyMuted: Boolean(item.locallyMuted) }));
  }

  function getVoicePreference(userId, targetUserId) {
    return database.prepare("SELECT volume, locally_muted AS locallyMuted FROM user_voice_preferences WHERE user_id = ? AND target_user_id = ?").get(userId, targetUserId);
  }

  function saveVoicePreference(userId, targetUserId, volume, locallyMuted, updatedAt) {
    database.prepare(`
      INSERT INTO user_voice_preferences (user_id, target_user_id, volume, locally_muted, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, target_user_id) DO UPDATE SET volume = excluded.volume, locally_muted = excluded.locally_muted, updated_at = excluded.updated_at
    `).run(userId, targetUserId, volume, locallyMuted ? 1 : 0, updatedAt);
  }

  function deleteVoicePreferences(userId) {
    database.prepare("DELETE FROM user_voice_preferences WHERE user_id = ?").run(userId);
  }

  return { getPreferences, getStoredPreferences, savePreferences, listVoicePreferences, getVoicePreference, saveVoicePreference, deleteVoicePreferences };
}

export function createPostgresUserPreferenceRepository(database, { normalizePreferenceVolume }) {
  const preferenceSelect = `
    SELECT theme, default_quality AS "defaultQuality", default_audio AS "defaultAudio",
      button_color AS "buttonColor", input_background_color AS "inputBackgroundColor",
      background_color AS "backgroundColor", push_to_talk_key AS "pushToTalkKey",
      mute_shortcut AS "muteShortcut", live_notification_scope AS "liveNotificationScope",
      voice_microphone_volume AS "voiceMicrophoneVolume", voice_output_volume AS "voiceOutputVolume",
      preferred_input_device_id AS "preferredInputDeviceId", preferred_output_device_id AS "preferredOutputDeviceId"
    FROM user_preferences WHERE user_id = $1
  `;

  function normalize(preferences) {
    return {
      theme: preferences?.theme || "dark",
      defaultQuality: preferences?.defaultQuality || "balanced",
      defaultAudio: preferences?.defaultAudio || "source",
      buttonColor: preferences?.buttonColor || null,
      inputBackgroundColor: preferences?.inputBackgroundColor || null,
      backgroundColor: preferences?.backgroundColor || null,
      pushToTalkKey: preferences?.pushToTalkKey || null,
      muteShortcut: preferences?.muteShortcut || null,
      liveNotificationScope: preferences?.liveNotificationScope === "all" ? "all" : "related",
      voiceMicrophoneVolume: normalizePreferenceVolume(preferences?.voiceMicrophoneVolume),
      voiceOutputVolume: normalizePreferenceVolume(preferences?.voiceOutputVolume),
      preferredInputDeviceId: preferences?.preferredInputDeviceId || null,
      preferredOutputDeviceId: preferences?.preferredOutputDeviceId || null,
    };
  }

  async function getPreferences(userId) {
    const result = await database.query(preferenceSelect, [userId]);
    return normalize(result.rows[0]);
  }

  async function getStoredPreferences(userId) {
    const result = await database.query(preferenceSelect, [userId]);
    return result.rows[0] || null;
  }

  async function savePreferences(userId, values, updatedAt) {
    await database.query(`
      INSERT INTO user_preferences (user_id, theme, default_quality, default_audio, button_color, input_background_color, background_color, push_to_talk_key, mute_shortcut, live_notification_scope, voice_microphone_volume, voice_output_volume, preferred_input_device_id, preferred_output_device_id, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT(user_id) DO UPDATE SET theme = EXCLUDED.theme, default_quality = EXCLUDED.default_quality, default_audio = EXCLUDED.default_audio, button_color = EXCLUDED.button_color, input_background_color = EXCLUDED.input_background_color, background_color = EXCLUDED.background_color, push_to_talk_key = EXCLUDED.push_to_talk_key, mute_shortcut = EXCLUDED.mute_shortcut, live_notification_scope = EXCLUDED.live_notification_scope, voice_microphone_volume = EXCLUDED.voice_microphone_volume, voice_output_volume = EXCLUDED.voice_output_volume, preferred_input_device_id = EXCLUDED.preferred_input_device_id, preferred_output_device_id = EXCLUDED.preferred_output_device_id, updated_at = EXCLUDED.updated_at
    `, [userId, values.theme, values.defaultQuality, values.defaultAudio, values.buttonColor, values.inputBackgroundColor, values.backgroundColor, values.pushToTalkKey, values.muteShortcut, values.liveNotificationScope, values.voiceMicrophoneVolume, values.voiceOutputVolume, values.preferredInputDeviceId, values.preferredOutputDeviceId, updatedAt]);
  }

  async function listVoicePreferences(userId) {
    const result = await database.query(`
      SELECT target_user_id AS "targetUserId", volume, locally_muted AS "locallyMuted", updated_at AS "updatedAt"
      FROM user_voice_preferences WHERE user_id = $1 ORDER BY updated_at
    `, [userId]);
    return result.rows.map((item) => ({ ...item, locallyMuted: Boolean(item.locallyMuted) }));
  }

  async function getVoicePreference(userId, targetUserId) {
    const result = await database.query(
      'SELECT volume, locally_muted AS "locallyMuted" FROM user_voice_preferences WHERE user_id = $1 AND target_user_id = $2',
      [userId, targetUserId],
    );
    return result.rows[0] || null;
  }

  async function saveVoicePreference(userId, targetUserId, volume, locallyMuted, updatedAt) {
    await database.query(`
      INSERT INTO user_voice_preferences (user_id, target_user_id, volume, locally_muted, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(user_id, target_user_id) DO UPDATE SET volume = EXCLUDED.volume, locally_muted = EXCLUDED.locally_muted, updated_at = EXCLUDED.updated_at
    `, [userId, targetUserId, volume, locallyMuted ? 1 : 0, updatedAt]);
  }

  async function deleteVoicePreferences(userId) {
    await database.query("DELETE FROM user_voice_preferences WHERE user_id = $1", [userId]);
  }

  return { getPreferences, getStoredPreferences, savePreferences, listVoicePreferences, getVoicePreference, saveVoicePreference, deleteVoicePreferences };
}
