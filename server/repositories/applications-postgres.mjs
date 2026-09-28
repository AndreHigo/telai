import { randomUUID } from "node:crypto";
import {
  groupInstalledCommands,
  installationPermissionValues,
  parseCommandOptions,
  publicApplication,
  publicCommand,
  publicInstallation,
  publicToken,
} from "../domain/applications/presentation.mjs";

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

  async function updateApplication({ ownerId, applicationId, name, description, updatedAt = new Date().toISOString() }) {
    return withPostgresTransaction(database, async (client) => {
      const result = await client.query('SELECT bot_user_id AS "botUserId", name, description FROM applications WHERE owner_id = $1 AND id = $2', [ownerId, applicationId]);
      const current = result.rows[0];
      if (!current) return null;
      const nextName = name ?? current.name;
      const nextDescription = description ?? current.description;
      await client.query("UPDATE applications SET name = $1, description = $2, updated_at = $3 WHERE owner_id = $4 AND id = $5", [nextName, nextDescription, updatedAt, ownerId, applicationId]);
      await client.query("UPDATE users SET display_name = $1 WHERE id = $2 AND is_bot = 1", [`${nextName} Bot`.slice(0, 48), current.botUserId]);
      return findOwned(ownerId, applicationId, client);
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

  async function listCommands(applicationId, { activeOnly = false } = {}) {
    const result = await database.query(`SELECT id, application_id AS "applicationId", name, description, options_json AS "optionsJson", enabled, created_at AS "createdAt", updated_at AS "updatedAt" FROM application_commands WHERE application_id = $1 ${activeOnly ? "AND enabled = 1" : ""} ORDER BY LOWER(name)`, [applicationId]);
    return result.rows.map(publicCommand);
  }

  async function listInstalledCommandsForGroup(groupId) {
    const result = await database.query(`
      SELECT applications.id AS "applicationId", applications.name AS "applicationName",
        applications.bot_user_id AS "botUserId", users.username AS "botUsername",
        users.display_name AS "botDisplayName",
        application_commands.id AS "commandId", application_commands.name AS "commandName",
        application_commands.description AS "commandDescription",
        application_commands.options_json AS "commandOptionsJson",
        application_commands.enabled AS "commandEnabled",
        application_commands.created_at AS "commandCreatedAt",
        application_commands.updated_at AS "commandUpdatedAt"
      FROM application_group_installations
      JOIN applications ON applications.id = application_group_installations.application_id
      JOIN users ON users.id = applications.bot_user_id
      JOIN application_commands ON application_commands.application_id = applications.id
      WHERE application_group_installations.group_id = $1 AND application_group_installations.allow_commands = TRUE AND application_group_installations.allow_interactions = TRUE AND application_commands.enabled = 1
      ORDER BY LOWER(applications.name), LOWER(application_commands.name)
    `, [groupId]);
    return groupInstalledCommands(result.rows);
  }

  async function createCommand({ applicationId, name, description = "", options = [], enabled = true, createdAt = new Date().toISOString() }) {
    const id = createId();
    const optionsJson = JSON.stringify(options);
    await database.query("INSERT INTO application_commands (id, application_id, name, description, options_json, enabled, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)", [id, applicationId, name, description, optionsJson, enabled ? 1 : 0, createdAt]);
    return publicCommand({ id, applicationId, name, description, optionsJson, enabled: enabled ? 1 : 0, createdAt, updatedAt: createdAt });
  }

  async function updateCommand({ applicationId, commandId, name, description, options, enabled, updatedAt = new Date().toISOString() }) {
    const result = await database.query('SELECT id, application_id AS "applicationId", name, description, options_json AS "optionsJson", enabled, created_at AS "createdAt", updated_at AS "updatedAt" FROM application_commands WHERE application_id = $1 AND id = $2', [applicationId, commandId]);
    const current = result.rows[0];
    if (!current) return null;
    const nextName = name ?? current.name;
    const nextDescription = description ?? current.description;
    const nextOptions = options ?? parseCommandOptions(current.optionsJson);
    const nextEnabled = enabled ?? Boolean(current.enabled ?? 1);
    await database.query("UPDATE application_commands SET name = $1, description = $2, options_json = $3, enabled = $4, updated_at = $5 WHERE application_id = $6 AND id = $7", [nextName, nextDescription, JSON.stringify(nextOptions), nextEnabled ? 1 : 0, updatedAt, applicationId, commandId]);
    return publicCommand({ ...current, name: nextName, description: nextDescription, optionsJson: JSON.stringify(nextOptions), enabled: nextEnabled ? 1 : 0, updatedAt });
  }

  async function deleteCommand(applicationId, commandId) {
    const result = await database.query("DELETE FROM application_commands WHERE application_id = $1 AND id = $2", [applicationId, commandId]);
    return result.rowCount > 0;
  }

  async function findInstalledCommand(applicationId, groupId, name) {
    const result = await database.query(`
      SELECT application_commands.id, application_commands.application_id AS "applicationId",
        application_commands.name, application_commands.description,
        application_commands.options_json AS "optionsJson", application_commands.enabled
      FROM application_commands
      JOIN application_group_installations ON application_group_installations.application_id = application_commands.application_id
      WHERE application_commands.application_id = $1 AND application_group_installations.group_id = $2 AND application_group_installations.allow_commands = TRUE AND application_group_installations.allow_interactions = TRUE AND application_commands.enabled = 1 AND application_commands.name = $3
    `, [applicationId, groupId, name]);
    return publicCommand(result.rows[0]);
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

  async function installGroup({ applicationId, groupId, installedBy, permissions = {}, createdAt = new Date().toISOString() }) {
    const result = await database.query("SELECT bot_user_id AS \"botUserId\" FROM applications WHERE id = $1", [applicationId]);
    const application = result.rows[0];
    if (!application) return null;
    const values = installationPermissionValues(permissions);
    return withPostgresTransaction(database, async (client) => {
      await client.query("INSERT INTO group_members (group_id, user_id, role, created_at) VALUES ($1, $2, 'member', $3) ON CONFLICT DO NOTHING", [groupId, application.botUserId, createdAt]);
      await client.query("INSERT INTO application_group_installations (application_id, group_id, installed_by, created_at, allow_commands, allow_messages, allow_interactions) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING", [applicationId, groupId, installedBy, createdAt, values.allowCommands, values.allowMessages, values.allowInteractions]);
      return findInstallation(applicationId, groupId, client);
    });
  }

  async function findInstallation(applicationId, groupId, client = database) {
    const result = await client.query('SELECT application_id AS "applicationId", group_id AS "groupId", created_at AS "createdAt", allow_commands AS "allowCommands", allow_messages AS "allowMessages", allow_interactions AS "allowInteractions" FROM application_group_installations WHERE application_id = $1 AND group_id = $2', [applicationId, groupId]);
    return publicInstallation(result.rows[0]);
  }

  async function listInstallations(applicationId) {
    const result = await database.query('SELECT application_id AS "applicationId", group_id AS "groupId", created_at AS "createdAt", allow_commands AS "allowCommands", allow_messages AS "allowMessages", allow_interactions AS "allowInteractions" FROM application_group_installations WHERE application_id = $1 ORDER BY created_at DESC', [applicationId]);
    return result.rows.map(publicInstallation);
  }

  async function updateInstallation({ applicationId, groupId, permissions = {} }) {
    const values = installationPermissionValues(permissions);
    const result = await database.query("UPDATE application_group_installations SET allow_commands = $1, allow_messages = $2, allow_interactions = $3 WHERE application_id = $4 AND group_id = $5", [values.allowCommands, values.allowMessages, values.allowInteractions, applicationId, groupId]);
    return result.rowCount ? findInstallation(applicationId, groupId) : null;
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

  return { listOwned, findOwned, createApplication, updateApplication, createToken, listTokens, listCommands, listInstalledCommandsForGroup, createCommand, updateCommand, deleteCommand, findInstalledCommand, findByTokenHash, touchToken, revokeToken, installGroup, updateInstallation, findInstallation, listInstallations, uninstallGroup, deleteApplication };
}
