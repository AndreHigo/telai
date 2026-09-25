import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFilePath = path.join(repoRoot, "deploy", ".env.postgres");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo ${path.relative(repoRoot, filePath)} não encontrado. Copie o .env.postgres.example e configure o PostgreSQL local.`);
  }
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!Object.hasOwn(process.env, key)) process.env[key] = value;
  }
}

loadEnvFile(envFilePath);
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
