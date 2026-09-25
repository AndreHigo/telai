export function createGroupSettingsRepository(database) {
  function findGroup(groupId) {
    return database.prepare("SELECT id, name, slug, owner_id AS ownerId FROM groups WHERE id = ?").get(groupId) || null;
  }

  function updateGroup(groupId, name, slug) {
    database.prepare("UPDATE groups SET name = ?, slug = ? WHERE id = ?").run(name, slug, groupId);
    return database.prepare("SELECT id, name, slug FROM groups WHERE id = ?").get(groupId) || null;
  }

  function deleteGroup(groupId) {
    return database.prepare("DELETE FROM groups WHERE id = ?").run(groupId).changes > 0;
  }

  return { findGroup, updateGroup, deleteGroup };
}

export function createPostgresGroupSettingsRepository(database) {
  async function findGroup(groupId) {
    const result = await database.query('SELECT id, name, slug, owner_id AS "ownerId" FROM groups WHERE id = $1', [groupId]);
    return result.rows[0] || null;
  }

  async function updateGroup(groupId, name, slug) {
    await database.query("UPDATE groups SET name = $1, slug = $2 WHERE id = $3", [name, slug, groupId]);
    const result = await database.query("SELECT id, name, slug FROM groups WHERE id = $1", [groupId]);
    return result.rows[0] || null;
  }

  async function deleteGroup(groupId) {
    const result = await database.query("DELETE FROM groups WHERE id = $1", [groupId]);
    return result.rowCount > 0;
  }

  return { findGroup, updateGroup, deleteGroup };
}
