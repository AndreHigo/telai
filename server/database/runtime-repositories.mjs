import path from "node:path";
import { openSqliteDatabase } from "../repositories/sqlite.mjs";
import { SQLITE_SCHEMA } from "./sqlite-schema.mjs";
import { ensureCompatibilityColumns, ensureCompatibilityIndexes } from "./sqlite-compatibility.mjs";
import { createPostgresPool } from "../repositories/postgres.mjs";
import { createDirectConversationRepository, createPostgresDirectConversationRepository } from "../repositories/direct-conversations.mjs";
import { createGroupAccessRepository, createPostgresGroupAccessRepository, createGroupRepository, createPostgresGroupRepository } from "../repositories/groups.mjs";
import { createNotificationRepository, createPostgresNotificationRepository } from "../repositories/notifications.mjs";
import { createChannelProfileRepository, createPostgresChannelProfileRepository } from "../repositories/channel-profiles.mjs";
import { createUserPreferenceRepository, createPostgresUserPreferenceRepository } from "../repositories/user-preferences.mjs";
import { createSessionRepository, createPostgresSessionRepository } from "../repositories/sessions.mjs";
import { createAuthRepository, createPostgresAuthRepository } from "../repositories/auth.mjs";
import { createOAuthRepository, createPostgresOAuthRepository } from "../repositories/oauth.mjs";
import { createAccountRepository, createPostgresAccountRepository } from "../repositories/accounts.mjs";
import { createSocialRepository, createPostgresSocialRepository } from "../repositories/social.mjs";
import { createGroupSetupRepository, createPostgresGroupSetupRepository } from "../repositories/group-setup.mjs";
import { createGroupMessageRepository, createPostgresGroupMessageRepository } from "../repositories/group-messages.mjs";
import { createGroupInviteRepository, createPostgresGroupInviteRepository } from "../repositories/group-invites.mjs";
import { createGroupJoinRequestRepository, createPostgresGroupJoinRequestRepository } from "../repositories/group-join-requests.mjs";
import { createGroupRoleRepository, createPostgresGroupRoleRepository } from "../repositories/group-roles.mjs";
import { createGroupRoomRepository, createPostgresGroupRoomRepository } from "../repositories/group-rooms.mjs";
import { createGroupRoomPermissionRepository, createPostgresGroupRoomPermissionRepository } from "../repositories/group-room-permissions.mjs";
import { createGroupAuditRepository, createPostgresGroupAuditRepository } from "../repositories/group-audit.mjs";
import { createGroupModerationRepository, createPostgresGroupModerationRepository } from "../repositories/group-moderation.mjs";
import { createGroupAttachmentRepository, createPostgresGroupAttachmentRepository } from "../repositories/group-attachments.mjs";
import { createGroupWebhookRepository, createPostgresGroupWebhookRepository } from "../repositories/group-webhooks.mjs";
import { createGroupRoomReadRepository, createPostgresGroupRoomReadRepository } from "../repositories/group-room-reads.mjs";
import { createGroupPermissionRepository, createPostgresGroupPermissionRepository } from "../repositories/group-permissions.mjs";
import { createGroupMemberRepository, createPostgresGroupMemberRepository } from "../repositories/group-members.mjs";
import { createStreamRepository, createPostgresStreamRepository } from "../repositories/streams.mjs";
import { createGroupSettingsRepository, createPostgresGroupSettingsRepository } from "../repositories/group-settings.mjs";
import { createUserProfileRepository, createPostgresUserProfileRepository } from "../repositories/user-profile.mjs";
import { createSiteAdminRepository, createPostgresSiteAdminRepository } from "../repositories/site-admin.mjs";
import { createMaintenanceRepository, createPostgresMaintenanceRepository } from "../repositories/maintenance.mjs";
import { createApplicationRepository, createPostgresApplicationRepository } from "../repositories/applications.mjs";

