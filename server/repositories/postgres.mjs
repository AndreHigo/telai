import pg from "pg";

const { Pool } = pg;

export function createPostgresPool({ connectionString, max = 10, ssl = false } = {}) {
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL");
  return new Pool({
    connectionString,
    max,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    application_name: "telai",
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

export async function checkPostgresConnection(pool) {
  const result = await pool.query("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
