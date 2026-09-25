import { randomUUID } from "node:crypto";

export function createAccountRepository(database, { legalPolicyVersion, createId = randomUUID } = {}) {
  function userDataExport(userId) {
    const account = database.prepare(`
      SELECT id, username, display_name AS displayName, email, avatar_data AS avatarData, created_at AS createdAt
      FROM users WHERE id = ?
    `).get(userId);
    if (!account) return null;
    return {
      exportVersion: "1",
      exportedAt: new Date().toISOString(),
      legal: { policyVersion: legalPolicyVersion, consents: database.prepare("SELECT consent_type AS type, policy_version AS policyVersion, accepted_at AS acceptedAt FROM user_consents WHERE user_id = ? ORDER BY accepted_at").all(userId) },
      account,
      linkedAccounts: database.prepare("SELECT provider, email, created_at AS createdAt, updated_at AS updatedAt FROM oauth_accounts WHERE user_id = ? ORDER BY provider").all(userId),
      preferences: database.prepare("SELECT theme, default_quality AS defaultQuality, default_audio AS defaultAudio, button_color AS buttonColor, input_background_color AS inputBackgroundColor, background_color AS backgroundColor, push_to_talk_key AS pushToTalkKey, mute_shortcut AS muteShortcut, live_notification_scope AS liveNotificationScope, voice_microphone_volume AS voiceMicrophoneVolume, voice_output_volume AS voiceOutputVolume, preferred_input_device_id AS preferredInputDeviceId, preferred_output_device_id AS preferredOutputDeviceId, updated_at AS updatedAt FROM user_preferences WHERE user_id = ?").all(userId),
      voicePreferences: database.prepare("SELECT target_user_id AS targetUserId, volume, locally_muted AS locallyMuted, updated_at AS updatedAt FROM user_voice_preferences WHERE user_id = ? ORDER BY updated_at").all(userId).map((item) => ({ ...item, locallyMuted: Boolean(item.locallyMuted) })),
      channelProfile: database.prepare("SELECT display_name AS displayName, avatar_data AS avatarData, games, updated_at AS updatedAt FROM channel_profiles WHERE user_id = ?").get(userId) || null,
      memberships: database.prepare(`
        SELECT group_members.group_id AS groupId, groups.name AS groupName, groups.slug AS groupSlug, group_members.role, group_members.role_id AS roleId, group_members.created_at AS joinedAt
        FROM group_members JOIN groups ON groups.id = group_members.group_id
        WHERE group_members.user_id = ? ORDER BY group_members.created_at
      `).all(userId),
      ownedGroups: database.prepare("SELECT id, name, slug, created_at AS createdAt FROM groups WHERE owner_id = ? ORDER BY created_at").all(userId),
      permissions: database.prepare("SELECT group_id AS groupId, can_chat AS canChat, can_stream AS canStream, can_invite AS canInvite, can_view_voice_members AS canViewVoiceMembers, updated_at AS updatedAt FROM group_member_permissions WHERE user_id = ? ORDER BY updated_at").all(userId),
      joinRequests: database.prepare("SELECT id, group_id AS groupId, status, created_at AS createdAt, updated_at AS updatedAt, decided_at AS decidedAt FROM group_join_requests WHERE user_id = ? ORDER BY created_at").all(userId),
      invitationsReceived: database.prepare("SELECT id, group_id AS groupId, status, expires_at AS expiresAt, created_at AS createdAt FROM group_user_invites WHERE invited_user_id = ? ORDER BY created_at").all(userId),
      notifications: database.prepare("SELECT id, type, entity_id AS entityId, group_id AS groupId, title, body, created_at AS createdAt, read_at AS readAt FROM notifications WHERE user_id = ? ORDER BY created_at").all(userId),
      streams: database.prepare("SELECT id, room_name AS roomName, title, visibility, group_id AS groupId, room_id AS roomId, voice_room_id AS voiceRoomId, started_at AS startedAt, ended_at AS endedAt FROM streams WHERE created_by = ? ORDER BY started_at").all(userId),
      streamMessages: database.prepare("SELECT id, channel_user_id AS channelUserId, stream_id AS streamId, body, display_name AS displayName, username, created_at AS createdAt FROM stream_chat_messages WHERE user_id = ? ORDER BY created_at").all(userId),
      groupMessages: database.prepare("SELECT id, group_id AS groupId, room_id AS roomId, body, created_at AS createdAt FROM group_messages WHERE user_id = ? ORDER BY created_at").all(userId),
      directConversations: database.prepare(`
        SELECT direct_conversations.id, direct_conversations.created_at AS createdAt,
          direct_conversations.updated_at AS updatedAt
        FROM direct_conversations
        JOIN direct_conversation_members ON direct_conversation_members.conversation_id = direct_conversations.id
        WHERE direct_conversation_members.user_id = ?
        ORDER BY direct_conversations.updated_at
      `).all(userId),
      directMessages: database.prepare(`
        SELECT direct_messages.id, direct_messages.conversation_id AS conversationId,
          direct_messages.sender_id AS senderId, direct_messages.body,
          direct_messages.created_at AS createdAt, direct_messages.read_at AS readAt
        FROM direct_messages
        JOIN direct_conversation_members ON direct_conversation_members.conversation_id = direct_messages.conversation_id
        WHERE direct_conversation_members.user_id = ?
        ORDER BY direct_messages.created_at
      `).all(userId),
      follows: database.prepare("SELECT follower_id AS followerId, followed_id AS followedId, created_at AS createdAt FROM follows WHERE follower_id = ? OR followed_id = ? ORDER BY created_at").all(userId, userId),
      blocks: database.prepare("SELECT blocker_id AS blockerId, blocked_id AS blockedId, created_at AS createdAt FROM user_blocks WHERE blocker_id = ? OR blocked_id = ? ORDER BY created_at").all(userId, userId),
    };
  }

  function deleteUserAccount(userId) {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = database.prepare("DELETE FROM users WHERE id = ?").run(userId);
      if (!result.changes) throw new Error("account-not-found");
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function mergeUsers(targetId, sourceId) {
    if (targetId === sourceId) return;
    const sourceProviders = database.prepare("SELECT provider FROM oauth_accounts WHERE user_id = ?").all(sourceId).map((row) => row.provider);
    const targetProviders = database.prepare("SELECT provider FROM oauth_accounts WHERE user_id = ?").all(targetId).map((row) => row.provider);
    if (sourceProviders.some((provider) => targetProviders.includes(provider))) throw new Error("oauth-provider-conflict");
    const target = database.prepare("SELECT email FROM users WHERE id = ?").get(targetId);
    const source = database.prepare("SELECT email FROM users WHERE id = ?").get(sourceId);
    if (!target || !source) throw new Error("oauth-merge-user-missing");
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("UPDATE groups SET owner_id = ? WHERE owner_id = ?").run(targetId, sourceId);
      database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, created_at) SELECT group_id, ?, role, created_at FROM group_members WHERE user_id = ?").run(targetId, sourceId);
      database.prepare(`
        INSERT OR IGNORE INTO group_member_permissions (group_id, user_id, can_chat, can_stream, can_invite, can_view_voice_members, updated_at)
        SELECT group_id, ?, can_chat, can_stream, can_invite, can_view_voice_members, updated_at
        FROM group_member_permissions WHERE user_id = ?
      `).run(targetId, sourceId);
      database.prepare("UPDATE group_members SET role = 'owner' WHERE user_id = ? AND group_id IN (SELECT group_id FROM group_members WHERE user_id = ? AND role = 'owner')").run(targetId, sourceId);
      database.prepare("DELETE FROM group_members WHERE user_id = ?").run(sourceId);
      database.prepare("UPDATE group_invites SET created_by = ? WHERE created_by = ?").run(targetId, sourceId);
      database.prepare("UPDATE group_rooms SET created_by = ? WHERE created_by = ?").run(targetId, sourceId);
      database.prepare("UPDATE group_messages SET user_id = ? WHERE user_id = ?").run(targetId, sourceId);
      database.prepare("UPDATE streams SET created_by = ? WHERE created_by = ?").run(targetId, sourceId);
      database.prepare("UPDATE channel_profiles SET user_id = ? WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM channel_profiles WHERE user_id = ?)").run(targetId, sourceId, targetId);
      database.prepare(`
        INSERT OR IGNORE INTO follows (follower_id, followed_id, created_at)
        SELECT CASE WHEN follower_id = ? THEN ? ELSE follower_id END,
               CASE WHEN followed_id = ? THEN ? ELSE followed_id END,
               created_at
        FROM follows WHERE (follower_id = ? OR followed_id = ?)
        AND (CASE WHEN follower_id = ? THEN ? ELSE follower_id END) <> (CASE WHEN followed_id = ? THEN ? ELSE followed_id END)
      `).run(sourceId, targetId, sourceId, targetId, sourceId, sourceId, sourceId, targetId, sourceId, targetId);
      database.prepare("DELETE FROM follows WHERE follower_id = ? OR followed_id = ?").run(sourceId, sourceId);
      database.prepare(`
        INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at)
        SELECT CASE WHEN blocker_id = ? THEN ? ELSE blocker_id END,
               CASE WHEN blocked_id = ? THEN ? ELSE blocked_id END,
               created_at
        FROM user_blocks
        WHERE (blocker_id = ? OR blocked_id = ?)
          AND (CASE WHEN blocker_id = ? THEN ? ELSE blocker_id END) <> (CASE WHEN blocked_id = ? THEN ? ELSE blocked_id END)
      `).run(sourceId, targetId, sourceId, targetId, sourceId, sourceId, sourceId, targetId, sourceId, targetId);
      database.prepare("DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?").run(sourceId, sourceId);
      database.prepare("UPDATE oauth_accounts SET user_id = ? WHERE user_id = ?").run(targetId, sourceId);
      database.prepare("UPDATE user_preferences SET user_id = ? WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = ?)").run(targetId, sourceId, targetId);
      database.prepare("DELETE FROM sessions WHERE user_id = ?").run(sourceId);
      database.prepare("DELETE FROM user_preferences WHERE user_id = ?").run(sourceId);
      if (!target.email && source.email) {
        database.prepare("UPDATE users SET email = NULL WHERE id = ?").run(sourceId);
        database.prepare("UPDATE users SET email = ? WHERE id = ?").run(source.email, targetId);
      }
      database.prepare("DELETE FROM users WHERE id = ?").run(sourceId);
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { userDataExport, deleteUserAccount, mergeUsers };
}

async function withPostgresTransaction(database, callback, useProvidedClient = false) {
  const client = useProvidedClient ? database : (typeof database.connect === "function" ? await database.connect() : database);
  const ownsClient = client !== database;
  try {
    if (!useProvidedClient) await client.query("BEGIN");
    const result = await callback(client);
    if (!useProvidedClient) await client.query("COMMIT");
    return result;
  } catch (error) {
    if (!useProvidedClient) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

export function createPostgresAccountRepository(database, { legalPolicyVersion, createId = randomUUID, transactionClient = false } = {}) {
  async function userDataExport(userId) {
    const accountResult = await database.query(`
      SELECT id, username, display_name AS "displayName", email, avatar_data AS "avatarData", created_at AS "createdAt"
      FROM users WHERE id = $1
    `, [userId]);
    const account = accountResult.rows[0];
    if (!account) return null;
    const query = async (text, values = [userId]) => (await database.query(text, values)).rows;
    const one = async (text, values = [userId]) => (await database.query(text, values)).rows[0] || null;
    const [consents, linkedAccounts, preferences, voicePreferences, channelProfile, memberships, ownedGroups, permissions, joinRequests, invitationsReceived, notifications, streams, streamMessages, groupMessages, directConversations, directMessages, follows, blocks] = await Promise.all([
      query('SELECT consent_type AS type, policy_version AS "policyVersion", accepted_at AS "acceptedAt" FROM user_consents WHERE user_id = $1 ORDER BY accepted_at'),
      query('SELECT provider, email, created_at AS "createdAt", updated_at AS "updatedAt" FROM oauth_accounts WHERE user_id = $1 ORDER BY provider'),
      query('SELECT theme, default_quality AS "defaultQuality", default_audio AS "defaultAudio", button_color AS "buttonColor", input_background_color AS "inputBackgroundColor", background_color AS "backgroundColor", push_to_talk_key AS "pushToTalkKey", mute_shortcut AS "muteShortcut", live_notification_scope AS "liveNotificationScope", voice_microphone_volume AS "voiceMicrophoneVolume", voice_output_volume AS "voiceOutputVolume", preferred_input_device_id AS "preferredInputDeviceId", preferred_output_device_id AS "preferredOutputDeviceId", updated_at AS "updatedAt" FROM user_preferences WHERE user_id = $1'),
      query('SELECT target_user_id AS "targetUserId", volume, locally_muted AS "locallyMuted", updated_at AS "updatedAt" FROM user_voice_preferences WHERE user_id = $1 ORDER BY updated_at'),
      one('SELECT display_name AS "displayName", avatar_data AS "avatarData", games, updated_at AS "updatedAt" FROM channel_profiles WHERE user_id = $1'),
      query('SELECT group_members.group_id AS "groupId", groups.name AS "groupName", groups.slug AS "groupSlug", group_members.role, group_members.role_id AS "roleId", group_members.created_at AS "joinedAt" FROM group_members JOIN groups ON groups.id = group_members.group_id WHERE group_members.user_id = $1 ORDER BY group_members.created_at'),
      query('SELECT id, name, slug, created_at AS "createdAt" FROM groups WHERE owner_id = $1 ORDER BY created_at'),
      query('SELECT group_id AS "groupId", can_chat AS "canChat", can_stream AS "canStream", can_invite AS "canInvite", can_view_voice_members AS "canViewVoiceMembers", updated_at AS "updatedAt" FROM group_member_permissions WHERE user_id = $1 ORDER BY updated_at'),
      query('SELECT id, group_id AS "groupId", status, created_at AS "createdAt", updated_at AS "updatedAt", decided_at AS "decidedAt" FROM group_join_requests WHERE user_id = $1 ORDER BY created_at'),
      query('SELECT id, group_id AS "groupId", status, expires_at AS "expiresAt", created_at AS "createdAt" FROM group_user_invites WHERE invited_user_id = $1 ORDER BY created_at'),
      query('SELECT id, type, entity_id AS "entityId", group_id AS "groupId", title, body, created_at AS "createdAt", read_at AS "readAt" FROM notifications WHERE user_id = $1 ORDER BY created_at'),
      query('SELECT id, room_name AS "roomName", title, visibility, group_id AS "groupId", room_id AS "roomId", voice_room_id AS "voiceRoomId", started_at AS "startedAt", ended_at AS "endedAt" FROM streams WHERE created_by = $1 ORDER BY started_at'),
      query('SELECT id, channel_user_id AS "channelUserId", stream_id AS "streamId", body, display_name AS "displayName", username, created_at AS "createdAt" FROM stream_chat_messages WHERE user_id = $1 ORDER BY created_at'),
      query('SELECT id, group_id AS "groupId", room_id AS "roomId", body, created_at AS "createdAt" FROM group_messages WHERE user_id = $1 ORDER BY created_at'),
      query('SELECT direct_conversations.id, direct_conversations.created_at AS "createdAt", direct_conversations.updated_at AS "updatedAt" FROM direct_conversations JOIN direct_conversation_members ON direct_conversation_members.conversation_id = direct_conversations.id WHERE direct_conversation_members.user_id = $1 ORDER BY direct_conversations.updated_at'),
      query('SELECT direct_messages.id, direct_messages.conversation_id AS "conversationId", direct_messages.sender_id AS "senderId", direct_messages.body, direct_messages.created_at AS "createdAt", direct_messages.read_at AS "readAt" FROM direct_messages JOIN direct_conversation_members ON direct_conversation_members.conversation_id = direct_messages.conversation_id WHERE direct_conversation_members.user_id = $1 ORDER BY direct_messages.created_at'),
      query('SELECT follower_id AS "followerId", followed_id AS "followedId", created_at AS "createdAt" FROM follows WHERE follower_id = $1 OR followed_id = $1 ORDER BY created_at'),
      query('SELECT blocker_id AS "blockerId", blocked_id AS "blockedId", created_at AS "createdAt" FROM user_blocks WHERE blocker_id = $1 OR blocked_id = $1 ORDER BY created_at'),
    ]);
    return {
      exportVersion: "1", exportedAt: new Date().toISOString(),
      legal: { policyVersion: legalPolicyVersion, consents }, account, linkedAccounts, preferences,
      voicePreferences: voicePreferences.map((item) => ({ ...item, locallyMuted: Boolean(item.locallyMuted) })),
      channelProfile, memberships, ownedGroups, permissions, joinRequests, invitationsReceived,
      notifications, streams, streamMessages, groupMessages, directConversations, directMessages, follows, blocks,
    };
  }

  async function deleteUserAccount(userId) {
    return withPostgresTransaction(database, async (client) => {
      const result = await client.query("DELETE FROM users WHERE id = $1", [userId]);
      if (!result.rowCount) throw new Error("account-not-found");
    }, transactionClient);
  }

  async function mergeUsers(targetId, sourceId) {
    if (targetId === sourceId) return;
    return withPostgresTransaction(database, async (client) => {
      const [sourceProviders, targetProviders, targetResult, sourceResult] = await Promise.all([
        client.query("SELECT provider FROM oauth_accounts WHERE user_id = $1", [sourceId]),
        client.query("SELECT provider FROM oauth_accounts WHERE user_id = $1", [targetId]),
        client.query("SELECT email FROM users WHERE id = $1", [targetId]),
        client.query("SELECT email FROM users WHERE id = $1", [sourceId]),
      ]);
      if (sourceProviders.rows.some(({ provider }) => targetProviders.rows.some((target) => target.provider === provider))) throw new Error("oauth-provider-conflict");
      const target = targetResult.rows[0];
      const source = sourceResult.rows[0];
      if (!target || !source) throw new Error("oauth-merge-user-missing");
      await client.query("UPDATE groups SET owner_id = $1 WHERE owner_id = $2", [targetId, sourceId]);
      await client.query("INSERT INTO group_members (group_id, user_id, role, created_at) SELECT group_id, $1, role, created_at FROM group_members WHERE user_id = $2 ON CONFLICT (group_id, user_id) DO NOTHING", [targetId, sourceId]);
      await client.query("INSERT INTO group_member_permissions (group_id, user_id, can_chat, can_stream, can_invite, can_view_voice_members, updated_at) SELECT group_id, $1, can_chat, can_stream, can_invite, can_view_voice_members, updated_at FROM group_member_permissions WHERE user_id = $2 ON CONFLICT (group_id, user_id) DO NOTHING", [targetId, sourceId]);
      await client.query("UPDATE group_members SET role = 'owner' WHERE user_id = $1 AND group_id IN (SELECT group_id FROM group_members WHERE user_id = $2 AND role = 'owner')", [targetId, sourceId]);
      await client.query("DELETE FROM group_members WHERE user_id = $1", [sourceId]);
      await client.query("UPDATE group_invites SET created_by = $1 WHERE created_by = $2", [targetId, sourceId]);
      await client.query("UPDATE group_rooms SET created_by = $1 WHERE created_by = $2", [targetId, sourceId]);
      await client.query("UPDATE group_messages SET user_id = $1 WHERE user_id = $2", [targetId, sourceId]);
      await client.query("UPDATE streams SET created_by = $1 WHERE created_by = $2", [targetId, sourceId]);
      await client.query("UPDATE channel_profiles SET user_id = $1 WHERE user_id = $2 AND NOT EXISTS (SELECT 1 FROM channel_profiles WHERE user_id = $1)", [targetId, sourceId]);
      await client.query(`
        INSERT INTO follows (follower_id, followed_id, created_at)
        SELECT CASE WHEN follower_id = $1 THEN $2 ELSE follower_id END,
          CASE WHEN followed_id = $1 THEN $2 ELSE followed_id END, created_at
        FROM follows WHERE (follower_id = $1 OR followed_id = $1)
          AND (CASE WHEN follower_id = $1 THEN $2 ELSE follower_id END) <> (CASE WHEN followed_id = $1 THEN $2 ELSE followed_id END)
        ON CONFLICT (follower_id, followed_id) DO NOTHING
      `, [sourceId, targetId]);
      await client.query("DELETE FROM follows WHERE follower_id = $1 OR followed_id = $1", [sourceId]);
      await client.query(`
        INSERT INTO user_blocks (blocker_id, blocked_id, created_at)
        SELECT CASE WHEN blocker_id = $1 THEN $2 ELSE blocker_id END,
          CASE WHEN blocked_id = $1 THEN $2 ELSE blocked_id END, created_at
        FROM user_blocks WHERE (blocker_id = $1 OR blocked_id = $1)
          AND (CASE WHEN blocker_id = $1 THEN $2 ELSE blocker_id END) <> (CASE WHEN blocked_id = $1 THEN $2 ELSE blocked_id END)
        ON CONFLICT (blocker_id, blocked_id) DO NOTHING
      `, [sourceId, targetId]);
      await client.query("DELETE FROM user_blocks WHERE blocker_id = $1 OR blocked_id = $1", [sourceId]);
      await client.query("UPDATE oauth_accounts SET user_id = $1 WHERE user_id = $2", [targetId, sourceId]);
      await client.query("UPDATE user_preferences SET user_id = $1 WHERE user_id = $2 AND NOT EXISTS (SELECT 1 FROM user_preferences WHERE user_id = $1)", [targetId, sourceId]);
      await client.query("DELETE FROM sessions WHERE user_id = $1", [sourceId]);
      await client.query("DELETE FROM user_preferences WHERE user_id = $1", [sourceId]);
      if (!target.email && source.email) {
        await client.query("UPDATE users SET email = NULL WHERE id = $1", [sourceId]);
        await client.query("UPDATE users SET email = $1 WHERE id = $2", [source.email, targetId]);
      }
      await client.query("DELETE FROM users WHERE id = $1", [sourceId]);
    }, transactionClient);
  }

  return { userDataExport, deleteUserAccount, mergeUsers };
}
