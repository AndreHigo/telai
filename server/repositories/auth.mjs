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

  function recordLegalConsents(userId, acceptedAt = new Date().toISOString(), targetDatabase = database) {
    for (const consentType of ["terms", "privacy"]) {
      targetDatabase.prepare(`
        INSERT OR IGNORE INTO user_consents (id, user_id, consent_type, policy_version, accepted_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(createId(), userId, consentType, legalPolicyVersion, acceptedAt);
    }
  }

  function createUserWithConsents({ id, username, displayName, passwordHash, createdAt, createUser }) {
    database.exec("BEGIN IMMEDIATE");
    try {
      const createdUser = createUser({ id, username, displayName, passwordHash, createdAt, database });
      recordLegalConsents(id, createdAt, database);
      database.exec("COMMIT");
      return createdUser;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { userWithLinkedAccounts, legalConsentStatus, recordLegalConsents, createUserWithConsents };
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

export function createPostgresAuthRepository(database, {
  compactAvatarData = (value) => value,
  legalPolicyVersion,
  createId = randomUUID,
  transactionClient = false,
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

  async function recordLegalConsents(userId, acceptedAt = new Date().toISOString(), targetDatabase = database) {
    for (const consentType of ["terms", "privacy"]) {
      await targetDatabase.query(`
        INSERT INTO user_consents (id, user_id, consent_type, policy_version, accepted_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, consent_type, policy_version) DO NOTHING
      `, [createId(), userId, consentType, legalPolicyVersion, acceptedAt]);
    }
  }

  async function createUserWithConsents({ id, username, displayName, passwordHash, createdAt, createUser }) {
    return withPostgresTransaction(database, async (client) => {
      const createdUser = await createUser({ id, username, displayName, passwordHash, createdAt, database: client });
      await recordLegalConsents(id, createdAt, client);
      return createdUser;
    }, transactionClient);
  }

  return { userWithLinkedAccounts, legalConsentStatus, recordLegalConsents, createUserWithConsents };
}
