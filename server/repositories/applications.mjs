import { randomUUID } from "node:crypto";

function publicApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    bot: {
      id: row.botUserId,
      username: row.botUsername,
      displayName: row.botDisplayName,
    },
  };
}

function publicToken(row) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    label: row.label,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt || null,
    revokedAt: row.revokedAt || null,
  };
}

function publicInstallation(row) {
  return {
    applicationId: row.applicationId,
    groupId: row.groupId,
    createdAt: row.createdAt,
  };
}

export function createApplicationRepository(database, { createId = randomUUID } = {}) {
  function findOwned(ownerId, applicationId) {
    return publicApplication(database.prepare(`
      SELECT applications.id, applications.name, applications.description,
        applications.created_at AS createdAt, applications.updated_at AS updatedAt,
        applications.bot_user_id AS botUserId, users.username AS botUsername,
        users.display_name AS botDisplayName
      FROM applications JOIN users ON users.id = applications.bot_user_id
      WHERE applications.owner_id = ? AND applications.id = ?
    `).get(ownerId, applicationId));
  }

  function listOwned(ownerId) {
    return database.prepare(`
      SELECT applications.id, applications.name, applications.description,
        applications.created_at AS createdAt, applications.updated_at AS updatedAt,
        applications.bot_user_id AS botUserId, users.username AS botUsername,
        users.display_name AS botDisplayName
      FROM applications JOIN users ON users.id = applications.bot_user_id
      WHERE applications.owner_id = ? ORDER BY applications.created_at DESC
    `).all(ownerId).map(publicApplication);
  }

  function createApplication({ id, ownerId, botUserId, botUsername, botDisplayName, botPasswordHash, name, description = "", createdAt = new Date().toISOString() }) {
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("INSERT INTO users (id, username, display_name, password_hash, created_at, is_bot) VALUES (?, ?, ?, ?, ?, 1)")
        .run(botUserId, botUsername, botDisplayName, botPasswordHash, createdAt);
      database.prepare("INSERT INTO applications (id, owner_id, bot_user_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, ownerId, botUserId, name, description, createdAt, createdAt);
      database.exec("COMMIT");
      return findOwned(ownerId, id);
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function createToken({ applicationId, label, tokenHash, createdAt = new Date().toISOString() }) {
    const id = createId();
    database.prepare("INSERT INTO application_tokens (id, application_id, label, token_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, applicationId, label, tokenHash, createdAt);
    return publicToken({ id, applicationId, label, createdAt, lastUsedAt: null, revokedAt: null });
  }

  function listTokens(applicationId) {
    return database.prepare(`
      SELECT id, application_id AS applicationId, label, created_at AS createdAt,
        last_used_at AS lastUsedAt, revoked_at AS revokedAt
      FROM application_tokens WHERE application_id = ? ORDER BY created_at DESC
    `).all(applicationId).map(publicToken);
  }

  function findByTokenHash(tokenHash) {
    return database.prepare(`
      SELECT application_tokens.id AS tokenId, application_tokens.application_id AS applicationId,
        applications.name AS applicationName, applications.bot_user_id AS botUserId,
        users.username AS botUsername, users.display_name AS botDisplayName
      FROM application_tokens
      JOIN applications ON applications.id = application_tokens.application_id
      JOIN users ON users.id = applications.bot_user_id
      WHERE application_tokens.token_hash = ? AND application_tokens.revoked_at IS NULL
    `).get(tokenHash) || null;
  }

  function touchToken(tokenId, usedAt = new Date().toISOString()) {
    database.prepare("UPDATE application_tokens SET last_used_at = ? WHERE id = ? AND revoked_at IS NULL").run(usedAt, tokenId);
  }

  function revokeToken(applicationId, tokenId, revokedAt = new Date().toISOString()) {
    const result = database.prepare("UPDATE application_tokens SET revoked_at = ? WHERE application_id = ? AND id = ? AND revoked_at IS NULL")
      .run(revokedAt, applicationId, tokenId);
    return result.changes > 0;
  }

  function installGroup({ applicationId, groupId, installedBy, createdAt = new Date().toISOString() }) {
    const application = database.prepare("SELECT bot_user_id AS botUserId FROM applications WHERE id = ?").get(applicationId);
    if (!application) return null;
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)")
        .run(groupId, application.botUserId, createdAt);
      database.prepare("INSERT OR IGNORE INTO application_group_installations (application_id, group_id, installed_by, created_at) VALUES (?, ?, ?, ?)")
        .run(applicationId, groupId, installedBy, createdAt);
      database.exec("COMMIT");
      return findInstallation(applicationId, groupId);
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function findInstallation(applicationId, groupId) {
    return publicInstallation(database.prepare(`
      SELECT application_id AS applicationId, group_id AS groupId, created_at AS createdAt
      FROM application_group_installations WHERE application_id = ? AND group_id = ?
    `).get(applicationId, groupId));
  }

  function listInstallations(applicationId) {
    return database.prepare(`
      SELECT application_id AS applicationId, group_id AS groupId, created_at AS createdAt
      FROM application_group_installations WHERE application_id = ? ORDER BY created_at DESC
    `).all(applicationId).map(publicInstallation);
  }

  function uninstallGroup(applicationId, groupId) {
    const application = database.prepare("SELECT bot_user_id AS botUserId FROM applications WHERE id = ?").get(applicationId);
    if (!application) return false;
    try {
      database.exec("BEGIN IMMEDIATE");
      const result = database.prepare("DELETE FROM application_group_installations WHERE application_id = ? AND group_id = ?").run(applicationId, groupId);
      database.prepare("DELETE FROM group_members WHERE group_id = ? AND user_id = ?").run(groupId, application.botUserId);
      database.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function deleteApplication(ownerId, applicationId) {
    const application = database.prepare("SELECT bot_user_id AS botUserId FROM applications WHERE owner_id = ? AND id = ?").get(ownerId, applicationId);
    if (!application) return false;
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("DELETE FROM applications WHERE owner_id = ? AND id = ?").run(ownerId, applicationId);
      database.prepare("DELETE FROM users WHERE id = ? AND is_bot = 1").run(application.botUserId);
      database.exec("COMMIT");
      return true;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { listOwned, findOwned, createApplication, createToken, listTokens, findByTokenHash, touchToken, revokeToken, installGroup, findInstallation, listInstallations, uninstallGroup, deleteApplication };
}

async function withPostgresTransaction(database, callback) {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createPostgresApplicationRepository(database, { createId = randomUUID } = {}) {
  async function findOwned(ownerId, applicationId, client = database) {
    const result = await client.query(`
      SELECT applications.id, applications.name, applications.description,
        applications.created_at AS "createdAt", applications.updated_at AS "updatedAt",
        applications.bot_user_id AS "botUserId", users.username AS "botUsername",
        users.display_name AS "botDisplayName"
      FROM applications JOIN users ON users.id = applications.bot_user_id
      WHERE applications.owner_id = $1 AND applications.id = $2
    `, [ownerId, applicationId]);
    return publicApplication(result.rows[0]);
  }

  async function listOwned(ownerId) {
    const result = await database.query(`
      SELECT applications.id, applications.name, applications.description,
        applications.created_at AS "createdAt", applications.updated_at AS "updatedAt",
        applications.bot_user_id AS "botUserId", users.username AS "botUsername",
        users.display_name AS "botDisplayName"
      FROM applications JOIN users ON users.id = applications.bot_user_id
      WHERE applications.owner_id = $1 ORDER BY applications.created_at DESC
    `, [ownerId]);
    return result.rows.map(publicApplication);
  }

  async function createApplication({ id, ownerId, botUserId, botUsername, botDisplayName, botPasswordHash, name, description = "", createdAt = new Date().toISOString() }) {
    return withPostgresTransaction(database, async (client) => {
      await client.query("INSERT INTO users (id, username, display_name, password_hash, created_at, is_bot) VALUES ($1, $2, $3, $4, $5, 1)", [botUserId, botUsername, botDisplayName, botPasswordHash, createdAt]);
      await client.query("INSERT INTO applications (id, owner_id, bot_user_id, name, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6)", [id, ownerId, botUserId, name, description, createdAt]);
      return findOwned(ownerId, id, client);
    });
  }

  async function createToken({ applicationId, label, tokenHash, createdAt = new Date().toISOString() }) {
    const id = createId();
    await database.query("INSERT INTO application_tokens (id, application_id, label, token_hash, created_at) VALUES ($1, $2, $3, $4, $5)", [id, applicationId, label, tokenHash, createdAt]);
    return publicToken({ id, applicationId, label, createdAt, lastUsedAt: null, revokedAt: null });
  }

  async function listTokens(applicationId) {
    const result = await database.query('SELECT id, application_id AS "applicationId", label, created_at AS "createdAt", last_used_at AS "lastUsedAt", revoked_at AS "revokedAt" FROM application_tokens WHERE application_id = $1 ORDER BY created_at DESC', [applicationId]);
    return result.rows.map(publicToken);
  }

  async function findByTokenHash(tokenHash) {
    const result = await database.query(`
      SELECT application_tokens.id AS "tokenId", application_tokens.application_id AS "applicationId",
        applications.name AS "applicationName", applications.bot_user_id AS "botUserId",
        users.username AS "botUsername", users.display_name AS "botDisplayName"
      FROM application_tokens
      JOIN applications ON applications.id = application_tokens.application_id
      JOIN users ON users.id = applications.bot_user_id
      WHERE application_tokens.token_hash = $1 AND application_tokens.revoked_at IS NULL
    `, [tokenHash]);
    return result.rows[0] || null;
  }

  async function touchToken(tokenId, usedAt = new Date().toISOString()) {
    await database.query("UPDATE application_tokens SET last_used_at = $1 WHERE id = $2 AND revoked_at IS NULL", [usedAt, tokenId]);
  }

  async function revokeToken(applicationId, tokenId, revokedAt = new Date().toISOString()) {
    const result = await database.query("UPDATE application_tokens SET revoked_at = $1 WHERE application_id = $2 AND id = $3 AND revoked_at IS NULL", [revokedAt, applicationId, tokenId]);
    return result.rowCount > 0;
  }

  async function installGroup({ applicationId, groupId, installedBy, createdAt = new Date().toISOString() }) {
    const result = await database.query("SELECT bot_user_id AS \"botUserId\" FROM applications WHERE id = $1", [applicationId]);
    const application = result.rows[0];
    if (!application) return null;
    return withPostgresTransaction(database, async (client) => {
      await client.query("INSERT INTO group_members (group_id, user_id, role, created_at) VALUES ($1, $2, 'member', $3) ON CONFLICT DO NOTHING", [groupId, application.botUserId, createdAt]);
      await client.query("INSERT INTO application_group_installations (application_id, group_id, installed_by, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [applicationId, groupId, installedBy, createdAt]);
      return findInstallation(applicationId, groupId, client);
    });
  }

  async function findInstallation(applicationId, groupId, client = database) {
    const result = await client.query('SELECT application_id AS "applicationId", group_id AS "groupId", created_at AS "createdAt" FROM application_group_installations WHERE application_id = $1 AND group_id = $2', [applicationId, groupId]);
    return publicInstallation(result.rows[0]);
  }

  async function listInstallations(applicationId) {
    const result = await database.query('SELECT application_id AS "applicationId", group_id AS "groupId", created_at AS "createdAt" FROM application_group_installations WHERE application_id = $1 ORDER BY created_at DESC', [applicationId]);
    return result.rows.map(publicInstallation);
  }

  async function uninstallGroup(applicationId, groupId) {
    return withPostgresTransaction(database, async (client) => {
      const applicationResult = await client.query('SELECT bot_user_id AS "botUserId" FROM applications WHERE id = $1', [applicationId]);
      const application = applicationResult.rows[0];
      if (!application) return false;
      const result = await client.query("DELETE FROM application_group_installations WHERE application_id = $1 AND group_id = $2", [applicationId, groupId]);
      await client.query("DELETE FROM group_members WHERE group_id = $1 AND user_id = $2", [groupId, application.botUserId]);
      return result.rowCount > 0;
    });
  }

  async function deleteApplication(ownerId, applicationId) {
    return withPostgresTransaction(database, async (client) => {
      const result = await client.query('SELECT bot_user_id AS "botUserId" FROM applications WHERE owner_id = $1 AND id = $2', [ownerId, applicationId]);
      const application = result.rows[0];
      if (!application) return false;
      await client.query("DELETE FROM applications WHERE owner_id = $1 AND id = $2", [ownerId, applicationId]);
      await client.query("DELETE FROM users WHERE id = $1 AND is_bot = 1", [application.botUserId]);
      return true;
    });
  }

  return { listOwned, findOwned, createApplication, createToken, listTokens, findByTokenHash, touchToken, revokeToken, installGroup, findInstallation, listInstallations, uninstallGroup, deleteApplication };
}
