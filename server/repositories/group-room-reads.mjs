function roomKeyFor(roomId) {
  return roomId || "__general__";
}

function countsFromRows(rows) {
  return Object.fromEntries(rows.map((row) => [row.roomKey, Number(row.unreadCount || 0)]));
}

export function createGroupRoomReadRepository(database) {
  function markRead({ groupId, userId, roomId = null, readAt = new Date().toISOString() }) {
    const roomKey = roomKeyFor(roomId);
    database.prepare(`
      INSERT INTO group_room_reads (group_id, user_id, room_key, room_id, read_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(group_id, user_id, room_key) DO UPDATE SET
        room_id = excluded.room_id,
        read_at = CASE WHEN excluded.read_at > group_room_reads.read_at THEN excluded.read_at ELSE group_room_reads.read_at END
    `).run(groupId, userId, roomKey, roomId, readAt);
    return { groupId, userId, roomId, readAt };
  }

  function listUnreadCounts(groupId, userId) {
    return countsFromRows(database.prepare(`
      SELECT COALESCE(group_messages.room_id, '__general__') AS roomKey, COUNT(*) AS unreadCount
      FROM group_messages
      JOIN group_members ON group_members.group_id = group_messages.group_id AND group_members.user_id = ?
      LEFT JOIN group_room_reads ON group_room_reads.group_id = group_messages.group_id
        AND group_room_reads.user_id = ?
        AND group_room_reads.room_key = COALESCE(group_messages.room_id, '__general__')
      WHERE group_messages.group_id = ?
        AND group_messages.user_id <> ?
        AND group_messages.created_at > COALESCE(group_room_reads.read_at, group_members.created_at)
      GROUP BY COALESCE(group_messages.room_id, '__general__')
    `).all(userId, userId, groupId, userId));
  }

  return { markRead, listUnreadCounts };
}

export function createPostgresGroupRoomReadRepository(database) {
  async function markRead({ groupId, userId, roomId = null, readAt = new Date().toISOString() }) {
    const roomKey = roomKeyFor(roomId);
    await database.query(`
      INSERT INTO group_room_reads (group_id, user_id, room_key, room_id, read_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (group_id, user_id, room_key) DO UPDATE SET
        room_id = EXCLUDED.room_id,
        read_at = GREATEST(group_room_reads.read_at, EXCLUDED.read_at)
    `, [groupId, userId, roomKey, roomId, readAt]);
    return { groupId, userId, roomId, readAt };
  }

  async function listUnreadCounts(groupId, userId) {
    const result = await database.query(`
      SELECT COALESCE(group_messages.room_id, '__general__') AS "roomKey", COUNT(*) AS "unreadCount"
      FROM group_messages
      JOIN group_members ON group_members.group_id = group_messages.group_id AND group_members.user_id = $1
      LEFT JOIN group_room_reads ON group_room_reads.group_id = group_messages.group_id
        AND group_room_reads.user_id = $1
        AND group_room_reads.room_key = COALESCE(group_messages.room_id, '__general__')
      WHERE group_messages.group_id = $2
        AND group_messages.user_id <> $1
        AND group_messages.created_at > COALESCE(group_room_reads.read_at, group_members.created_at)
      GROUP BY COALESCE(group_messages.room_id, '__general__')
    `, [userId, groupId]);
    return countsFromRows(result.rows);
  }

  return { markRead, listUnreadCounts };
}
