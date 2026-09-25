import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseConfig } from "../server/config/database.mjs";
import { createPostgresPool } from "../server/repositories/postgres.mjs";
import { createPostgresSessionRepository } from "../server/repositories/sessions.mjs";
import { createPostgresGroupAccessRepository, createPostgresGroupRepository } from "../server/repositories/groups.mjs";
import { createPostgresDirectConversationRepository } from "../server/repositories/direct-conversations.mjs";
import { createPostgresChannelProfileRepository } from "../server/repositories/channel-profiles.mjs";
import { createPostgresUserPreferenceRepository } from "../server/repositories/user-preferences.mjs";
import { createPostgresNotificationRepository } from "../server/repositories/notifications.mjs";
import { createPostgresNotificationSyncService } from "../server/services/postgres-notification-sync.mjs";
import { createPostgresAuthRepository } from "../server/repositories/auth.mjs";
import { createPostgresOAuthRepository } from "../server/repositories/oauth.mjs";
import { createPostgresAccountRepository } from "../server/repositories/accounts.mjs";
import { createPostgresSocialRepository } from "../server/repositories/social.mjs";
import { createPostgresGroupSetupRepository } from "../server/repositories/group-setup.mjs";
import { createPostgresGroupMessageRepository } from "../server/repositories/group-messages.mjs";
import { createPostgresGroupInviteRepository } from "../server/repositories/group-invites.mjs";
import { createPostgresGroupJoinRequestRepository } from "../server/repositories/group-join-requests.mjs";
import { createPostgresGroupRoleRepository } from "../server/repositories/group-roles.mjs";

const config = createDatabaseConfig();
if (config.driver !== "postgres") throw new Error("Set TELAI_DATABASE_DRIVER=postgres before running repository tests.");

const pool = createPostgresPool(config);
const client = await pool.connect();
const ids = { owner: randomUUID(), member: randomUUID(), invitee: randomUUID(), redeemer: randomUUID(), group: randomUUID(), conversation: randomUUID() };
const now = new Date().toISOString();
const ownerUsername = `pg-owner-${ids.owner.slice(0, 8)}`;
const memberUsername = `pg-member-${ids.member.slice(0, 8)}`;
const inviteeUsername = `pg-invitee-${ids.invitee.slice(0, 8)}`;
const redeemerUsername = `pg-redeemer-${ids.redeemer.slice(0, 8)}`;
const oauthEmail = `pg-oauth-${ids.owner.slice(0, 8)}@example.test`;
const compactUserSummary = (user) => ({ id: user.id, username: user.username, displayName: user.displayName });
const normalizePreferenceVolume = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 1;

