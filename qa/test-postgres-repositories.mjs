import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseConfig } from "../server/config/database.mjs";
import { createPostgresPool } from "../server/repositories/postgres.mjs";
import { createPostgresSessionRepository } from "../server/repositories/sessions.mjs";
import { createPostgresGroupAccessRepository } from "../server/repositories/groups.mjs";
import { createPostgresDirectConversationRepository } from "../server/repositories/direct-conversations.mjs";
import { createPostgresChannelProfileRepository } from "../server/repositories/channel-profiles.mjs";
import { createPostgresUserPreferenceRepository } from "../server/repositories/user-preferences.mjs";
import { createPostgresNotificationRepository } from "../server/repositories/notifications.mjs";
import { createPostgresNotificationSyncService } from "../server/services/postgres-notification-sync.mjs";

const config = createDatabaseConfig();
if (config.driver !== "postgres") throw new Error("Set TELAI_DATABASE_DRIVER=postgres before running repository tests.");

const pool = createPostgresPool(config);
const client = await pool.connect();
const ids = { owner: randomUUID(), member: randomUUID(), group: randomUUID(), conversation: randomUUID() };
const now = new Date().toISOString();
const compactUserSummary = (user) => ({ id: user.id, username: user.username, displayName: user.displayName });
const normalizePreferenceVolume = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 1;

try {
  await client.query("BEGIN");
  await client.query(`
    INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES
      ($1, 'pg-owner', 'PG Owner', 'test', $3),
      ($2, 'pg-member', 'PG Member', 'test', $3)
  `, [ids.owner, ids.member, now]);
  await client.query("INSERT INTO groups (id, name, slug, owner_id, created_at) VALUES ($1, 'PG Group', $2, $3, $4)", [ids.group, `pg-${ids.group}`, ids.owner, now]);
  await client.query("INSERT INTO group_members (group_id, user_id, role, created_at) VALUES ($1, $2, 'owner', $3), ($1, $4, 'member', $3)", [ids.group, ids.owner, now, ids.member]);
  await client.query("INSERT INTO direct_conversations (id, created_at, updated_at) VALUES ($1, $2, $2)", [ids.conversation, now]);
  await client.query("INSERT INTO direct_conversation_members (conversation_id, user_id, created_at) VALUES ($1, $2, $3), ($1, $4, $3)", [ids.conversation, ids.owner, now, ids.member]);
  await client.query("INSERT INTO channel_profiles (user_id, display_name, avatar_data, games, updated_at) VALUES ($1, 'Owner Channel', NULL, '[]', $2)", [ids.owner, now]);

  const sessions = createPostgresSessionRepository(client, { hashSessionToken: (token) => `hash:${token}` });
  await sessions.create({ userId: ids.owner, token: "token", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now });
  assert.equal((await sessions.findUserByToken("token"))?.id, ids.owner);

  const groups = createPostgresGroupAccessRepository(client);
  assert.equal(await groups.isGroupMember(ids.member, ids.group), true);
  assert.deepEqual(await groups.groupPermissions(ids.group, ids.owner), { canChat: true, canStream: true, canInvite: true, canMoveMembers: true, canViewVoiceMembers: true });
  assert.equal(await groups.canGroupAction(ids.member, ids.group, "canChat"), true);

  const conversations = createPostgresDirectConversationRepository(client, { compactUserSummary });
  assert.equal((await conversations.directConversationForUser(ids.conversation, ids.owner))?.id, ids.conversation);
  assert.equal((await conversations.directConversationPayload(ids.conversation, ids.owner))?.otherUser.username, "pg-member");

  const profiles = createPostgresChannelProfileRepository(client, { parseChannelGames: (value) => JSON.parse(value || "[]") });
  assert.equal((await profiles.channelProfileForUser(ids.owner))?.displayName, "Owner Channel");

  const preferences = createPostgresUserPreferenceRepository(client, { normalizePreferenceVolume });
  await preferences.savePreferences(ids.owner, {
    theme: "dark", defaultQuality: "high", defaultAudio: "source", buttonColor: "#fff", inputBackgroundColor: null,
    backgroundColor: null, pushToTalkKey: "KeyV", muteShortcut: "KeyM", liveNotificationScope: "all",
    voiceMicrophoneVolume: 0.7, voiceOutputVolume: 0.8, preferredInputDeviceId: "in", preferredOutputDeviceId: "out",
  }, now);
  assert.equal((await preferences.getPreferences(ids.owner)).defaultQuality, "high");
  await preferences.saveVoicePreference(ids.owner, ids.member, 0.5, true, now);
  assert.equal((await preferences.getVoicePreference(ids.owner, ids.member)).locallyMuted, 1);

  const notifications = createPostgresNotificationRepository(client, { createId: () => randomUUID() });
  await notifications.createNotification({ userId: ids.owner, type: "test", entityId: ids.group, title: "Teste", body: "Postgres", createdAt: now });
  await notifications.createNotification({ userId: ids.owner, type: "test", entityId: ids.group, title: "Duplicado", body: "Ignorar", createdAt: now });
  assert.equal((await notifications.listNotifications(ids.owner, now)).length, 1);
  assert.equal(await notifications.hasNotification(ids.owner, (await client.query("SELECT id FROM notifications WHERE user_id = $1 LIMIT 1", [ids.owner])).rows[0].id), true);
  await notifications.markAllRead(ids.owner, now);

  const notificationSync = createPostgresNotificationSyncService(client, {
    getNotificationScope: async () => "all",
    isStreamLive: () => true,
    createLiveContext: () => null,
    createNotification: async () => {},
  });
  await notificationSync.sync(ids.owner);

  await client.query("ROLLBACK");
  console.log(JSON.stringify({ ok: true, repositories: ["sessions", "groups", "direct-conversations", "channel-profiles", "user-preferences", "notifications", "notification-sync"], rollback: true }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
