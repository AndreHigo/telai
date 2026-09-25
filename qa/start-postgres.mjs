import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadPostgresEnv } from "./postgres-env.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadPostgresEnv({ rootDirectory: repoRoot, required: true });
if (process.env.TELAI_DATABASE_DRIVER !== "postgres") {
  throw new Error("O start:postgres exige TELAI_DATABASE_DRIVER=postgres no ambiente local.");
}

const { createDatabaseConfig } = await import("../server/config/database.mjs");
const { applyPostgresMigrations } = await import("../server/database/migrations.mjs");
const { createPostgresPool } = await import("../server/repositories/postgres.mjs");
const databaseConfig = createDatabaseConfig();
const pool = createPostgresPool(databaseConfig);
try {
  const migrations = await applyPostgresMigrations(pool);
  console.log(JSON.stringify({ ok: true, databaseDriver: "postgres", migrations }));
} finally {
  await pool.end();
}

const child = spawn(process.execPath, [path.join(repoRoot, "server.mjs")], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

function forwardSignal(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = typeof code === "number" ? code : 1;
  if (signal) process.exitCode = 1;
});
