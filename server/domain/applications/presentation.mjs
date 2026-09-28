/**
 * Presenters and small value conversions shared by the SQLite and PostgreSQL
 * application repositories. These functions deliberately accept database rows
 * instead of knowing which driver produced them.
 */

export function publicApplication(row) {
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

export function publicToken(row) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    label: row.label,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt || null,
    revokedAt: row.revokedAt || null,
  };
}

export function publicInstallation(row) {
  if (!row) return null;
  const events = parseEventSubscriptions(row.eventSubscriptionsJson ?? row.event_subscriptions_json);
  const permissions = {
    commands: Boolean(row.allowCommands ?? row.allow_commands ?? 1),
    messages: Boolean(row.allowMessages ?? row.allow_messages ?? 1),
    interactions: Boolean(row.allowInteractions ?? row.allow_interactions ?? 1),
  };
  if (events.length) permissions.events = events;
  return {
    applicationId: row.applicationId,
    groupId: row.groupId,
    createdAt: row.createdAt,
    permissions,
  };
}

export function parseEventSubscriptions(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function publicApplicationEvent(row) {
  if (!row) return null;
  let payload = {};
  try { payload = JSON.parse(String(row.payloadJson ?? row.payload_json ?? "{}")); } catch {}
  return {
    id: row.id,
    applicationId: row.applicationId,
    groupId: row.groupId,
    type: row.eventType,
    payload,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

export function installationPermissionValues(permissions = {}) {
  return {
    allowCommands: permissions.commands !== false ? 1 : 0,
    allowMessages: permissions.messages !== false ? 1 : 0,
    allowInteractions: permissions.interactions !== false ? 1 : 0,
    eventSubscriptions: JSON.stringify(Array.isArray(permissions.events) ? permissions.events : []),
  };
}

export function parseCommandOptions(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function publicCommand(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.applicationId,
    name: row.name,
    description: row.description,
    options: parseCommandOptions(row.optionsJson),
    enabled: Boolean(row.enabled ?? 1),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function publicInstalledCommand(row) {
  return {
    id: row.commandId,
    applicationId: row.applicationId,
    name: row.commandName,
    description: row.commandDescription,
    options: parseCommandOptions(row.commandOptionsJson),
    enabled: Boolean(row.commandEnabled ?? 1),
    createdAt: row.commandCreatedAt || null,
    updatedAt: row.commandUpdatedAt || null,
  };
}

export function groupInstalledCommands(rows) {
  const applications = new Map();
  for (const row of rows) {
    let application = applications.get(row.applicationId);
    if (!application) {
      application = {
        applicationId: row.applicationId,
        applicationName: row.applicationName,
        bot: {
          id: row.botUserId,
          username: row.botUsername,
          displayName: row.botDisplayName,
        },
        commands: [],
      };
      applications.set(row.applicationId, application);
    }
    if (row.commandId) application.commands.push(publicInstalledCommand(row));
  }
  return [...applications.values()];
}
