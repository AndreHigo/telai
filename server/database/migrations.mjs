import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function applyPostgresMigrations(pool, { migrationsDir = new URL("./migrations/", import.meta.url) } = {}) {
  const client = await pool.connect();
  let lockAcquired = false;
  const lockName = "telai:postgres:migrations";
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [lockName]);
    lockAcquired = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS telai_schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const directory = migrationsDir instanceof URL ? fileURLToPath(migrationsDir) : migrationsDir;
    const files = (await fs.readdir(directory))
      .filter((file) => /^\d+_.+\.sql$/i.test(file))
      .sort();
    const applied = new Set((await client.query("SELECT version FROM telai_schema_migrations ORDER BY version")).rows.map((row) => row.version));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await fs.readFile(path.join(directory, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO telai_schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(`PostgreSQL migration ${file} failed: ${error.message}`, { cause: error });
      }
    }

    return files;
  } finally {
    if (lockAcquired) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockName]).catch(() => {});
    client.release();
  }
}
