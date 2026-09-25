import { randomUUID } from "node:crypto";

export function createMaintenanceRepository(database, { createId = randomUUID } = {}) {
  function active(now = new Date().toISOString()) {
    return database.prepare(`
      SELECT id, message, starts_at AS startsAt, expires_at AS expiresAt
      FROM maintenance_notices WHERE expires_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).get(now) || null;
  }

  function schedule({ message, startsAt, expiresAt, createdBy = null, createdAt = new Date().toISOString(), id = createId() }, now = new Date().toISOString()) {
    database.prepare("UPDATE maintenance_notices SET expires_at = ? WHERE expires_at > ?").run(now, now);
    database.prepare(`
      INSERT INTO maintenance_notices (id, message, starts_at, expires_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, message, startsAt, expiresAt, createdBy, createdAt);
    return id;
  }

  function clear(now = new Date().toISOString()) {
    return database.prepare("UPDATE maintenance_notices SET expires_at = ? WHERE expires_at > ?").run(now, now).changes;
  }

  return { active, schedule, clear };
}

export function createPostgresMaintenanceRepository(database, { createId = randomUUID } = {}) {
  async function active(now = new Date().toISOString()) {
    const result = await database.query(`
      SELECT id, message, starts_at AS "startsAt", expires_at AS "expiresAt"
      FROM maintenance_notices WHERE expires_at > $1
      ORDER BY created_at DESC LIMIT 1
    `, [now]);
    return result.rows[0] || null;
  }

  async function schedule({ message, startsAt, expiresAt, createdBy = null, createdAt = new Date().toISOString(), id = createId() }, now = new Date().toISOString()) {
    await database.query("UPDATE maintenance_notices SET expires_at = $1 WHERE expires_at > $2", [now, now]);
    await database.query(`
      INSERT INTO maintenance_notices (id, message, starts_at, expires_at, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, message, startsAt, expiresAt, createdBy, createdAt]);
    return id;
  }

  async function clear(now = new Date().toISOString()) {
    const result = await database.query("UPDATE maintenance_notices SET expires_at = $1 WHERE expires_at > $2", [now, now]);
    return result.rowCount;
  }

  return { active, schedule, clear };
}
