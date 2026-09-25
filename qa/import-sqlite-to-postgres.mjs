import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabaseConfig } from "../server/config/database.mjs";
import { inspectSqliteDatabase, importSqliteToPostgres, openSqliteReadOnly } from "../server/database/import-sqlite.mjs";
import { createPostgresPool } from "../server/repositories/postgres.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sqlitePath = process.env.MIRANTE_DB_PATH || path.join(rootDir, "data", "mirante-tv.sqlite");
const sqlite = openSqliteReadOnly(sqlitePath);
const plan = inspectSqliteDatabase(sqlite);
sqlite.close();

if (process.argv.includes("--plan")) {
  console.log(JSON.stringify({ ok: true, mode: "plan", sqlitePath, tables: plan }, null, 2));
  process.exit(0);
}

const config = createDatabaseConfig();
if (config.driver !== "postgres") throw new Error("Set TELAI_DATABASE_DRIVER=postgres before importing.");
const pool = createPostgresPool(config);
try {
  const report = await importSqliteToPostgres({ sqlitePath, pool });
  console.log(JSON.stringify({ ok: true, mode: "import", sqlitePath, report }, null, 2));
} finally {
  await pool.end();
}
