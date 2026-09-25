import { randomUUID } from "node:crypto";

function streamSelectSql({ following = false } = {}) {
  return `
    SELECT streams.id, streams.room_name AS roomName, streams.room_id AS roomId, streams.voice_room_id AS voiceRoomId,
      streams.title, streams.visibility, streams.group_id AS groupId, streams.started_at AS startedAt,
      COALESCE(channel_profiles.display_name, users.display_name) AS channelName,
      COALESCE(channel_profiles.avatar_data, users.avatar_data) AS channelAvatarData,
      channel_profiles.games AS channelGames, users.username AS channelUsername,
      groups.name AS groupName, groups.slug AS groupSlug${following ? ", EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = streams.created_by) AS following" : ""}
    FROM streams JOIN users ON users.id = streams.created_by
      LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id
      LEFT JOIN groups ON groups.id = streams.group_id
  `;
}

export function createStreamRepository(database, { createId = randomUUID } = {}) {
  function listPublicStreams({ userId = null, followingOnly = false } = {}) {
    if (!userId) return database.prepare(`${streamSelectSql()} WHERE streams.ended_at IS NULL AND streams.visibility = 'public' ORDER BY streams.started_at DESC`).all();
    return database.prepare(`${streamSelectSql({ following: true })}
      WHERE streams.ended_at IS NULL AND streams.visibility = 'public'
        AND (? = 0 OR EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = streams.created_by))
      ORDER BY streams.started_at DESC
    `).all(userId, followingOnly ? 1 : 0, userId);
  }

  function listActiveStreams() {
    return database.prepare(`${streamSelectSql()} WHERE streams.ended_at IS NULL ORDER BY streams.started_at DESC`).all();
  }

  function listGroupStreams(groupId) {
    return database.prepare(`${streamSelectSql()}
      WHERE streams.group_id = ? AND streams.ended_at IS NULL ORDER BY streams.started_at DESC
    `).all(groupId);
  }

  function listAdminStreams() {
    return database.prepare(`
      SELECT streams.id, streams.room_name AS roomName, streams.title, streams.visibility,
        streams.group_id AS groupId, streams.started_at AS startedAt,
        COALESCE(channel_profiles.display_name, users.display_name) AS creatorName,
        users.username AS creatorUsername, groups.name AS groupName
      FROM streams JOIN users ON users.id = streams.created_by
        LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id
        LEFT JOIN groups ON groups.id = streams.group_id
      WHERE streams.ended_at IS NULL ORDER BY streams.started_at DESC
    `).all();
  }

  function findForRoom(roomId) {
    return database.prepare(`
      SELECT id, room_name AS roomName, created_by AS createdBy, visibility,
        group_id AS groupId, started_at AS startedAt, ended_at AS endedAt
      FROM streams WHERE room_name = ? ORDER BY started_at DESC LIMIT 1
    `).get(roomId) || null;
  }

  function findActiveForRoom(roomId) {
    return database.prepare(`
      SELECT id, room_name AS roomName, created_by AS createdBy, visibility,
        group_id AS groupId, started_at AS startedAt, ended_at AS endedAt
      FROM streams WHERE room_name = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1
    `).get(roomId) || null;
  }

  function findById(streamId) {
    return database.prepare("SELECT id, created_by AS createdBy, room_name AS roomName, ended_at AS endedAt FROM streams WHERE id = ?").get(streamId) || null;
  }

  function loadChatForRoom(roomId) {
    const stream = findForRoom(roomId);
    if (!stream) return [];
    return database.prepare(`
      SELECT id, user_id AS userId, body, display_name AS displayName, username, created_at AS createdAt
      FROM stream_chat_messages WHERE stream_id = ? ORDER BY created_at DESC LIMIT 120
    `).all(stream.id).reverse();
  }

  function insertChatMessage(message) {
    database.prepare(`
      INSERT INTO stream_chat_messages (id, channel_user_id, stream_id, user_id, body, display_name, username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(message.id, message.channelUserId, message.streamId, message.userId, message.body, message.displayName, message.username, message.createdAt);
  }

  function clearChat(streamId) {
    database.prepare("DELETE FROM stream_chat_messages WHERE stream_id = ?").run(streamId);
  }

  function endByRoom(roomId, endedAt = new Date().toISOString()) {
    database.prepare("UPDATE streams SET ended_at = ? WHERE room_name = ? AND ended_at IS NULL").run(endedAt, roomId);
  }

  function endById(streamId, endedAt = new Date().toISOString()) {
    return database.prepare("UPDATE streams SET ended_at = ? WHERE id = ? AND ended_at IS NULL").run(endedAt, streamId).changes > 0;
  }

  function followerIds(userId) {
    return database.prepare("SELECT follower_id AS followerId FROM follows WHERE followed_id = ?").all(userId).map(({ followerId }) => followerId);
  }

  function follow(followerId, followedId, following, createdAt = new Date().toISOString()) {
    if (following) database.prepare("INSERT OR IGNORE INTO follows (follower_id, followed_id, created_at) VALUES (?, ?, ?)").run(followerId, followedId, createdAt);
    else database.prepare("DELETE FROM follows WHERE follower_id = ? AND followed_id = ?").run(followerId, followedId);
  }

  function createStream({ roomName, visibility, groupId, roomId, voiceRoomId, title, channelName, channelAvatarData, channelGames, channelUsername, createdBy, groupSlug, isLive = () => true, id = createId(), startedAt = new Date().toISOString() }) {
    try {
      database.exec("BEGIN IMMEDIATE");
      const activeStreams = visibility === "public"
        ? database.prepare("SELECT room_name AS roomName, started_at AS startedAt FROM streams WHERE created_by = ? AND visibility = 'public' AND ended_at IS NULL ORDER BY started_at DESC").all(createdBy)
        : database.prepare("SELECT room_name AS roomName, started_at AS startedAt FROM streams WHERE created_by = ? AND visibility = 'private' AND group_id = ? AND ended_at IS NULL ORDER BY started_at DESC").all(createdBy, groupId);
      if (activeStreams.some(isLive)) {
        database.exec("ROLLBACK");
        return { kind: "already-live" };
      }
      database.prepare("INSERT INTO streams (id, room_name, created_by, title, visibility, group_id, room_id, voice_room_id, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, roomName, createdBy, title, visibility, groupId, roomId, voiceRoomId, startedAt);
      database.exec("COMMIT");
      return { kind: "created", stream: { id, roomName, visibility, groupId, roomId, voiceRoomId, title, channelName, channelAvatarData, channelGames, channelUsername, createdBy, groupSlug } };
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  return { listPublicStreams, listActiveStreams, listGroupStreams, listAdminStreams, findForRoom, findActiveForRoom, findById, loadChatForRoom, insertChatMessage, clearChat, endByRoom, endById, followerIds, follow, createStream };
}

async function withPostgresTransaction(database, callback, useProvidedClient = false) {
  const client = useProvidedClient ? database : (typeof database.connect === "function" ? await database.connect() : database);
  const ownsClient = client !== database;
  try {
    if (!useProvidedClient) await client.query("BEGIN");
    const result = await callback(client);
    if (!useProvidedClient) await client.query("COMMIT");
    return result;
  } catch (error) {
    if (!useProvidedClient) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (ownsClient) client.release();
  }
}

function postgresStreamSelect({ following = false } = {}) {
  return `
    SELECT streams.id, streams.room_name AS "roomName", streams.room_id AS "roomId", streams.voice_room_id AS "voiceRoomId",
      streams.title, streams.visibility, streams.group_id AS "groupId", streams.started_at AS "startedAt",
      COALESCE(channel_profiles.display_name, users.display_name) AS "channelName",
      COALESCE(channel_profiles.avatar_data, users.avatar_data) AS "channelAvatarData",
      channel_profiles.games AS "channelGames", users.username AS "channelUsername",
      groups.name AS "groupName", groups.slug AS "groupSlug"${following ? ', EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = streams.created_by) AS following' : ""}
    FROM streams JOIN users ON users.id = streams.created_by
      LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id
      LEFT JOIN groups ON groups.id = streams.group_id
  `;
}

export function createPostgresStreamRepository(database, { createId = randomUUID, transactionClient = false } = {}) {
  async function listPublicStreams({ userId = null, followingOnly = false } = {}) {
    if (!userId) return (await database.query(`${postgresStreamSelect()} WHERE streams.ended_at IS NULL AND streams.visibility = 'public' ORDER BY streams.started_at DESC`)).rows;
    return (await database.query(`${postgresStreamSelect({ following: true })}
      WHERE streams.ended_at IS NULL AND streams.visibility = 'public'
        AND ($2 = 0 OR EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = streams.created_by))
      ORDER BY streams.started_at DESC
    `, [userId, followingOnly ? 1 : 0])).rows;
  }

  async function listActiveStreams() {
    return (await database.query(`${postgresStreamSelect()} WHERE streams.ended_at IS NULL ORDER BY streams.started_at DESC`)).rows;
  }

  async function listGroupStreams(groupId) {
    return (await database.query(`${postgresStreamSelect()} WHERE streams.group_id = $1 AND streams.ended_at IS NULL ORDER BY streams.started_at DESC`, [groupId])).rows;
  }

  async function listAdminStreams() {
    return (await database.query(`
      SELECT streams.id, streams.room_name AS "roomName", streams.title, streams.visibility, streams.group_id AS "groupId", streams.started_at AS "startedAt",
        COALESCE(channel_profiles.display_name, users.display_name) AS "creatorName", users.username AS "creatorUsername", groups.name AS "groupName"
      FROM streams JOIN users ON users.id = streams.created_by LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id LEFT JOIN groups ON groups.id = streams.group_id
      WHERE streams.ended_at IS NULL ORDER BY streams.started_at DESC
    `)).rows;
  }

  async function findForRoom(roomId) {
    return (await database.query('SELECT id, room_name AS "roomName", created_by AS "createdBy", visibility, group_id AS "groupId", started_at AS "startedAt", ended_at AS "endedAt" FROM streams WHERE room_name = $1 ORDER BY started_at DESC LIMIT 1', [roomId])).rows[0] || null;
  }

  async function findActiveForRoom(roomId) {
    return (await database.query('SELECT id, room_name AS "roomName", created_by AS "createdBy", visibility, group_id AS "groupId", started_at AS "startedAt", ended_at AS "endedAt" FROM streams WHERE room_name = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1', [roomId])).rows[0] || null;
  }

  async function findById(streamId) {
    return (await database.query('SELECT id, created_by AS "createdBy", room_name AS "roomName", ended_at AS "endedAt" FROM streams WHERE id = $1', [streamId])).rows[0] || null;
  }

  async function loadChatForRoom(roomId) {
    const stream = await findForRoom(roomId);
    if (!stream) return [];
    const result = await database.query('SELECT id, user_id AS "userId", body, display_name AS "displayName", username, created_at AS "createdAt" FROM stream_chat_messages WHERE stream_id = $1 ORDER BY created_at DESC LIMIT 120', [stream.id]);
    return result.rows.reverse();
  }

  async function insertChatMessage(message) {
    await database.query('INSERT INTO stream_chat_messages (id, channel_user_id, stream_id, user_id, body, display_name, username, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [message.id, message.channelUserId, message.streamId, message.userId, message.body, message.displayName, message.username, message.createdAt]);
  }

  async function clearChat(streamId) { await database.query("DELETE FROM stream_chat_messages WHERE stream_id = $1", [streamId]); }
  async function endByRoom(roomId, endedAt = new Date().toISOString()) { await database.query("UPDATE streams SET ended_at = $1 WHERE room_name = $2 AND ended_at IS NULL", [endedAt, roomId]); }
  async function endById(streamId, endedAt = new Date().toISOString()) { return (await database.query("UPDATE streams SET ended_at = $1 WHERE id = $2 AND ended_at IS NULL", [endedAt, streamId])).rowCount > 0; }
  async function followerIds(userId) { return (await database.query("SELECT follower_id AS \"followerId\" FROM follows WHERE followed_id = $1", [userId])).rows.map(({ followerId }) => followerId); }
  async function follow(followerId, followedId, following, createdAt = new Date().toISOString()) {
    if (following) await database.query("INSERT INTO follows (follower_id, followed_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (follower_id, followed_id) DO NOTHING", [followerId, followedId, createdAt]);
    else await database.query("DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2", [followerId, followedId]);
  }

  async function createStream({ roomName, visibility, groupId, roomId, voiceRoomId, title, channelName, channelAvatarData, channelGames, channelUsername, createdBy, groupSlug, isLive = () => true, id = createId(), startedAt = new Date().toISOString() }) {
    return withPostgresTransaction(database, async (client) => {
      const activeResult = visibility === "public"
        ? await client.query('SELECT room_name AS "roomName", started_at AS "startedAt" FROM streams WHERE created_by = $1 AND visibility = \'public\' AND ended_at IS NULL ORDER BY started_at DESC', [createdBy])
        : await client.query('SELECT room_name AS "roomName", started_at AS "startedAt" FROM streams WHERE created_by = $1 AND visibility = \'private\' AND group_id = $2 AND ended_at IS NULL ORDER BY started_at DESC', [createdBy, groupId]);
      if (activeResult.rows.some(isLive)) return { kind: "already-live" };
      await client.query("INSERT INTO streams (id, room_name, created_by, title, visibility, group_id, room_id, voice_room_id, started_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [id, roomName, createdBy, title, visibility, groupId, roomId, voiceRoomId, startedAt]);
      return { kind: "created", stream: { id, roomName, visibility, groupId, roomId, voiceRoomId, title, channelName, channelAvatarData, channelGames, channelUsername, createdBy, groupSlug } };
    }, transactionClient);
  }

  return { listPublicStreams, listActiveStreams, listGroupStreams, listAdminStreams, findForRoom, findActiveForRoom, findById, loadChatForRoom, insertChatMessage, clearChat, endByRoom, endById, followerIds, follow, createStream };
}
