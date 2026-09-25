import { randomUUID } from "node:crypto";

export function createAuthRepository(database, {
  compactAvatarData = (value) => value,
  legalPolicyVersion,
  createId = randomUUID,
} = {}) {
  function userWithLinkedAccounts(user) {
    if (!user) return null;
    const linkedAccounts = database.prepare(`
      SELECT provider, email, created_at AS linkedAt
      FROM oauth_accounts WHERE user_id = ? ORDER BY provider
    `).all(user.id);
    return { ...user, avatarData: compactAvatarData(user.avatarData), linkedAccounts, legal: legalConsentStatus(user.id) };
  }

  function legalConsentStatus(userId) {
    const records = database.prepare("SELECT consent_type AS consentType, accepted_at AS acceptedAt FROM user_consents WHERE user_id = ? AND policy_version = ?").all(userId, legalPolicyVersion);
    const byType = new Map(records.map((record) => [record.consentType, record.acceptedAt]));
    return {
      policyVersion: legalPolicyVersion,
      termsAcceptedAt: byType.get("terms") || null,
      privacyAcceptedAt: byType.get("privacy") || null,
      required: !byType.has("terms") || !byType.has("privacy"),
    };
  }

  function recordLegalConsents(userId, acceptedAt = new Date().toISOString()) {
    for (const consentType of ["terms", "privacy"]) {
      database.prepare(`
        INSERT OR IGNORE INTO user_consents (id, user_id, consent_type, policy_version, accepted_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(createId(), userId, consentType, legalPolicyVersion, acceptedAt);
    }
  }

  return { userWithLinkedAccounts, legalConsentStatus, recordLegalConsents };
}

export function createPostgresAuthRepository(database, {
  compactAvatarData = (value) => value,
  legalPolicyVersion,
  createId = randomUUID,
} = {}) {
  async function userWithLinkedAccounts(user) {
    if (!user) return null;
    const linkedAccountsResult = await database.query(`
      SELECT provider, email, created_at AS "linkedAt"
      FROM oauth_accounts WHERE user_id = $1 ORDER BY provider
    `, [user.id]);
    return {
      ...user,
      avatarData: compactAvatarData(user.avatarData),
      linkedAccounts: linkedAccountsResult.rows,
      legal: await legalConsentStatus(user.id),
    };
  }

  async function legalConsentStatus(userId) {
    const result = await database.query(
      'SELECT consent_type AS "consentType", accepted_at AS "acceptedAt" FROM user_consents WHERE user_id = $1 AND policy_version = $2',
      [userId, legalPolicyVersion],
    );
    const byType = new Map(result.rows.map((record) => [record.consentType, record.acceptedAt]));
    return {
      policyVersion: legalPolicyVersion,
      termsAcceptedAt: byType.get("terms") || null,
      privacyAcceptedAt: byType.get("privacy") || null,
      required: !byType.has("terms") || !byType.has("privacy"),
    };
  }

  async function recordLegalConsents(userId, acceptedAt = new Date().toISOString()) {
    for (const consentType of ["terms", "privacy"]) {
      await database.query(`
        INSERT INTO user_consents (id, user_id, consent_type, policy_version, accepted_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, consent_type, policy_version) DO NOTHING
      `, [createId(), userId, consentType, legalPolicyVersion, acceptedAt]);
    }
  }

  return { userWithLinkedAccounts, legalConsentStatus, recordLegalConsents };
}