export function createRuntimeRepositories({
  databaseDriver,
  databaseConfig,
  databasePath,
  dataDir,
  legalPolicyVersion,
  randomUUID,
  hashSessionToken,
  compactAvatarData,
  compactUserSummary,
  parseChannelGames,
  normalizePreferenceVolume,
  slugFor,
  createPasswordHash,
}) {
  if (!databaseDriver || !databaseConfig) throw new Error("databaseDriver and databaseConfig are required");

  const database = databaseDriver === "postgres"
    ? createPostgresPool(databaseConfig)
    : openSqliteDatabase(databasePath, SQLITE_SCHEMA);
  if (databaseDriver === "sqlite") {
    ensureCompatibilityColumns(database);
    ensureCompatibilityIndexes(database);
  }

  const groupRoomPermissionRepository = databaseDriver === "postgres"
    ? createPostgresGroupRoomPermissionRepository(database)
    : createGroupRoomPermissionRepository(database);
  const { isGroupMember, ensureGroupPermissionRow, groupPermissions, canGroupAction, canGroupRoomAction } = databaseDriver === "postgres"
    ? createPostgresGroupAccessRepository(database, { roomPermissionRepository: groupRoomPermissionRepository })
    : createGroupAccessRepository(database, { roomPermissionRepository: groupRoomPermissionRepository });
  const directConversationRepository = databaseDriver === "postgres"
    ? createPostgresDirectConversationRepository(database, { compactUserSummary, createId: randomUUID })
    : createDirectConversationRepository(database, { compactUserSummary, createId: randomUUID });
  const sessionRepository = databaseDriver === "postgres"
    ? createPostgresSessionRepository(database, { hashSessionToken })
    : createSessionRepository(database, { hashSessionToken });
  const authRepository = databaseDriver === "postgres"
    ? createPostgresAuthRepository(database, { compactAvatarData, legalPolicyVersion, createId: randomUUID })
    : createAuthRepository(database, { compactAvatarData, legalPolicyVersion, createId: randomUUID });
  const notificationRepository = databaseDriver === "postgres"
    ? createPostgresNotificationRepository(database)
    : createNotificationRepository(database);
  const socialRepository = databaseDriver === "postgres"
    ? createPostgresSocialRepository(database, { compactAvatarData, createId: randomUUID })
    : createSocialRepository(database, { compactAvatarData, createId: randomUUID });
  const channelProfileRepository = databaseDriver === "postgres"
    ? createPostgresChannelProfileRepository(database, { compactAvatarData, parseChannelGames })
    : createChannelProfileRepository(database, { compactAvatarData, parseChannelGames });
  const userPreferenceRepository = databaseDriver === "postgres"
    ? createPostgresUserPreferenceRepository(database, { normalizePreferenceVolume })
    : createUserPreferenceRepository(database, { normalizePreferenceVolume });
  const streamRepository = databaseDriver === "postgres"
    ? createPostgresStreamRepository(database, { createId: randomUUID })
    : createStreamRepository(database, { createId: randomUUID });
  const accountRepository = databaseDriver === "postgres"
    ? createPostgresAccountRepository(database, { legalPolicyVersion, createId: randomUUID })
    : createAccountRepository(database, { legalPolicyVersion, createId: randomUUID });
  const groupSetupRepository = databaseDriver === "postgres"
    ? createPostgresGroupSetupRepository(database, { createId: randomUUID })
    : createGroupSetupRepository(database, { createId: randomUUID });
  const groupMessageRepository = databaseDriver === "postgres"
    ? createPostgresGroupMessageRepository(database, { createId: randomUUID })
    : createGroupMessageRepository(database, { createId: randomUUID });
  const groupAttachmentRepository = databaseDriver === "postgres"
    ? createPostgresGroupAttachmentRepository(database, { createId: randomUUID })
    : createGroupAttachmentRepository(database, { createId: randomUUID });
  const groupWebhookRepository = databaseDriver === "postgres"
    ? createPostgresGroupWebhookRepository(database, { createId: randomUUID })
    : createGroupWebhookRepository(database, { createId: randomUUID });
  const applicationRepository = databaseDriver === "postgres"
    ? createPostgresApplicationRepository(database, { createId: randomUUID })
    : createApplicationRepository(database, { createId: randomUUID });
  const groupRoomReadRepository = databaseDriver === "postgres"
    ? createPostgresGroupRoomReadRepository(database)
    : createGroupRoomReadRepository(database);
  const groupRepository = databaseDriver === "postgres"
    ? createPostgresGroupRepository(database, { createId: randomUUID, groupSetupRepository })
    : createGroupRepository(database, { createId: randomUUID, groupSetupRepository });
  const groupModerationRepository = databaseDriver === "postgres"
    ? createPostgresGroupModerationRepository(database, { createId: randomUUID })
    : createGroupModerationRepository(database, { createId: randomUUID });
  const groupInviteRepository = (databaseDriver === "postgres" ? createPostgresGroupInviteRepository : createGroupInviteRepository)(database, {
    createId: randomUUID,
    hashToken: hashSessionToken,
    groupSetupRepository,
    ensureGroupPermissionRow,
    groupModerationRepository,
  });
  const groupJoinRequestRepository = (databaseDriver === "postgres" ? createPostgresGroupJoinRequestRepository : createGroupJoinRequestRepository)(database, {
    createId: randomUUID,
    groupSetupRepository,
    ensureGroupPermissionRow,
    compactAvatarData,
  });
  const groupRoleRepository = databaseDriver === "postgres"
    ? createPostgresGroupRoleRepository(database, { createId: randomUUID })
    : createGroupRoleRepository(database, { createId: randomUUID });
  const groupRoomRepository = databaseDriver === "postgres"
    ? createPostgresGroupRoomRepository(database, { createId: randomUUID })
    : createGroupRoomRepository(database, { createId: randomUUID });
  const groupAuditRepository = databaseDriver === "postgres"
    ? createPostgresGroupAuditRepository(database, { createId: randomUUID })
    : createGroupAuditRepository(database, { createId: randomUUID });
  const groupPermissionRepository = databaseDriver === "postgres"
    ? createPostgresGroupPermissionRepository(database)
    : createGroupPermissionRepository(database);
  const groupMemberRepository = databaseDriver === "postgres"
    ? createPostgresGroupMemberRepository(database, { compactAvatarData })
    : createGroupMemberRepository(database, { compactAvatarData });
  const groupSettingsRepository = databaseDriver === "postgres"
    ? createPostgresGroupSettingsRepository(database)
    : createGroupSettingsRepository(database);
  const userProfileRepository = databaseDriver === "postgres"
    ? createPostgresUserProfileRepository(database)
    : createUserProfileRepository(database);
  const siteAdminRepository = databaseDriver === "postgres"
    ? createPostgresSiteAdminRepository(database)
    : createSiteAdminRepository(database);

  let maintenanceDatabasePool = null;
  let maintenanceSqliteDatabase = null;
  const maintenanceRepository = databaseConfig.maintenanceDriver === "postgres"
    ? createPostgresMaintenanceRepository(
      databaseDriver === "postgres"
        ? database
        : (maintenanceDatabasePool = createPostgresPool(databaseConfig)),
    )
    : createMaintenanceRepository(
      databaseDriver === "sqlite"
        ? database
        : (maintenanceSqliteDatabase = openSqliteDatabase(path.join(dataDir, "maintenance.sqlite"), SQLITE_SCHEMA)),
    );
  const { upsertOAuthUser, linkOAuthAccount } = (databaseDriver === "postgres" ? createPostgresOAuthRepository : createOAuthRepository)(database, {
    slugFor,
    createPasswordHash,
    createId: randomUUID,
    mergeUsers: (...args) => accountRepository.mergeUsers(...args),
  });

  return {
    database,
    maintenanceDatabasePool,
    maintenanceSqliteDatabase,
    groupRoomPermissionRepository,
    isGroupMember,
    ensureGroupPermissionRow,
    groupPermissions,
    canGroupAction,
    canGroupRoomAction,
    directConversationRepository,
    sessionRepository,
    userWithLinkedAccounts: authRepository.userWithLinkedAccounts,
    legalConsentStatus: authRepository.legalConsentStatus,
    recordLegalConsents: authRepository.recordLegalConsents,
    createUserWithConsents: authRepository.createUserWithConsents,
    notificationRepository,
    socialRepository,
    channelProfileRepository,
    userPreferenceRepository,
    streamRepository,
    accountRepository,
    groupSetupRepository,
    groupMessageRepository,
    groupAttachmentRepository,
    groupWebhookRepository,
    applicationRepository,
    groupRoomReadRepository,
    groupRepository,
    groupModerationRepository,
    groupInviteRepository,
    groupJoinRequestRepository,
    groupRoleRepository,
    groupRoomRepository,
    groupAuditRepository,
    groupPermissionRepository,
    groupMemberRepository,
    groupSettingsRepository,
    userProfileRepository,
    siteAdminRepository,
    maintenanceRepository,
    upsertOAuthUser,
    linkOAuthAccount,
  };
}
