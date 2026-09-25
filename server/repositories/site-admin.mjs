function mapAccount(account) {
  return { ...account, hasActiveSession: Boolean(account.hasActiveSession) };
}

function mapGroup(group) {
  return { ...group, memberCount: Number(group.memberCount || 0) };
}

export function createSiteAdminRepository(database) {
  function listAccounts(now, limit = null, offset = 0) {
    const query = `
      SELECT users.id, users.username, users.display_name AS displayName, users.email,
        users.created_at AS createdAt,
        (SELECT COUNT(*) FROM group_members WHERE user_id = users.id) AS groupCount,
        (SELECT COUNT(*) FROM groups WHERE owner_id = users.id) AS ownedGroupCount,
        EXISTS(SELECT 1 FROM sessions WHERE user_id = users.id AND expires_at > ?) AS hasActiveSession
      FROM users ORDER BY users.created_at DESC`;
    const rows = limit === null
      ? database.prepare(query).all(now)
      : database.prepare(`${query} LIMIT ? OFFSET ?`).all(now, limit, offset);
    return rows.map(mapAccount);
  }

  function countAccounts() {
    return Number(database.prepare("SELECT COUNT(*) AS count FROM users").get().count || 0);
  }

  function listGroups(limit = null, offset = 0) {
    const query = `
      SELECT groups.id, groups.name, groups.slug, groups.created_at AS createdAt,
        groups.owner_id AS ownerId,
        COALESCE(users.display_name, users.username) AS ownerName,
        (SELECT COUNT(*) FROM group_members WHERE group_id = groups.id) AS memberCount
      FROM groups JOIN users ON users.id = groups.owner_id
      ORDER BY groups.created_at DESC`;
    const rows = limit === null
      ? database.prepare(query).all()
      : database.prepare(`${query} LIMIT ? OFFSET ?`).all(limit, offset);
    return rows.map(mapGroup);
  }

  function countGroups() {
    return Number(database.prepare("SELECT COUNT(*) AS count FROM groups").get().count || 0);
  }

  function countActiveSessions(now) {
    return Number(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at > ?").get(now).count || 0);
  }

  function findGroupWithOwner(groupId) {
    return database.prepare(`
      SELECT groups.id, groups.name, groups.slug,
        COALESCE(users.display_name, users.username) AS ownerName
      FROM groups JOIN users ON users.id = groups.owner_id WHERE groups.id = ?
    `).get(groupId) || null;
  }

  function countGroupMembers(groupId) {
    return Number(database.prepare("SELECT COUNT(*) AS count FROM group_members WHERE group_id = ?").get(groupId).count || 0);
  }

  function listGroupMembers(groupId, limit, offset) {
    return database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName,
        group_members.role, group_members.created_at AS joinedAt
      FROM group_members JOIN users ON users.id = group_members.user_id
      WHERE group_members.group_id = ?
      ORDER BY CASE group_members.role WHEN 'owner' THEN 0 ELSE 1 END, users.display_name COLLATE NOCASE
      LIMIT ? OFFSET ?
    `).all(groupId, limit, offset);
  }

  return { listAccounts, countAccounts, listGroups, countGroups, countActiveSessions, findGroupWithOwner, countGroupMembers, listGroupMembers };
}

export function createPostgresSiteAdminRepository(database) {
  async function listAccounts(now, limit = null, offset = 0) {
    const query = `
      SELECT users.id, users.username, users.display_name AS "displayName", users.email,
        users.created_at AS "createdAt",
        (SELECT COUNT(*) FROM group_members WHERE user_id = users.id) AS "groupCount",
        (SELECT COUNT(*) FROM groups WHERE owner_id = users.id) AS "ownedGroupCount",
        EXISTS(SELECT 1 FROM sessions WHERE user_id = users.id AND expires_at > $1) AS "hasActiveSession"
      FROM users ORDER BY users.created_at DESC`;
    const result = limit === null
      ? await database.query(query, [now])
      : await database.query(`${query} LIMIT $2 OFFSET $3`, [now, limit, offset]);
    return result.rows.map(mapAccount);
  }

  async function countAccounts() {
    const result = await database.query("SELECT COUNT(*) AS count FROM users");
    return Number(result.rows[0]?.count || 0);
  }

  async function listGroups(limit = null, offset = 0) {
    const query = `
      SELECT groups.id, groups.name, groups.slug, groups.created_at AS "createdAt",
        groups.owner_id AS "ownerId",
        COALESCE(users.display_name, users.username) AS "ownerName",
        (SELECT COUNT(*) FROM group_members WHERE group_id = groups.id) AS "memberCount"
      FROM groups JOIN users ON users.id = groups.owner_id
      ORDER BY groups.created_at DESC`;
    const result = limit === null
      ? await database.query(query)
      : await database.query(`${query} LIMIT $1 OFFSET $2`, [limit, offset]);
    return result.rows.map(mapGroup);
  }

  async function countGroups() {
    const result = await database.query("SELECT COUNT(*) AS count FROM groups");
    return Number(result.rows[0]?.count || 0);
  }

  async function countActiveSessions(now) {
    const result = await database.query("SELECT COUNT(*) AS count FROM sessions WHERE expires_at > $1", [now]);
    return Number(result.rows[0]?.count || 0);
  }

  async function findGroupWithOwner(groupId) {
    const result = await database.query(`
      SELECT groups.id, groups.name, groups.slug,
        COALESCE(users.display_name, users.username) AS "ownerName"
      FROM groups JOIN users ON users.id = groups.owner_id WHERE groups.id = $1
    `, [groupId]);
    return result.rows[0] || null;
  }

  async function countGroupMembers(groupId) {
    const result = await database.query("SELECT COUNT(*) AS count FROM group_members WHERE group_id = $1", [groupId]);
    return Number(result.rows[0]?.count || 0);
  }

  async function listGroupMembers(groupId, limit, offset) {
    const result = await database.query(`
      SELECT users.id, users.username, users.display_name AS "displayName",
        group_members.role, group_members.created_at AS "joinedAt"
      FROM group_members JOIN users ON users.id = group_members.user_id
      WHERE group_members.group_id = $1
      ORDER BY CASE group_members.role WHEN 'owner' THEN 0 ELSE 1 END, LOWER(users.display_name)
      LIMIT $2 OFFSET $3
    `, [groupId, limit, offset]);
    return result.rows;
  }

  return { listAccounts, countAccounts, listGroups, countGroups, countActiveSessions, findGroupWithOwner, countGroupMembers, listGroupMembers };
}
