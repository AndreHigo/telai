import { randomUUID } from "node:crypto";

export function createNotificationRepository(database, { createId = randomUUID } = {}) {
  function createNotification({ userId, type, entityId, groupId = null, title, body, createdAt = new Date().toISOString() }) {
    database.prepare(`
      INSERT OR IGNORE INTO notifications (id, user_id, type, entity_id, group_id, title, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(createId(), userId, type, entityId, groupId, title, body, createdAt);
  }

  return { createNotification };
}
