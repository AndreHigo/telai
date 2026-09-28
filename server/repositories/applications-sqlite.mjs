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

  function updateApplication({ ownerId, applicationId, name, description, updatedAt = new Date().toISOString() }) {
    const current = database.prepare("SELECT bot_user_id AS botUserId, name, description FROM applications WHERE owner_id = ? AND id = ?").get(ownerId, applicationId);
    if (!current) return null;
    const nextName = name ?? current.name;
    const nextDescription = description ?? current.description;
    database.prepare("UPDATE applications SET name = ?, description = ?, updated_at = ? WHERE owner_id = ? AND id = ?")
      .run(nextName, nextDescription, updatedAt, ownerId, applicationId);
    database.prepare("UPDATE users SET display_name = ? WHERE id = ? AND is_bot = 1")
      .run(`${nextName} Bot`.slice(0, 48), current.botUserId);
    return findOwned(ownerId, applicationId);
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

  function listCommands(applicationId, { activeOnly = false } = {}) {
    return database.prepare(`
      SELECT id, application_id AS applicationId, name, description,
        options_json AS optionsJson, enabled, created_at AS createdAt, updated_at AS updatedAt
      FROM application_commands WHERE application_id = ? ${activeOnly ? "AND enabled = 1" : ""} ORDER BY name COLLATE NOCASE
    `).all(applicationId).map(publicCommand);
  }

  function listInstalledCommandsForGroup(groupId) {
    const rows = database.prepare(`
      SELECT applications.id AS applicationId, applications.name AS applicationName,
        applications.bot_user_id AS botUserId, users.username AS botUsername,
        users.display_name AS botDisplayName,
        application_commands.id AS commandId, application_commands.name AS commandName,
        application_commands.description AS commandDescription,
        application_commands.options_json AS commandOptionsJson,
        application_commands.enabled AS commandEnabled,
        application_commands.created_at AS commandCreatedAt,
        application_commands.updated_at AS commandUpdatedAt
      FROM application_group_installations
      JOIN applications ON applications.id = application_group_installations.application_id
      JOIN users ON users.id = applications.bot_user_id
      JOIN application_commands ON application_commands.application_id = applications.id
      WHERE application_group_installations.group_id = ? AND application_group_installations.allow_commands = 1 AND application_group_installations.allow_interactions = 1 AND application_commands.enabled = 1
      ORDER BY applications.name COLLATE NOCASE, application_commands.name COLLATE NOCASE
    `).all(groupId);
    return groupInstalledCommands(rows);
  }

  function createCommand({ applicationId, name, description = "", options = [], enabled = true, createdAt = new Date().toISOString() }) {
    const id = createId();
    const optionsJson = JSON.stringify(options);
    database.prepare("INSERT INTO application_commands (id, application_id, name, description, options_json, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, applicationId, name, description, optionsJson, enabled ? 1 : 0, createdAt, createdAt);
    return publicCommand({ id, applicationId, name, description, optionsJson, enabled: enabled ? 1 : 0, createdAt, updatedAt: createdAt });
  }

  function updateCommand({ applicationId, commandId, name, description, options, enabled, updatedAt = new Date().toISOString() }) {
    const current = database.prepare("SELECT id, application_id AS applicationId, name, description, options_json AS optionsJson, enabled, created_at AS createdAt, updated_at AS updatedAt FROM application_commands WHERE application_id = ? AND id = ?").get(applicationId, commandId);
    if (!current) return null;
    const nextName = name ?? current.name;
    const nextDescription = description ?? current.description;
    const nextOptions = options ?? parseCommandOptions(current.optionsJson);
    const nextEnabled = enabled ?? Boolean(current.enabled ?? 1);
    database.prepare("UPDATE application_commands SET name = ?, description = ?, options_json = ?, enabled = ?, updated_at = ? WHERE application_id = ? AND id = ?")
      .run(nextName, nextDescription, JSON.stringify(nextOptions), nextEnabled ? 1 : 0, updatedAt, applicationId, commandId);
    return publicCommand({ ...current, name: nextName, description: nextDescription, optionsJson: JSON.stringify(nextOptions), enabled: nextEnabled ? 1 : 0, updatedAt });
  }

  function deleteCommand(applicationId, commandId) {
    return database.prepare("DELETE FROM application_commands WHERE application_id = ? AND id = ?").run(applicationId, commandId).changes > 0;
  }

  function findInstalledCommand(applicationId, groupId, name) {
    return publicCommand(database.prepare(`
      SELECT application_commands.id, application_commands.application_id AS applicationId,
        application_commands.name, application_commands.description,
        application_commands.options_json AS optionsJson, application_commands.enabled
      FROM application_commands
      JOIN application_group_installations ON application_group_installations.application_id = application_commands.application_id
      WHERE application_commands.application_id = ? AND application_group_installations.group_id = ? AND application_group_installations.allow_commands = 1 AND application_group_installations.allow_interactions = 1 AND application_commands.enabled = 1 AND application_commands.name = ?
    `).get(applicationId, groupId, name));
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

  function installGroup({ applicationId, groupId, installedBy, permissions = {}, createdAt = new Date().toISOString() }) {
    const application = database.prepare("SELECT bot_user_id AS botUserId FROM applications WHERE id = ?").get(applicationId);
    if (!application) return null;
    const values = installationPermissionValues(permissions);
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("INSERT OR IGNORE INTO group_members (group_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)")
        .run(groupId, application.botUserId, createdAt);
      database.prepare("INSERT OR IGNORE INTO application_group_installations (application_id, group_id, installed_by, created_at, allow_commands, allow_messages, allow_interactions) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(applicationId, groupId, installedBy, createdAt, values.allowCommands, values.allowMessages, values.allowInteractions);
      database.exec("COMMIT");
      return findInstallation(applicationId, groupId);
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function findInstallation(applicationId, groupId) {
    return publicInstallation(database.prepare(`
      SELECT application_id AS applicationId, group_id AS groupId, created_at AS createdAt,
        allow_commands AS allowCommands, allow_messages AS allowMessages, allow_interactions AS allowInteractions
      FROM application_group_installations WHERE application_id = ? AND group_id = ?
    `).get(applicationId, groupId));
  }

  function listInstallations(applicationId) {
    return database.prepare(`
      SELECT application_id AS applicationId, group_id AS groupId, created_at AS createdAt,
        allow_commands AS allowCommands, allow_messages AS allowMessages, allow_interactions AS allowInteractions
      FROM application_group_installations WHERE application_id = ? ORDER BY created_at DESC
    `).all(applicationId).map(publicInstallation);
  }

  function updateInstallation({ applicationId, groupId, permissions = {} }) {
    const values = installationPermissionValues(permissions);
    const result = database.prepare(`
      UPDATE application_group_installations
      SET allow_commands = ?, allow_messages = ?, allow_interactions = ?
      WHERE application_id = ? AND group_id = ?
    `).run(values.allowCommands, values.allowMessages, values.allowInteractions, applicationId, groupId);
    return result.changes ? findInstallation(applicationId, groupId) : null;
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

  return { listOwned, findOwned, createApplication, updateApplication, createToken, listTokens, listCommands, listInstalledCommandsForGroup, createCommand, updateCommand, deleteCommand, findInstalledCommand, findByTokenHash, touchToken, revokeToken, installGroup, updateInstallation, findInstallation, listInstallations, uninstallGroup, deleteApplication };
}
