import { randomUUID } from "node:crypto";

function mapAvatar(row, compactAvatarData) {
  return {
    ...row,
    avatarData: compactAvatarData(row.avatarData),
  };
}

export function createSocialRepository(database, { compactAvatarData = (value) => value, createId = randomUUID } = {}) {
  function searchUsers(userId, query) {
    const like = `%${query}%`;
    return database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData,
        CASE WHEN EXISTS(SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = users.id)
          OR EXISTS(SELECT 1 FROM friendships WHERE user_id = users.id AND friend_id = ?) THEN 'accepted'
          WHEN EXISTS(SELECT 1 FROM friend_requests WHERE sender_id = ? AND recipient_id = users.id AND status = 'pending') THEN 'pending_sent'
          WHEN EXISTS(SELECT 1 FROM friend_requests WHERE sender_id = users.id AND recipient_id = ? AND status = 'pending') THEN 'pending_received'
          ELSE 'none' END AS friendshipStatus,
        (SELECT id FROM friend_requests WHERE sender_id = ? AND recipient_id = users.id AND status = 'pending' LIMIT 1) AS friendRequestId,
        EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = users.id) AS following
      FROM users
      WHERE users.id <> ? AND (users.username LIKE ? COLLATE NOCASE OR users.display_name LIKE ? COLLATE NOCASE)
      ORDER BY CASE WHEN users.username = ? COLLATE NOCASE THEN 0 ELSE 1 END, users.display_name COLLATE NOCASE
      LIMIT 20
    `).all(userId, userId, userId, userId, userId, userId, userId, like, like, query).map((item) => ({
      ...mapAvatar(item, compactAvatarData),
      following: Boolean(item.following),
    }));
  }

  function listSocial(userId) {
    const friends = database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData,
        friendships.created_at AS createdAt
      FROM friendships JOIN users ON users.id = friendships.friend_id
      WHERE friendships.user_id = ?
      UNION ALL
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData,
        friendships.created_at AS createdAt
      FROM friendships JOIN users ON users.id = friendships.user_id
      WHERE friendships.friend_id = ?
      ORDER BY displayName COLLATE NOCASE
    `).all(userId, userId).map((item) => mapAvatar(item, compactAvatarData));
    const incomingRequests = database.prepare(`
      SELECT friend_requests.id, friend_requests.created_at AS createdAt,
        users.id AS userId, users.username, users.display_name AS displayName, users.avatar_data AS avatarData
      FROM friend_requests JOIN users ON users.id = friend_requests.sender_id
      WHERE friend_requests.recipient_id = ? AND friend_requests.status = 'pending'
      ORDER BY friend_requests.created_at DESC
    `).all(userId).map((item) => mapAvatar(item, compactAvatarData));
    const outgoingRequests = database.prepare(`
      SELECT friend_requests.id, friend_requests.created_at AS createdAt,
        users.id AS userId, users.username, users.display_name AS displayName, users.avatar_data AS avatarData
      FROM friend_requests JOIN users ON users.id = friend_requests.recipient_id
      WHERE friend_requests.sender_id = ? AND friend_requests.status = 'pending'
      ORDER BY friend_requests.created_at DESC
    `).all(userId).map((item) => mapAvatar(item, compactAvatarData));
    const following = database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData,
        follows.created_at AS createdAt,
        COALESCE(channel_profiles.display_name, users.display_name) AS channelName,
        COALESCE(channel_profiles.avatar_data, users.avatar_data) AS channelAvatarData
      FROM follows JOIN users ON users.id = follows.followed_id
      LEFT JOIN channel_profiles ON channel_profiles.user_id = users.id
      WHERE follows.follower_id = ?
      ORDER BY channelName COLLATE NOCASE
    `).all(userId).map((item) => ({
      ...item,
      avatarData: compactAvatarData(item.avatarData),
      channelAvatarData: compactAvatarData(item.channelAvatarData),
    }));
    return {
      friends,
      incomingRequests,
      outgoingRequests,
      following,
      counts: { friends: friends.length, incomingRequests: incomingRequests.length, following: following.length },
    };
  }

  function pendingFriendRequest(requestId, recipientId) {
    return database.prepare(`
      SELECT friend_requests.id, friend_requests.sender_id AS senderId, friend_requests.recipient_id AS recipientId,
        users.display_name AS senderName
      FROM friend_requests JOIN users ON users.id = friend_requests.sender_id
      WHERE friend_requests.id = ? AND friend_requests.recipient_id = ? AND friend_requests.status = 'pending'
    `).get(requestId, recipientId) || null;
  }

  function decideFriendRequest(requestId, recipientId, action, updatedAt = new Date().toISOString()) {
    const request = pendingFriendRequest(requestId, recipientId);
    if (!request) return null;
    try {
      database.exec("BEGIN IMMEDIATE");
      database.prepare("UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
        .run(action === "accept" ? "accepted" : "declined", updatedAt, requestId);
      if (action === "accept") {
        database.prepare("INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?), (?, ?, ?)")
          .run(recipientId, request.senderId, updatedAt, request.senderId, recipientId, updatedAt);
      }
      database.exec("COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
    return { ...request, status: action === "accept" ? "accepted" : "declined" };
  }

  function cancelFriendRequest(requestId, senderId, updatedAt = new Date().toISOString()) {
    const result = database.prepare("UPDATE friend_requests SET status = 'canceled', updated_at = ? WHERE id = ? AND sender_id = ? AND status = 'pending'")
      .run(updatedAt, requestId, senderId);
    return result.changes > 0;
  }

  function targetUser(userId) {
    return database.prepare("SELECT id, display_name AS displayName FROM users WHERE id = ?").get(userId) || null;
  }

  function friendshipExists(userId, targetUserId) {
    return Boolean(database.prepare("SELECT 1 FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1")
      .get(userId, targetUserId, targetUserId, userId));
  }

  function pendingRequest(senderId, recipientId) {
    return database.prepare("SELECT id FROM friend_requests WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'")
      .get(senderId, recipientId) || null;
  }

  function createFriendRequest(senderId, recipientId, createdAt = new Date().toISOString()) {
    const requestId = createId();
    database.prepare("INSERT INTO friend_requests (id, sender_id, recipient_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)")
      .run(requestId, senderId, recipientId, createdAt, createdAt);
    return { requestId, createdAt };
  }

  function removeFriendship(userId, targetUserId) {
    const result = database.prepare("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)")
      .run(userId, targetUserId, targetUserId, userId);
    return result.changes > 0;
  }

  function userExists(userId) {
    return Boolean(database.prepare("SELECT id FROM users WHERE id = ?").get(userId));
  }

  function setFollowing(userId, targetUserId, following, createdAt = new Date().toISOString()) {
    if (following) {
      database.prepare("INSERT OR IGNORE INTO follows (follower_id, followed_id, created_at) VALUES (?, ?, ?)").run(userId, targetUserId, createdAt);
    } else {
      database.prepare("DELETE FROM follows WHERE follower_id = ? AND followed_id = ?").run(userId, targetUserId);
    }
  }

  return { searchUsers, listSocial, pendingFriendRequest, decideFriendRequest, cancelFriendRequest, targetUser, friendshipExists, pendingRequest, createFriendRequest, removeFriendship, userExists, setFollowing };
}
