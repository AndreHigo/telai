import { randomUUID } from "node:crypto";

export function createGroupRoomRepository(database, { createId = randomUUID } = {}) {
  function listTextRooms(groupId) {
    return database.prepare(`
      SELECT id, name, slug, kind, created_at AS createdAt
      FROM group_rooms WHERE group_id = ? AND kind = 'text'
      ORDER BY CASE WHEN slug = 'geral' THEN 0 ELSE 1 END, name COLLATE NOCASE
    `).all(groupId);
  }

  function listVoiceRooms(groupId) {
    return database.prepare(`
      SELECT id, name, slug, 'voice' AS kind, COALESCE(max_participants, 8) AS maxParticipants, created_at AS createdAt
      FROM group_voice_rooms WHERE group_id = ? ORDER BY name COLLATE NOCASE
    `).all(groupId);
  }

  function findBySlug(groupId, slug, excludeId = null) {
    return database.prepare(`
      SELECT 1 FROM group_rooms WHERE group_id = ? AND slug = ? AND (? IS NULL OR id <> ?)
      UNION ALL
      SELECT 1 FROM group_voice_rooms WHERE group_id = ? AND slug = ? AND (? IS NULL OR id <> ?)
      LIMIT 1
    `).get(groupId, slug, excludeId, excludeId, groupId, slug, excludeId, excludeId) || null;
  }

  function findRoom(groupId, roomId) {
    const textRoom = database.prepare("SELECT id, name, slug, kind FROM group_rooms WHERE id = ? AND group_id = ?").get(roomId, groupId);
    if (textRoom) return textRoom;
    return database.prepare("SELECT id, name, slug, 'voice' AS kind, COALESCE(max_participants, 8) AS maxParticipants FROM group_voice_rooms WHERE id = ? AND group_id = ?").get(roomId, groupId) || null;
  }

  function createRoom({ groupId, name, slug, kind, maxParticipants, createdBy, createdAt = new Date().toISOString(), id = createId() }) {
    const room = { id, groupId, name, slug, kind, ...(kind === "voice" ? { maxParticipants } : {}), createdAt };
    if (kind === "voice") database.prepare("INSERT INTO group_voice_rooms (id, group_id, name, slug, max_participants, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, groupId, name, slug, maxParticipants, createdBy, createdAt);
    else database.prepare("INSERT INTO group_rooms (id, group_id, name, slug, kind, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, groupId, name, slug, kind, createdBy, createdAt);
    return room;
  }

  function deleteRoom(groupId, roomId, kind) {
    return database.prepare(`DELETE FROM ${kind === "voice" ? "group_voice_rooms" : "group_rooms"} WHERE id = ? AND group_id = ?`).run(roomId, groupId).changes > 0;
  }

  function updateRoom({ groupId, roomId, kind, name, slug, maxParticipants }) {
    if (kind === "voice") {
      database.prepare("UPDATE group_voice_rooms SET name = ?, slug = ?, max_participants = ? WHERE id = ? AND group_id = ?").run(name, slug, maxParticipants, roomId, groupId);
      return { id: roomId, groupId, name, slug, kind, maxParticipants };
    }
    database.prepare("UPDATE group_rooms SET name = ?, slug = ? WHERE id = ? AND group_id = ?").run(name, slug, roomId, groupId);
    return { id: roomId, groupId, name, slug, kind };
  }

  return { listTextRooms, listVoiceRooms, findBySlug, findRoom, createRoom, deleteRoom, updateRoom };
}

export function createPostgresGroupRoomRepository(database, { createId = randomUUID } = {}) {
  async function listTextRooms(groupId) {
    const result = await database.query(`
      SELECT id, name, slug, kind, created_at AS "createdAt"
      FROM group_rooms WHERE group_id = $1 AND kind = 'text'
      ORDER BY CASE WHEN slug = 'geral' THEN 0 ELSE 1 END, LOWER(name)
    `, [groupId]);
    return result.rows;
  }

  async function listVoiceRooms(groupId) {
    const result = await database.query(`
      SELECT id, name, slug, 'voice' AS kind, COALESCE(max_participants, 8) AS "maxParticipants", created_at AS "createdAt"
      FROM group_voice_rooms WHERE group_id = $1 ORDER BY LOWER(name)
    `, [groupId]);
    return result.rows;
  }

  async function findBySlug(groupId, slug, excludeId = null) {
    const result = await database.query(`
      SELECT 1 FROM group_rooms WHERE group_id = $1 AND slug = $2 AND ($3::text IS NULL OR id <> $3)
      UNION ALL
      SELECT 1 FROM group_voice_rooms WHERE group_id = $1 AND slug = $2 AND ($3::text IS NULL OR id <> $3)
      LIMIT 1
    `, [groupId, slug, excludeId]);
    return result.rows[0] || null;
  }

  async function findRoom(groupId, roomId) {
    const textResult = await database.query('SELECT id, name, slug, kind FROM group_rooms WHERE id = $1 AND group_id = $2', [roomId, groupId]);
    if (textResult.rows[0]) return textResult.rows[0];
    const voiceResult = await database.query('SELECT id, name, slug, \'voice\' AS kind, COALESCE(max_participants, 8) AS "maxParticipants" FROM group_voice_rooms WHERE id = $1 AND group_id = $2', [roomId, groupId]);
    return voiceResult.rows[0] || null;
  }

  async function createRoom({ groupId, name, slug, kind, maxParticipants, createdBy, createdAt = new Date().toISOString(), id = createId() }) {
    const room = { id, groupId, name, slug, kind, ...(kind === "voice" ? { maxParticipants } : {}), createdAt };
    if (kind === "voice") await database.query("INSERT INTO group_voice_rooms (id, group_id, name, slug, max_participants, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [id, groupId, name, slug, maxParticipants, createdBy, createdAt]);
    else await database.query("INSERT INTO group_rooms (id, group_id, name, slug, kind, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [id, groupId, name, slug, kind, createdBy, createdAt]);
    return room;
  }

  async function deleteRoom(groupId, roomId, kind) {
    const result = await database.query(`DELETE FROM ${kind === "voice" ? "group_voice_rooms" : "group_rooms"} WHERE id = $1 AND group_id = $2`, [roomId, groupId]);
    return result.rowCount > 0;
  }

  async function updateRoom({ groupId, roomId, kind, name, slug, maxParticipants }) {
    if (kind === "voice") await database.query("UPDATE group_voice_rooms SET name = $1, slug = $2, max_participants = $3 WHERE id = $4 AND group_id = $5", [name, slug, maxParticipants, roomId, groupId]);
    else await database.query("UPDATE group_rooms SET name = $1, slug = $2 WHERE id = $3 AND group_id = $4", [name, slug, roomId, groupId]);
    return { id: roomId, groupId, name, slug, kind, ...(kind === "voice" ? { maxParticipants } : {}) };
  }

  return { listTextRooms, listVoiceRooms, findBySlug, findRoom, createRoom, deleteRoom, updateRoom };
}
