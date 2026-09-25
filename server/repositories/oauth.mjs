import { randomBytes, randomUUID } from "node:crypto";

export function createOAuthRepository(database, {
  slugFor,
  createPasswordHash,
  createId = randomUUID,
  createSuffix = () => randomBytes(4).toString("hex"),
  mergeUsers,
} = {}) {
  if (typeof slugFor !== "function") throw new Error("slugFor is required");
  if (typeof createPasswordHash !== "function") throw new Error("createPasswordHash is required");
  if (typeof mergeUsers !== "function") throw new Error("mergeUsers is required");

  function uniqueOAuthUsername(providerName, identity) {
    const base = (slugFor(identity.usernameHint) || slugFor(identity.displayName) || providerName).slice(0, 24);
    let candidate = base.length >= 3 ? base : `${providerName}-${base}`.slice(0, 32);
    while (database.prepare("SELECT 1 FROM users WHERE LOWER(username) = LOWER(?)").get(candidate)) {
      candidate = `${base.slice(0, 23)}-${createSuffix()}`.slice(0, 32);
    }
    return candidate;
  }

  function upsertOAuthUser(providerName, identity) {
    const linked = database.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.email
      FROM oauth_accounts JOIN users ON users.id = oauth_accounts.user_id
      WHERE oauth_accounts.provider = ? AND oauth_accounts.provider_user_id = ?
    `).get(providerName, identity.providerUserId);
    const now = new Date().toISOString();
    if (linked) {
      database.prepare("UPDATE oauth_accounts SET email = ?, updated_at = ? WHERE provider = ? AND provider_user_id = ?")
        .run(identity.email || null, now, providerName, identity.providerUserId);
      return { id: linked.id, username: linked.username, displayName: linked.displayName };
    }
    const existingByEmail = identity.email && identity.emailVerified
      ? database.prepare("SELECT id, username, display_name AS displayName, email FROM users WHERE email = ?").get(identity.email)
      : null;
    const user = existingByEmail || {
      id: createId(),
      username: uniqueOAuthUsername(providerName, identity),
      displayName: identity.displayName.slice(0, 48) || `Usuário ${providerName}`,
    };
    if (!existingByEmail) {
      database.prepare("INSERT INTO users (id, username, display_name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(user.id, user.username, user.displayName, identity.email || null, createPasswordHash(), now);
    } else if (identity.email && !existingByEmail.email) {
      database.prepare("UPDATE users SET email = ? WHERE id = ?").run(identity.email, existingByEmail.id);
    }
    database.prepare("INSERT INTO oauth_accounts (id, provider, provider_user_id, user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(createId(), providerName, identity.providerUserId, user.id, identity.email || null, now, now);
    return { id: user.id, username: user.username, displayName: user.displayName };
  }

  function linkOAuthAccount(providerName, identity, userId) {
    const target = database.prepare("SELECT id, username, display_name AS displayName, email FROM users WHERE id = ?").get(userId);
    if (!target) throw new Error("oauth-link-session-invalid");
    const existing = database.prepare("SELECT user_id AS userId FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?")
      .get(providerName, identity.providerUserId);
    if (existing && existing.userId !== userId) {
      mergeUsers(userId, existing.userId);
      return { merged: true, currentDisplayName: target.displayName, suggestedDisplayName: identity.displayName };
    }
    const now = new Date().toISOString();
    if (existing) {
      database.prepare("UPDATE oauth_accounts SET email = ?, updated_at = ? WHERE provider = ? AND provider_user_id = ?")
        .run(identity.email || null, now, providerName, identity.providerUserId);
      return { alreadyLinked: true, currentDisplayName: target.displayName, suggestedDisplayName: identity.displayName };
    }
    const emailOwner = identity.email && identity.emailVerified
      ? database.prepare("SELECT id FROM users WHERE email = ? AND id <> ?").get(identity.email, userId)
      : null;
    if (emailOwner) throw new Error("oauth-email-linked-other-account");
    database.prepare("INSERT INTO oauth_accounts (id, provider, provider_user_id, user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(createId(), providerName, identity.providerUserId, userId, identity.email || null, now, now);
    return { alreadyLinked: false, currentDisplayName: target.displayName, suggestedDisplayName: identity.displayName };
  }

  return { uniqueOAuthUsername, upsertOAuthUser, linkOAuthAccount };
}

export function createPostgresOAuthRepository(database, {
  slugFor,
  createPasswordHash,
  createId = randomUUID,
  createSuffix = () => randomBytes(4).toString("hex"),
  mergeUsers,
} = {}) {
  if (typeof slugFor !== "function") throw new Error("slugFor is required");
  if (typeof createPasswordHash !== "function") throw new Error("createPasswordHash is required");
  if (typeof mergeUsers !== "function") throw new Error("mergeUsers is required");

  async function uniqueOAuthUsername(providerName, identity) {
    const base = (slugFor(identity.usernameHint) || slugFor(identity.displayName) || providerName).slice(0, 24);
    let candidate = base.length >= 3 ? base : `${providerName}-${base}`.slice(0, 32);
    while ((await database.query("SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)", [candidate])).rowCount) {
      candidate = `${base.slice(0, 23)}-${createSuffix()}`.slice(0, 32);
    }
    return candidate;
  }

  async function upsertOAuthUser(providerName, identity) {
    const linkedResult = await database.query(`
      SELECT users.id, users.username, users.display_name AS "displayName", users.email
      FROM oauth_accounts JOIN users ON users.id = oauth_accounts.user_id
      WHERE oauth_accounts.provider = $1 AND oauth_accounts.provider_user_id = $2
    `, [providerName, identity.providerUserId]);
    const linked = linkedResult.rows[0];
    const now = new Date().toISOString();
    if (linked) {
      await database.query("UPDATE oauth_accounts SET email = $1, updated_at = $2 WHERE provider = $3 AND provider_user_id = $4", [identity.email || null, now, providerName, identity.providerUserId]);
      return { id: linked.id, username: linked.username, displayName: linked.displayName };
    }
    const existingByEmailResult = identity.email && identity.emailVerified
      ? await database.query("SELECT id, username, display_name AS \"displayName\", email FROM users WHERE email = $1", [identity.email])
      : { rows: [] };
    const existingByEmail = existingByEmailResult.rows[0];
    const user = existingByEmail || {
      id: createId(),
      username: await uniqueOAuthUsername(providerName, identity),
      displayName: identity.displayName.slice(0, 48) || `Usuário ${providerName}`,
    };
    if (!existingByEmail) {
      await database.query("INSERT INTO users (id, username, display_name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6)", [user.id, user.username, user.displayName, identity.email || null, createPasswordHash(), now]);
    } else if (identity.email && !existingByEmail.email) {
      await database.query("UPDATE users SET email = $1 WHERE id = $2", [identity.email, existingByEmail.id]);
    }
    await database.query("INSERT INTO oauth_accounts (id, provider, provider_user_id, user_id, email, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [createId(), providerName, identity.providerUserId, user.id, identity.email || null, now, now]);
    return { id: user.id, username: user.username, displayName: user.displayName };
  }

  async function linkOAuthAccount(providerName, identity, userId) {
    const targetResult = await database.query('SELECT id, username, display_name AS "displayName", email FROM users WHERE id = $1', [userId]);
    const target = targetResult.rows[0];
    if (!target) throw new Error("oauth-link-session-invalid");
    const existingResult = await database.query('SELECT user_id AS "userId" FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2', [providerName, identity.providerUserId]);
    const existing = existingResult.rows[0];
    if (existing && existing.userId !== userId) {
      await mergeUsers(userId, existing.userId);
      return { merged: true, currentDisplayName: target.displayName, suggestedDisplayName: identity.displayName };
    }
    const now = new Date().toISOString();
    if (existing) {
      await database.query("UPDATE oauth_accounts SET email = $1, updated_at = $2 WHERE provider = $3 AND provider_user_id = $4", [identity.email || null, now, providerName, identity.providerUserId]);
      return { alreadyLinked: true, currentDisplayName: target.displayName, suggestedDisplayName: identity.displayName };
    }
    const emailOwnerResult = identity.email && identity.emailVerified
      ? await database.query("SELECT id FROM users WHERE email = $1 AND id <> $2", [identity.email, userId])
      : { rows: [] };
    if (emailOwnerResult.rows[0]) throw new Error("oauth-email-linked-other-account");
    await database.query("INSERT INTO oauth_accounts (id, provider, provider_user_id, user_id, email, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [createId(), providerName, identity.providerUserId, userId, identity.email || null, now, now]);
    return { alreadyLinked: false, currentDisplayName: target.displayName, suggestedDisplayName: identity.displayName };
  }

  return { uniqueOAuthUsername, upsertOAuthUser, linkOAuthAccount };
}