try {
  await client.query("BEGIN");
  await client.query(`
    INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES
      ($1, $2, 'PG Owner', 'test', $5),
      ($3, $4, 'PG Member', 'test', $5),
      ($6, $7, 'PG Invitee', 'test', $5),
      ($8, $9, 'PG Redeemer', 'test', $5)
  `, [ids.owner, ownerUsername, ids.member, memberUsername, now, ids.invitee, inviteeUsername, ids.redeemer, redeemerUsername]);
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
    email: oauthEmail,
    emailVerified: true,
    displayName: "PG OAuth",
    usernameHint: `pg-oauth-${ids.owner.slice(0, 8)}`,
  });
  assert.equal(oauthUser.displayName, "PG OAuth");
  assert.equal((await oauth.upsertOAuthUser("test", {
    providerUserId: `provider-${ids.owner}`,
    email: `${oauthEmail}.updated`,
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
  await client.query("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES ($1, $2, 'PG Delete', 'test', $3)", [deleteUserId, `pg-delete-${deleteUserId.slice(0, 8)}`, now]);
  await accounts.deleteUserAccount(deleteUserId);
  assert.equal((await client.query("SELECT id FROM users WHERE id = $1", [deleteUserId])).rowCount, 0);

  const social = createPostgresSocialRepository(client, { transactionClient: true });
  const socialRequest = await social.createFriendRequest(ids.owner, ids.member, now);
  assert.equal((await social.pendingRequest(ids.owner, ids.member))?.id, socialRequest.requestId);
  assert.equal((await social.listSocial(ids.owner)).outgoingRequests.length, 1);
  assert.equal((await social.decideFriendRequest(socialRequest.requestId, ids.member, "accept", now))?.status, "accepted");
  assert.equal(await social.friendshipExists(ids.owner, ids.member), true);
  await social.setFollowing(ids.owner, ids.member, true, now);
  assert.equal((await social.searchUsers(ids.owner, memberUsername))[0].following, true);
  assert.equal(await social.removeFriendship(ids.owner, ids.member), true);
  await social.setFollowing(ids.owner, ids.member, false, now);

  const groups = createPostgresGroupAccessRepository(client);
  const groupSetup = createPostgresGroupSetupRepository(client, { transactionClient: true });
  await groupSetup.ensureDefaultGroupRooms(ids.group, ids.owner);
  const defaultRoleId = await groupSetup.ensureDefaultGroupRoles(ids.group, ids.owner);
  await groupSetup.ensureGroupRolePositions(ids.group);
  assert.equal((await client.query("SELECT id FROM group_rooms WHERE group_id = $1 AND slug = 'geral'", [ids.group])).rowCount, 1);
  assert.equal((await client.query("SELECT id FROM group_roles WHERE id = $1 AND is_default = 1", [defaultRoleId])).rowCount, 1);
  const pgGroups = createPostgresGroupRepository(client, { createId: randomUUID, groupSetupRepository: groupSetup, transactionClient: true });
  const createdGroup = await pgGroups.createGroup({ name: "PG Created Group", slug: `pg-created-${ids.group.slice(0, 8)}`, ownerId: ids.owner, createdAt: now });
  assert.equal((await pgGroups.listGroups(ids.owner)).some((group) => group.id === createdGroup.id), true);
  assert.equal((await pgGroups.searchGroups(ids.member, "PG Created"))[0].id, createdGroup.id);
  const groupMessages = createPostgresGroupMessageRepository(client);
  const generalRoom = (await client.query("SELECT id FROM group_rooms WHERE group_id = $1 AND slug = 'geral'", [ids.group])).rows[0];
  const groupMessage = await groupMessages.createMessage({ groupId: ids.group, roomId: generalRoom.id, userId: ids.owner, body: "Mensagem de grupo PostgreSQL", displayName: "PG Owner", username: ownerUsername, createdAt: now });
  assert.equal((await groupMessages.listMessages(ids.group))[0].id, groupMessage.id);
  assert.equal(await groups.isGroupMember(ids.member, ids.group), true);
  assert.deepEqual(await groups.groupPermissions(ids.group, ids.owner), { canChat: true, canStream: true, canInvite: true, canMoveMembers: true, canViewVoiceMembers: true });
  assert.equal(await groups.canGroupAction(ids.member, ids.group, "canChat"), true);

  const groupRoles = createPostgresGroupRoleRepository(client, { createId: randomUUID, transactionClient: true });
  const customRole = await groupRoles.createRole({ groupId: createdGroup.id, name: "Moderador PG", color: "#123456", canChat: true, canStream: true, canInvite: false, canViewVoiceMembers: true, canMoveMembers: false, createdBy: ids.owner, createdAt: now });
  const createdDefaultRole = await groupRoles.defaultRole(createdGroup.id);
  await client.query("INSERT INTO group_members (group_id, user_id, role, role_id, created_at) VALUES ($1, $2, 'member', $3, $4)", [createdGroup.id, ids.member, createdDefaultRole.id, now]);
  assert.equal((await groupRoles.findRole(createdGroup.id, customRole.id)).name, "Moderador PG");
  assert.equal((await groupRoles.listRoles(createdGroup.id)).some((role) => role.id === customRole.id), true);
  await groupRoles.assignMemberRole(createdGroup.id, ids.member, customRole.id);
  assert.equal((await client.query("SELECT role_id FROM group_members WHERE group_id = $1 AND user_id = $2", [createdGroup.id, ids.member])).rows[0].role_id, customRole.id);
  await groupRoles.reorderRoles(createdGroup.id, [customRole.id, createdDefaultRole.id]);
  const updatedRole = await groupRoles.updateRole({ groupId: createdGroup.id, roleId: customRole.id, name: "Moderador atualizado", color: "#654321", canChat: true, canStream: false, canInvite: false, canViewVoiceMembers: true, canMoveMembers: true });
  assert.equal(updatedRole.name, "Moderador atualizado");
  assert.equal(await groupRoles.deleteRole(createdGroup.id, customRole.id, createdDefaultRole.id), true);

  const groupJoinRequests = createPostgresGroupJoinRequestRepository(client, {
    createId: randomUUID,
    groupSetupRepository: groupSetup,
    ensureGroupPermissionRow: (groupId, userId, queryDatabase = client) => groups.ensureGroupPermissionRow(groupId, userId, queryDatabase),
    compactAvatarData: (value) => value,
    transactionClient: true,
  });
  const joinRequest = await groupJoinRequests.create({ groupId: createdGroup.id, userId: ids.invitee, createdAt: now });
  assert.equal((await groupJoinRequests.findForUser(createdGroup.id, ids.invitee))?.id, joinRequest.id);
  assert.equal((await groupJoinRequests.listPending(createdGroup.id))[0].userId, ids.invitee);
  assert.equal((await groupJoinRequests.decide({ groupId: createdGroup.id, requestId: joinRequest.id, decidedBy: ids.owner, status: "approved", groupOwnerId: ids.owner, now, createNotification: async () => {} })).kind, "decided");
  assert.equal((await client.query("SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2", [createdGroup.id, ids.invitee])).rowCount, 1);

  const groupInvites = createPostgresGroupInviteRepository(client, {
    createId: randomUUID,
    hashToken: (token) => `hash:${token}`,
    groupSetupRepository: createPostgresGroupSetupRepository(client, { transactionClient: true }),
    ensureGroupPermissionRow: (groupId, userId, queryDatabase = client) => groups.ensureGroupPermissionRow(groupId, userId, queryDatabase),
    transactionClient: true,
  });
  const memberInvite = await groupInvites.createMemberInvite({ groupId: ids.group, invitedUserId: ids.invitee, invitedBy: ids.owner, expiresAt: new Date(Date.now() + 3600000).toISOString(), createdAt: now });
  assert.equal((await groupInvites.findMemberInviteTarget(ids.invitee))?.username, inviteeUsername);
  assert.equal(await groupInvites.hasPendingMemberInvite(ids.group, ids.invitee, now), true);
  assert.equal((await groupInvites.listPendingMemberInvites(ids.invitee))[0].id, memberInvite.id);
  assert.equal((await groupInvites.acceptMemberInvite(memberInvite.id, ids.invitee, now)).kind, "accepted");
  assert.equal((await client.query("SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2", [ids.group, ids.invitee])).rowCount, 1);
  const rawInvite = "group-token";
  await groupInvites.createGroupInvite({ token: rawInvite, groupId: ids.group, createdBy: ids.owner, expiresAt: new Date(Date.now() + 3600000).toISOString(), maxUses: 2, createdAt: now });
  assert.equal((await groupInvites.findGroupInvite(rawInvite)).groupId, ids.group);
  assert.equal((await groupInvites.redeemGroupInvite(rawInvite, ids.redeemer, now)).kind, "redeemed");
  assert.equal((await client.query("SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2", [ids.group, ids.redeemer])).rowCount, 1);
  assert.equal(await groupInvites.deleteGroupInvite(ids.group, "hash:group-token"), true);

  const conversations = createPostgresDirectConversationRepository(client, { compactUserSummary, transactionClient: true });
  assert.equal((await conversations.directConversationForUser(ids.conversation, ids.owner))?.id, ids.conversation);
  assert.equal((await conversations.directConversationPayload(ids.conversation, ids.owner))?.otherUser.username, memberUsername);
  assert.equal(await conversations.createConversation(ids.owner, ids.member, now), ids.conversation);
  const directMessage = await conversations.createMessage({
    conversationId: ids.conversation, senderId: ids.owner, body: "Mensagem PostgreSQL", displayName: "PG Owner", username: ownerUsername, createdAt: now,
    createNotification: async () => {},
  });
  assert.equal((await conversations.listMessages(ids.conversation, ids.member, true)).messages[0].body, directMessage.body);
  await conversations.markRead(ids.conversation, ids.member, now);

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
  console.log(JSON.stringify({ ok: true, repositories: ["auth", "sessions", "groups", "group-setup", "group-messages", "group-invites", "group-join-requests", "group-roles", "direct-conversations", "channel-profiles", "user-preferences", "notifications", "notification-sync", "social", "oauth", "accounts"], rollback: true }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
