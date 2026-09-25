import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgresTestEnv from "./postgres-test-env.cjs";
import { createDatabaseConfig } from "../server/config/database.mjs";
import { applyPostgresMigrations } from "../server/database/migrations.mjs";
import { createPostgresPool } from "../server/repositories/postgres.mjs";

postgresTestEnv.loadPostgresTestEnv();
const config = createDatabaseConfig();
if (config.driver !== "postgres") throw new Error("PostgreSQL driver is required for migration concurrency tests.");

const version = `999_qa_migration_lock_${process.pid}_${randomUUID().replaceAll("-", "")}.sql`;
const tableName = `qa_migration_lock_${process.pid}_${randomUUID().replaceAll("-", "")}`;
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "telai-postgres-migration-lock-"));
const migrationPath = path.join(temporaryDirectory, version);
await fs.writeFile(migrationPath, `CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY);\n`, "utf8");

const firstPool = createPostgresPool(config);
const secondPool = createPostgresPool(config);
try {
  const [first, second] = await Promise.all([
    applyPostgresMigrations(firstPool, { migrationsDir: temporaryDirectory }),
    applyPostgresMigrations(secondPool, { migrationsDir: temporaryDirectory }),
  ]);
  assert.deepEqual(first, [version]);
  assert.deepEqual(second, [version]);
  assert.equal((await firstPool.query(`SELECT to_regclass($1) AS name`, [tableName])).rows[0].name, tableName);
  assert.equal((await firstPool.query("SELECT COUNT(*)::int AS count FROM telai_schema_migrations WHERE version = $1", [version])).rows[0].count, 1);
  console.log(JSON.stringify({ ok: true, concurrentCalls: 2, appliedRows: 1 }));
} finally {
  await firstPool.query(`DROP TABLE IF EXISTS ${tableName}`).catch(() => {});
  await firstPool.query("DELETE FROM telai_schema_migrations WHERE version = $1", [version]).catch(() => {});
  await Promise.all([firstPool.end(), secondPool.end()]);
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
