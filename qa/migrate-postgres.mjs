import { createDatabaseConfig } from "../server/config/database.mjs";
import { applyPostgresMigrations } from "../server/database/migrations.mjs";
import { createPostgresPool } from "../server/repositories/postgres.mjs";

const config = createDatabaseConfig();
if (config.driver !== "postgres") throw new Error("Set TELAI_DATABASE_DRIVER=postgres before running migrations.");
const pool = createPostgresPool(config);
try {
  const migrations = await applyPostgresMigrations(pool);
  console.log(JSON.stringify({ ok: true, migrations }));
} finally {
  await pool.end();
}
