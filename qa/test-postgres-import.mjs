import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import postgresTestEnv from "./postgres-test-env.cjs";
import { createDatabaseConfig } from "../server/config/database.mjs";
import { SQLITE_SCHEMA } from "../server/database/sqlite-schema.mjs";
import { importSqliteToPostgres } from "../server/database/import-sqlite.mjs";
import { createPostgresPool } from "../server/repositories/postgres.mjs";

postgresTestEnv.loadPostgresTestEnv();
const config = createDatabaseConfig();
if (config.driver !== "postgres") throw new Error("Set TELAI_DATABASE_DRIVER=postgres before testing the import.");

const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "telai-postgres-import-"));
const sqlitePath = path.join(temporaryDirectory, "source.sqlite");
const ids = { user: randomUUID(), group: randomUUID() };
const now = new Date().toISOString();
const sqlite = new DatabaseSync(sqlitePath);
sqlite.exec(SQLITE_SCHEMA);
sqlite.prepare("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
  .run(ids.user, `import-${ids.user.slice(0, 8)}`, "Import QA", "test", now);
sqlite.prepare("INSERT INTO groups (id, name, slug, owner_id, created_at) VALUES (?, ?, ?, ?, ?)")
  .run(ids.group, "Import QA Group", `import-${ids.group}`, ids.user, now);
sqlite.prepare("INSERT INTO group_members (group_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)")
  .run(ids.group, ids.user, now);
sqlite.close();

const pool = createPostgresPool(config);
try {
  const first = await importSqliteToPostgres({ sqlitePath, pool });
  assert.equal(first.find((item) => item.table === "users")?.importedRows, 1);
  assert.equal(first.find((item) => item.table === "groups")?.importedRows, 1);
  assert.equal(first.find((item) => item.table === "group_members")?.importedRows, 1);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE id = $1", [ids.user])).rows[0].count, 1);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM groups WHERE id = $1", [ids.group])).rows[0].count, 1);

  const second = await importSqliteToPostgres({ sqlitePath, pool });
  assert.equal(second.find((item) => item.table === "users")?.importedRows, 0);
  assert.equal(second.find((item) => item.table === "groups")?.importedRows, 0);
  assert.equal(second.find((item) => item.table === "group_members")?.importedRows, 0);
  console.log(JSON.stringify({ ok: true, idempotent: true, imported: ["users", "groups", "group_members"] }));
} finally {
  await pool.query("DELETE FROM group_members WHERE group_id = $1", [ids.group]).catch(() => {});
  await pool.query("DELETE FROM groups WHERE id = $1", [ids.group]).catch(() => {});
  await pool.query("DELETE FROM users WHERE id = $1", [ids.user]).catch(() => {});
  await pool.end();
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
