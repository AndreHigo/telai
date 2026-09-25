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
import { createPostgresAuthRepository } from "../server/repositories/auth.mjs";
import { createPostgresOAuthRepository } from "../server/repositories/oauth.mjs";
import { createPostgresAccountRepository } from "../server/repositories/accounts.mjs";

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

  const auth = createPostgresAuthRepository(client, { legalPolicyVersion: "test-v1" });
  await auth.recordLegalConsents(ids.owner, now);
  await auth.recordLegalConsents(ids.owner, now);
  assert.equal((await auth.legalConsentStatus(ids.owner)).required, false);
  assert.equal((await auth.userWithLinkedAccounts({ id: ids.owner, username: "pg-owner", displayName: "PG Owner", avatarData: null })).linkedAccounts.length, 0);

  const oauth = createPostgresOAuthRepository(client, {
    slugFor: (value) => String(value || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32),
    createPasswordHash: () => "oauth-test-password",
    mergeUsers: async () => { throw new Error("merge-not-used-in-test"); },
  });
  const oauthUser = await oauth.upsertOAuthUser("test", {
    providerUserId: `provider-${ids.owner}`,
    email: "pg-oauth@example.test",
    emailVerified: true,
    displayName: "PG OAuth",
    usernameHint: "pg-oauth",
  });
  assert.equal(oauthUser.displayName, "PG OAuth");
  assert.equal((await oauth.upsertOAuthUser("test", {
    providerUserId: `provider-${ids.owner}`,
    email: "pg-oauth-updated@example.test",
    emailVerified: true,
    displayName: "Updated Name",
    usernameHint: "updated",
  })).id, oauthUser.id);

  const accounts = createPostgresAccountRepository(client, { legalPolicyVersion: "test-v1", transactionClient: true });
  const exported = await accounts.userDataExport(ids.owner);
  assert.equal(exported.exportVersion, "1");
  await accounts.mergeUsers(ids.owner, oauthUser.id);
  assert.equal((await client.query("SELECT id FROM users WHERE id = $1", [oauthUser.id])).rowCount, 0);
  assert.equal((await client.query("SELECT user_id FROM oauth_accounts WHERE provider = 'test' AND provider_user_id = $1", [`provider-${ids.owner}`])).rows[0].user_id, ids.owner);
  const deleteUserId = randomUUID();
  await client.query("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES ($1, 'pg-delete', 'PG Delete', 'test', $2)", [deleteUserId, now]);
  await accounts.deleteUserAccount(deleteUserId);
  assert.equal((await client.query("SELECT id FROM users WHERE id = $1", [deleteUserId])).rowCount, 0);

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
  console.log(JSON.stringify({ ok: true, repositories: ["auth", "sessions", "groups", "direct-conversations", "channel-profiles", "user-preferences", "notifications", "notification-sync"], rollback: true }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
